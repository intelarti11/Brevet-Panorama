
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {z} from "zod";

// Initialiser Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e: unknown) {
  functions.logger.error("Firebase admin init error", e);
}

const db = admin.firestore();

// Schéma de validation pour les demandes d'invitation
const invitationRequestSchema = z.object({
  email: z.string().email({message: "E-mail invalide."})
    .regex(
      /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/,
      {message: "L'e-mail doit être prenom.nom@ac-montpellier.fr"}
    ),
});

// Schéma de validation pour l'approbation ou le rejet
const manageInvitationSchema = z.object({
  email: z.string().email({message: "E-mail invalide."}),
});

const rejectInvitationSchema = manageInvitationSchema.extend({
  reason: z.string().optional().describe("Raison optionnelle du rejet."),
});

/**
 * Enregistre une nouvelle demande d'invitation.
 * Appelée par le frontend lors de la soumission du formulaire.
 */
export const requestInvitation = functions.region("europe-west1")
  .https.onCall(async (data, context) => {
    functions.logger.info("Nouvelle demande d'invitation:", data);

    if (context.app === undefined) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Appel depuis app vérifiée requis."
      );
    }

    try {
      const validationResult = invitationRequestSchema.safeParse(data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        const errorMsg = "Données invalides: " +
          flatErrors.formErrors.join(", ");
        functions.logger.error("Validation échouée (request):", flatErrors);
        throw new functions.https.HttpsError("invalid-argument", errorMsg);
      }

      const {email} = validationResult.data;
      const lowerEmail = email.toLowerCase();

      const existReqQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .limit(1)
        .get();

      if (!existReqQuery.empty) {
        const existingRequest = existReqQuery.docs[0].data();
        if (existingRequest.status === "approved") {
          throw new functions.https.HttpsError(
            "already-exists",
            "Compte existant pour cet e-mail."
          );
        }
        if (existingRequest.status === "pending") {
          throw new functions.https.HttpsError(
            "already-exists",
            "Demande en cours pour cet e-mail."
          );
        }
        await db.collection("invitationRequests")
          .doc(existReqQuery.docs[0].id).set({
            email: lowerEmail,
            status: "pending",
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectedAt: null,
            rejectedBy: null,
            rejectionReason: null,
            approvedAt: null,
            approvedBy: null,
            authUid: null,
          }, {merge: true});

        functions.logger.info(
          `Demande MAJ et remise en attente: ${lowerEmail}`
        );
        return {
          success: true,
          message: "Votre demande a été soumise.",
        };
      }

      await db.collection("invitationRequests").add({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Demande enregistrée pour ${lowerEmail}`);
      return {
        success: true,
        message: "Demande d'invitation soumise.",
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans requestInvitation:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Echec demande.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const finalErrorMsg = errorMessage.length > 70 ?
        errorMessage.substring(0, 67) + "..." : errorMessage;
      throw new functions.https.HttpsError("internal", finalErrorMsg, error);
    }
  });

/**
 * Approuve une demande d'invitation et crée un utilisateur Firebase Auth.
 * Vérifie si l'appelant a des droits d'administrateur.
 */
export const approveInvitation = functions.region("europe-west1")
  .https.onCall(async (data, context) => {
    functions.logger.info("Approbation d'invitation:", data);

    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non-autorisé (approve):", context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin requis."
      );
    }
    functions.logger.info(
      "approveInvitation: admin OK. UID:", context.auth.uid
    );

    try {
      const validationResult = manageInvitationSchema.safeParse(data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        functions.logger.error("Validation échouée (approve):", flatErrors);
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Données invalides pour approbation."
        );
      }

      const {email} = validationResult.data;
      const lowerEmail = email.toLowerCase();

      const requestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (requestQuery.empty) {
        throw new functions.https.HttpsError(
          "not-found",
          `Aucune demande en attente: ${lowerEmail}.`
        );
      }

      const invitationDoc = requestQuery.docs[0];
      let userRecord;

      try {
        userRecord = await admin.auth().createUser({
          email: lowerEmail,
          emailVerified: false,
          disabled: false,
        });
        functions.logger.info(
          "Utilisateur créé:", userRecord.uid, "pour:", lowerEmail
        );
      } catch (authError: unknown) {
        let code = "unknown";
        if (typeof authError === "object" &&
            authError !== null &&
            "code" in authError
        ) {
          code = (authError as {code: string}).code;
        }

        if (code === "auth/email-already-exists") {
          functions.logger.warn("Approbation e-mail existant:", lowerEmail);
          let existingUser;
          try {
            existingUser = await admin.auth().getUserByEmail(lowerEmail);
          } catch (getUserError: unknown) {
            let msg = "Erreur vérif. user existant.";
            if (getUserError instanceof Error) {
              msg = getUserError.message;
            }
            functions.logger.error("Err getUser:", {email: lowerEmail, getUserError});
            const finalMsg = msg.length > 60 ? msg.substring(0, 57) + "..." : msg;
            throw new functions.https.HttpsError("internal", finalMsg, getUserError);
          }

          await db.collection("invitationRequests")
            .doc(invitationDoc.id).update({
              status: "approved",
              approvedAt: admin.firestore.FieldValue.serverTimestamp(),
              approvedBy: context.auth?.uid || "unknown_admin",
              authUid: existingUser.uid,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          return {
            success: true,
            message: `User ${lowerEmail} existe. Demande approuvée.`,
          };
        }
        functions.logger.error("Erreur création user Auth:", authError);
        let errorMessage = "Erreur création user.";
        if (authError instanceof Error) {
          errorMessage = authError.message;
        }
        const finalErrorMsg = errorMessage.length > 60 ?
          errorMessage.substring(0, 57) + "..." : errorMessage;
        throw new functions.https.HttpsError("internal", finalErrorMsg, authError);
      }

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: context.auth.uid,
        authUid: userRecord.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(
        `Invit. approuvée, user créé pour ${lowerEmail}`
      );
      return {
        success: true,
        message: `Invit. ${lowerEmail} approuvée. MDP via 'Oublié?'.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans approveInvitation:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Echec approbation.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const finalErrorMsg = errorMessage.length > 60 ?
        errorMessage.substring(0, 57) + "..." : errorMessage;
      throw new functions.https.HttpsError("internal", finalErrorMsg, error);
    }
  });

