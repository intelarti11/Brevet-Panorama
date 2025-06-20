
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {z} from "zod";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";

// Initialiser Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e: unknown) {
  functions.logger.error("Admin init err", e);
}

const db = admin.firestore();

// --- Schémas Zod pour la validation des données d'entrée ---

const invitationRequestDataSchema = z.object({
  email: z.string().email({message: "E-mail invalide."})
    .regex(
      /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/,
      {message: "E-mail prenom.nom@ac-montpellier.fr requis."}
    ),
});
type InvitationRequestData = z.infer<typeof invitationRequestDataSchema>;

const manageInvitationDataSchema = z.object({
  email: z.string().email({message: "E-mail invalide."}),
});
type ManageInvitationData = z.infer<typeof manageInvitationDataSchema>;

const rejectInvitationDataSchema = manageInvitationDataSchema.extend({
  reason: z.string().optional().describe("Raison optionnelle."),
});
type RejectInvitationData = z.infer<typeof rejectInvitationDataSchema>;

const setAdminRoleDataSchema = z.object({
  email: z.string().email("E-mail invalide.").optional(),
  uid: z.string().min(1, "UID requis si e-mail non fourni.").optional(),
}).refine((data) => data.email || data.uid, {
  message: "E-mail ou UID requis.",
  path: ["email"],
});
type SetAdminRoleData = z.infer<typeof setAdminRoleDataSchema>;


/**
 * Enregistre une nouvelle demande d'invitation.
 * App Check est appliqué.
 */
