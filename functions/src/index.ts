
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {z} from "zod";

// Initialiser Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e: unknown) {
  functions.logger.error("Firebase admin initialization error", e);
}

const db = admin.firestore();

// Schéma de validation pour les demandes d'invitation
const invitationRequestSchema = z.object({
  email: z.string().email({message: "Adresse e-mail invalide."})
    .regex(
      /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/,
      {message: "L'e-mail doit être au format prénom.nom@ac-montpellier.fr"}
    ),
});

// Schéma de validation pour l'approbation ou le rejet
const manageInvitationSchema = z.object({
  email: z.string().email({message: "Adresse e-mail invalide."}),
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
    functions.logger.info("Nouvelle demande d'invitation reçue:", data);

    // Vérification App Check (si activé et requis)
    if (context.app === undefined) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "La fonction doit être appelée depuis une app vérifiée par App Check."
      );
    }

    try {
      const validationResult = invitationRequestSchema.safeParse(data);
      if (!validationResult.success) {
        functions.logger.error(
          "Validation échouée pour requestInvitation:",
          validationResult.error.flatten()
        );
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Données invalides: " +
            validationResult.error.flatten().formErrors.join(", ")
        );
      }

      const {email} = validationResult.data;
      const lowerEmail = email.toLowerCase();

      // Vérifier si une demande existe déjà
      const existingRequestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .limit(1)
        .get();

      if (!existingRequestQuery.empty) {
        const existingRequest = existingRequestQuery.docs[0].data();
        if (existingRequest.status === "approved") {
          throw new functions.https.HttpsError(
            "already-exists",
            "Un compte existe déjà pour cet e-mail."
          );
        }
        if (existingRequest.status === "pending") {
          throw new functions.https.HttpsError(
            "already-exists",
            "Une demande d'invitation est déjà en cours pour cet e-mail."
          );
        }
        // Si rejetée, permettre une nouvelle demande en la remettant en attente
        await db.collection("invitationRequests")
          .doc(existingRequestQuery.docs[0].id).set({
            email: lowerEmail,
            status: "pending", // Remettre en attente
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Réinitialiser les champs de rejet/approbation
            rejectedAt: null,
            rejectedBy: null,
            rejectionReason: null,
            approvedAt: null,
            approvedBy: null,
            authUid: null,
          }, {merge: true});

        functions.logger.info(
          `Demande MAJ et remise en attente pour ${lowerEmail}`
        );
        return {
          success: true,
          message: "Votre demande a été soumise avec succès.",
        };
      }

      // Nouvelle demande
      await db.collection("invitationRequests").add({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(
        `Demande d'invitation enregistrée pour ${lowerEmail}`
      );
      return {
        success: true,
        message: "Votre demande d'invitation a été soumise avec succès.",
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans requestInvitation:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Erreur traitement de votre demande.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new functions.https.HttpsError("internal", errorMessage, error);
    }
  });

/**
 * Approuve une demande d'invitation et crée un utilisateur Firebase Auth.
 * APPEL ADMIN SEULEMENT via interface sécurisée.
 */
export const approveInvitation = functions.region("europe-west1")
  .https.onCall(async (data, context) => {
    functions.logger.info("Approbation d'invitation reçue:", data);

    // Vérification des droits d'administrateur - ESSENTIEL POUR LA SÉCURITÉ
    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non autorisé à approveInvitation:",
        context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin insuffisants."
      );
    }
    functions.logger.info(
      "Vérification admin réussie pour approveInvitation par",
      context.auth.uid
    );

    try {
      const validationResult = manageInvitationSchema.safeParse(data);
      if (!validationResult.success) {
        functions.logger.error(
          "Validation échouée pour approveInvitation:",
          validationResult.error.flatten()
        );
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Données invalides pour l'approbation."
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
          `Aucune demande en attente pour ${lowerEmail}.`
        );
      }

      const invitationDoc = requestQuery.docs[0];
      let userRecord;

      try {
        userRecord = await admin.auth().createUser({
          email: lowerEmail,
          emailVerified: false, // L'utilisateur devra vérifier son e-mail
          disabled: false,
        });
        functions.logger.info(
          "Utilisateur créé:",
          userRecord.uid,
          "pour email:",
          lowerEmail
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
          functions.logger.warn(
            "Tentative d'approbation pour un e-mail existant:",
            lowerEmail
          );
          let existingUser;
          try {
            existingUser = await admin.auth().getUserByEmail(lowerEmail);
          } catch (getUserError: unknown) {
            let msg = "Erreur vérification utilisateur existant.";
            if (getUserError instanceof Error) {
              msg = getUserError.message;
            }
            functions.logger.error(
              `Erreur récupération utilisateur ${lowerEmail}:`,
              getUserError
            );
            throw new functions.https.HttpsError("internal", msg, getUserError);
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
            message: `Utilisateur ${lowerEmail} existe déjà. ` +
                     "Demande marquée comme approuvée.",
          };
        }
        functions.logger.error(
          "Erreur création utilisateur Firebase Auth:",
          authError
        );
        let errorMessage = "Erreur création utilisateur.";
        if (authError instanceof Error) {
          errorMessage = authError.message;
        }
        throw new functions.https.HttpsError("internal", errorMessage, authError);
      }

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: context.auth.uid,
        authUid: userRecord.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(
        `Invitation approuvée et utilisateur créé pour ${lowerEmail}`
      );
      return {
        success: true,
        message: `Invitation pour ${lowerEmail} approuvée. ` +
                 "L'utilisateur peut définir son mot de passe via 'Oublié?'.",
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans approveInvitation:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Erreur lors de l'approbation.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new functions.https.HttpsError("internal", errorMessage, error);
    }
  });