/**
 * Rejette une demande d'invitation.
 * Vérifie si l'appelant a des droits d'administrateur.
 */
export const rejectInvitation = functions.region("europe-west1")
  .https.onCall(async (data, context) => {
    functions.logger.info("Rejet d'invitation:", data);

    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non-autorisé (reject):", context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin requis."
      );
    }
    functions.logger.info(
      "rejectInvitation: admin OK. UID:", context.auth.uid
    );

    try {
      const validationResult = rejectInvitationSchema.safeParse(data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        functions.logger.error("Validation échouée (reject):", flatErrors);
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Données invalides pour rejet."
        );
      }

      const {email, reason} = validationResult.data;
      const lowerEmail = email.toLowerCase();

      const requestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (requestQuery.empty) {
        throw new functions.https.HttpsError(
          "not-found",
          `Aucune demande en attente: ${lowerEmail}.`
        );
      }

      const invitationDoc = requestQuery.docs[0];

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: context.auth.uid,
        rejectionReason: reason || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Invitation rejetée pour ${lowerEmail}`);
      return {
        success: true,
        message: `Invitation pour ${lowerEmail} rejetée.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans rejectInvitation:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Echec rejet.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const finalErrorMsg = errorMessage.length > 60 ?
        errorMessage.substring(0, 57) + "..." : errorMessage;
      throw new functions.https.HttpsError("internal", finalErrorMsg, error);
    }
  });