export const requestInvitation = onCall(
  {region: "europe-west1", enforceAppCheck: true},
  async (request: CallableRequest<InvitationRequestData>) => {
    functions.logger.info("Nouv. demande invit:", request.data);

    try {
      const validationResult = invitationRequestDataSchema.safeParse(request.data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        const errorMsg = "Data invalides: " +
          flatErrors.formErrors.join(", ");
        functions.logger.error("Valid. échouée (req):", flatErrors);
        throw new HttpsError("invalid-argument", errorMsg.slice(0, 70));
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
          throw new HttpsError("already-exists", "Compte existant.");
        }
        if (existingRequest.status === "pending") {
          throw new HttpsError("already-exists", "Demande en cours.");
        }
        // Réutilise une demande rejetée
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

        functions.logger.info(`Demande MAJ attente: ${lowerEmail}`);
        return {success: true, message: "Votre demande a été soumise."};
      }

      // Nouvelle demande
      await db.collection("invitationRequests").add({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Demande enregistrée: ${lowerEmail}`);
      return {success: true, message: "Demande d'invitation soumise."};
    } catch (error: unknown) {
      functions.logger.error("Err requestInv:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      let errMsg = "Echec demande.";
      if (error instanceof Error) errMsg = error.message.slice(0, 20);
      throw new HttpsError("internal", errMsg);
    }
  }
);

/**
 * Approuve une demande et crée un user Firebase Auth. Admin requis.
 */
export const approveInvitation = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<ManageInvitationData>) => {
    functions.logger.info("Approbation invit:", request.data);

    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Accès non-autorisé (approve).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    functions.logger.info(`Approve: admin OK. UID: ${adminUid}`);

    try {
      const validationResult = manageInvitationDataSchema.safeParse(request.data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        functions.logger.error("Valid. échouée (approve):", flatErrors);
        throw new HttpsError("invalid-argument", "Données invalides.");
      }

      const {email} = validationResult.data;
      const lowerEmail = email.toLowerCase();

      const requestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (requestQuery.empty) {
        const msg = `Aucune demande: ${lowerEmail}.`;
        throw new HttpsError("not-found", msg.slice(0, 70));
      }

      const invitationDoc = requestQuery.docs[0];
      let userRecord;

      // Création de l'utilisateur dans Firebase Authentication
      try {
        userRecord = await admin.auth().createUser({
          email: lowerEmail,
          emailVerified: false,
          disabled: false,
        });
        functions.logger.info(`User créé: ${userRecord.uid}, ${lowerEmail}`);
      } catch (authError: unknown) {
        let code = "unknown";
        if (
          typeof authError === "object" && authError !== null &&
          "code" in authError &&
          typeof (authError as {code: string}).code === "string"
        ) {
          code = (authError as {code: string}).code;
        }

        if (code === "auth/email-already-exists") {
          functions.logger.warn("Approb. e-mail existant:", lowerEmail);
          let existingUser;
          try {
            existingUser = await admin.auth().getUserByEmail(lowerEmail);
          } catch (getUserError: unknown) {
            let msg = "Err vérif user.";
            if (getUserError instanceof Error) msg = getUserError.message;
            functions.logger.error("Err getUser:", getUserError);
            throw new HttpsError("internal", msg.slice(0, 15));
          }

          // Mise à jour statut Firestore pour utilisateur existant
          await db.collection("invitationRequests")
            .doc(invitationDoc.id).update({
              status: "approved",
              approvedAt: admin.firestore.FieldValue.serverTimestamp(),
              approvedBy: adminUid,
              authUid: existingUser.uid,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          return {
            success: true,
            message: `User ${lowerEmail} existe. Demande ok.`,
          };
        }
        // Autre erreur Auth
        functions.logger.error("Auth create e:", authError);
        let errMsg = "Err creat user";
        if (authError instanceof Error) errMsg = authError.message;
        const finalErrMsg = errMsg.slice(0, 15); // Shortened
        throw new HttpsError("internal", finalErrMsg);
      }

      // Mise à jour statut Firestore
      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminUid,
        authUid: userRecord.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Invit. ok, user créé: ${lowerEmail}`);
      return {
        success: true,
        message: `Invit. ${lowerEmail} ok. MDP via 'Oublié?'.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Err approveInv:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      let errMsg = "Echec approb.";
      if (error instanceof Error) errMsg = error.message.slice(0, 15);
      throw new HttpsError("internal", errMsg);
    }
  }
);

/**
 * Rejette une demande d'invitation. Admin requis.
 */
export const rejectInvitation = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<RejectInvitationData>) => {
    functions.logger.info("Rejet invit:", request.data);

    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Accès non-autorisé (reject).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    functions.logger.info(`Reject: admin OK. UID: ${adminUid}`);

    try {
      const validationResult = rejectInvitationDataSchema.safeParse(request.data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        functions.logger.error("Valid. échouée (reject):", flatErrors);
        throw new HttpsError("invalid-argument", "Données invalides.");
      }

      const {email, reason} = validationResult.data;
      const lowerEmail = email.toLowerCase();

      const requestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (requestQuery.empty) {
        const msg = `Aucune demande: ${lowerEmail}.`;
        throw new HttpsError("not-found", msg.slice(0, 70));
      }

      const invitationDoc = requestQuery.docs[0];

      // Mise à jour statut Firestore
      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: adminUid,
        rejectionReason: reason || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Invitation rejetée: ${lowerEmail}`);
      return {
        success: true,
        message: `Invitation pour ${lowerEmail} rejetée.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Err rejectInv:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      let errMsg = "Echec rejet.";
      if (error instanceof Error) errMsg = error.message.slice(0, 20);
      throw new HttpsError("internal", errMsg);
    }
  }
);

/**
 * Liste invitations en attente. Admin requis.
 */
export const listPendingInvitations = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<void>) => {
    functions.logger.info("Listage invitations en attente.");

    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Accès non-autorisé (listPending).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    functions.logger.info("ListPending: admin OK.");
    if (request.auth?.uid) {
      functions.logger.info("Admin UID:", request.auth.uid);
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
      functions.logger.error("Err listPending:", error);
      let errMsg = "Echec liste invit.";
      if (error instanceof Error) errMsg = error.message.slice(0, 20);
      throw new HttpsError("internal", errMsg);
    }
  }
);


/**
 * Attribue le rôle d'admin. Nécessite que l'appelant soit admin.
 */
export const setAdminRole = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<SetAdminRoleData>) => {
    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Accès non-autorisé (setAdminRole).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const callingAdminUid = request.auth.uid;
    functions.logger.info(
      `SetAdmin par: ${callingAdminUid}`, {data: request.data}
    );

    try {
      const validationResult = setAdminRoleDataSchema.safeParse(request.data);
      if (!validationResult.success) {
        const flatErrors = validationResult.error.flatten();
        functions.logger.error("Err setAdmin valid:", flatErrors);
        throw new HttpsError("invalid-argument", "Err. données.");
      }
      const {email, uid: providedUid} = validationResult.data;
      let targetUid = providedUid;

      if (email && !targetUid) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (e: unknown) {
          let msg = "Err récup user.";
          if (e instanceof Error) msg = e.message.slice(0, 15);
          functions.logger.error(`Err getUserByEmail ${email}:`, e);
          throw new HttpsError("not-found", msg);
        }
      }

      if (!targetUid) {
        throw new HttpsError("not-found", "User non trouvé.");
      }

      await admin.auth().setCustomUserClaims(targetUid, {admin: true});
      functions.logger.info(`Rôle admin pour: ${targetUid}`);
      const targetIdentifier = email || targetUid;
      return {
        success: true,
        message: `Rôle admin pour ${targetIdentifier}.`,
      };
    } catch (error: unknown) {
      functions.logger.error("Err setAdminRole:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      let errMsg = "Echec rôle admin.";
      if (error instanceof Error) errMsg = error.message.slice(0, 20);
      throw new HttpsError("internal", errMsg);
    }
  }
);