/**
 * Rejette une demande d'invitation.
 * APPEL ADMIN SEULEMENT via interface sécurisée.
 */
export const rejectInvitation = functions.region("europe-west1")
  .https.onCall(async (data, context) => {
    functions.logger.info("Rejet d'invitation reçu:", data);

    // Vérification des droits d'administrateur - ESSENTIEL POUR LA SÉCURITÉ
    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non autorisé à rejectInvitation:",
        context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin insuffisants."
      );
    }
    functions.logger.info(
      "Vérification admin réussie pour rejectInvitation par",
      context.auth.uid
    );

    try {
      const validationResult = rejectInvitationSchema.safeParse(data);
      if (!validationResult.success) {
        functions.logger.error(
          "Validation échouée pour rejectInvitation:",
          validationResult.error.flatten()
        );
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Données invalides pour le rejet."
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
          `Aucune demande en attente trouvée pour ${lowerEmail}.`
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
        message: `L'invitation pour ${lowerEmail} a été rejetée.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Erreur dans rejectInvitation:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      let errorMessage = "Erreur lors du rejet.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new functions.https.HttpsError("internal", errorMessage, error);
    }
  });

/**
 * Liste les demandes d'invitation en attente.
 * APPEL ADMIN SEULEMENT via interface sécurisée.
 */
export const listPendingInvitations = functions.region("europe-west1")
  .https.onCall(async (_data, context) => {
    functions.logger.info("Demande de listage des invitations en attente.");

    // Vérification des droits d'administrateur - ESSENTIEL POUR LA SÉCURITÉ
    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non autorisé à listPendingInvitations:",
        context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin insuffisants."
      );
    }
    functions.logger.info(
      "Vérification admin réussie pour listPendingInvitations par",
      context.auth.uid
    );

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
        return {
          id: doc.id,
          email: docData.email,
          requestedAt: docData.requestedAt?.toDate?.()?.toISOString() ||
                       new Date(0).toISOString(),
          status: docData.status,
        };
      });

      return {success: true, invitations};
    } catch (error: unknown) {
      functions.logger.error("Erreur dans listPendingInvitations:", error);
      let errorMessage = "Erreur récupération des invitations.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new functions.https.HttpsError("internal", errorMessage, error);
    }
  });

const setAdminRoleSchema = z.object({
  email: z.string().email({message: "Adresse e-mail invalide."}).optional(),
  uid: z.string().min(1, "UID requis si e-mail non fourni.").optional(),
}).refine((inputData) => inputData.email || inputData.uid, {
  // Raccourcissement du message pour respecter max-len
  message: "E-mail ou UID utilisateur requis.",
  path: ["email"],
});
type SetAdminRoleInput = z.infer<typeof setAdminRoleSchema>;

export const setAdminRole = functions.region("europe-west1")
  .https.onCall(async (data: SetAdminRoleInput, context) => {
    // Verify admin privileges of the caller
    if (!context.auth || !context.auth.token || !context.auth.token.admin) {
      functions.logger.error(
        "Accès non autorisé à setAdminRole:",
        context.auth
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Droits admin insuffisants."
      );
    }
    const callingAdminUid = context.auth.uid;
    functions.logger.info(
      `Attribution rôle admin par: ${callingAdminUid}`,
      "data:",
      data
    );

    try {
      const validationResult = setAdminRoleSchema.safeParse(data);
      if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        const errorMsg = "Données invalides: " +
          errors.formErrors.join(", ");
        functions.logger.error("Validation échouée setAdminRole:", errors);
        throw new functions.https.HttpsError("invalid-argument", errorMsg);
      }
      const {email, uid: providedUid} = validationResult.data;
      let targetUid = providedUid;

      if (email && !targetUid) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (e: unknown) {
          let msg = "Erreur récupération utilisateur par e-mail.";
          if (e instanceof Error) {
            msg = e.message;
          }
          functions.logger.error(
            `Erreur getUserByEmail pour ${email}:`, e
          );
          throw new functions.https.HttpsError("internal", msg, e);
        }
      }

      if (!targetUid) {
        throw new functions.https.HttpsError(
          "not-found",
          "Utilisateur non trouvé avec les infos fournies."
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
      let errorMessage = "Erreur assignation rôle admin.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new functions.https.HttpsError(
        "internal",
        errorMessage,
        error
      );
    }
  });