/**
 * Liste invitations en attente.
 * Statut "pending". Admin requis.
 */
export const listPendingInvitations = functions.region("europe-west1")
  .https.onCall(async (_data, context) => {
    functions.logger.info("Listage des invitations en attente demandé.");

    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non-autorisé (listPending):",
        context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin requis."
      );
    }
    functions.logger.info("listPending: admin OK");
    if (context.auth?.uid) {
      functions.logger.info("Admin UID:", context.auth.uid);
    }


    try {
      const snapshot = await db.collection("invitationRequests")
        .where("status", "==", "pending")
        .orderBy("requestedAt", "desc")
        .get();

      if (snapshot.empty) {
        return {success: true, invitations: []};
      }

      const invitations = snapshot.docs.map((doc) => {
        const docData = doc.data();
        const requestedAtDate = docData.requestedAt?.toDate();
        const isoDate = requestedAtDate ?
          requestedAtDate.toISOString() : new Date(0).toISOString();
        return {
          id: doc.id,
          email: docData.email,
          requestedAt: isoDate,
          status: docData.status,
        };
      });

      return {success: true, invitations};
    } catch (error: unknown) {
      functions.logger.error("Erreur listPendingInvitations:", error);
      let errorMessage = "Echec liste invit.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const finalErrorMsg = errorMessage.length > 60 ?
        errorMessage.substring(0, 57) + "..." : errorMessage;
      throw new functions.https.HttpsError("internal", finalErrorMsg, error);
    }
  });

const setAdminRoleSchema = z.object({
  email: z.string().email({message: "E-mail invalide."}).optional(),
  uid: z.string().min(1, "UID requis si e-mail non fourni.").optional(),
}).refine((inputData) => inputData.email || inputData.uid, {
  message: "E-mail ou UID requis.", // Shortened
  path: ["email"],
});
type SetAdminRoleInput = z.infer<typeof setAdminRoleSchema>;

/**
 * Attribue le rôle d'admin.
 * Nécessite que l'appelant soit admin.
 */
export const setAdminRole = functions.region("europe-west1")
  .https.onCall(async (data: SetAdminRoleInput, context) => {
    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non-autorisé (setAdminRole):", context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin requis pour attribuer rôle." // Shortened
      );
    }
    const callingAdminUid = context.auth.uid;
    functions.logger.info(
      `Attribution rôle admin par: ${callingAdminUid}`, {data}
    );

    try {
      const validationResult = setAdminRoleSchema.safeParse(data);
      if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        const errorMsg = "Données invalides: " +
          errors.formErrors.join(", ");
        functions.logger.error("Validation échouée (setAdmin):", errors);
        throw new functions.https.HttpsError("invalid-argument", errorMsg);
      }
      const {email, uid: providedUid} = validationResult.data;
      let targetUid = providedUid;

      if (email && !targetUid) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (e: unknown) {
          let msg = "Erreur récup. user par e-mail.";
          if (e instanceof Error) {
            msg = e.message;
          }
          functions.logger.error(
            `Erreur getUserByEmail pour ${email}:`, e
          );
          const finalMsg = msg.length > 60 ? msg.substring(0, 57) + "..." : msg;
          throw new functions.https.HttpsError("internal", finalMsg, e);
        }
      }

      if (!targetUid) {
        throw new functions.https.HttpsError(
          "not-found",
          "User non trouvé avec infos fournies."
        );
      }

      await admin.auth().setCustomUserClaims(targetUid, {admin: true});
      functions.logger.info(`Rôle admin attribué à: ${targetUid}`);
      const targetIdentifier = email || targetUid;
      return {
        success: true,
        message: `Rôle admin attribué à ${targetIdentifier}.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans setAdminRole:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Echec rôle admin.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const finalErrorMsg = errorMessage.length > 60 ?
        errorMessage.substring(0, 57) + "..." : errorMessage;
      throw new functions.https.HttpsError("internal", finalErrorMsg, error);
    }
  });

