
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {z} from "zod";
import {
  onCall,
  HttpsError,
  type CallableRequest,
} from "firebase-functions/v2/https";

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
  uid: z.string().min(1, "UID requis.").optional(),
}).refine((data) => data.email || data.uid, {
  message: "E-mail ou UID requis.",
  path: ["email"],
});
type SetAdminRoleData = z.infer<typeof setAdminRoleDataSchema>;


export const requestInvitation = onCall(
  {region: "europe-west1", enforceAppCheck: true},
  async (request: CallableRequest<InvitationRequestData>) => {
    functions.logger.info("Nouv. demande invit:", request.data);

    try {
      const validResult = invitationRequestDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        functions.logger.error("Valid. échouée (requestInv):", flatErrors);
        throw new HttpsError("invalid-argument", "Donnees invalides.");
      }

      const {email} = validResult.data;
      const lowerEmail = email.toLowerCase();

      const existReqQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .limit(1)
        .get();

      if (!existReqQuery.empty) {
        const exReq = existReqQuery.docs[0].data();
        if (exReq.status === "approved") {
          throw new HttpsError("already-exists", "Compte existant.");
        }
        if (exReq.status === "pending") {
          throw new HttpsError("already-exists", "Demande en cours.");
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

        functions.logger.info(`Demande MAJ: ${lowerEmail}`);
        return {success: true, message: "Votre demande a été soumise."};
      }

      await db.collection("invitationRequests").add({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Demande enregistrée: ${lowerEmail}`);
      return {success: true, message: "Demande d'invitation soumise."};
    } catch (error: unknown) {
      let code: functions.https.FunctionsErrorCode = "internal";
      let message = "Echec demande. Verif logs.";

      if (error instanceof HttpsError) {
        functions.logger.error(
          `Err requestInv (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        functions.logger.error(
          "Err requestInv (Error instance):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        functions.logger.error(
            "Err requestInv (type inconnu):",
            {errorObject: error, data: request.data}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);

export const approveInvitation = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<ManageInvitationData>) => {
    functions.logger.info("Approbation invit:", request.data);

    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Acces non-autorise (approve).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    functions.logger.info(`Approve: admin OK. UID: ${adminUid}`);

    try {
      const validResult = manageInvitationDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        functions.logger.error("Valid. échouée (approveInv):", flatErrors);
        throw new HttpsError("invalid-argument", "Donnees invalides.");
      }

      const {email} = validResult.data;
      const lowerEmail = email.toLowerCase();

      const requestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (requestQuery.empty) {
        throw new HttpsError("not-found", `Aucune demande: ${lowerEmail}.`);
      }

      const invitationDoc = requestQuery.docs[0];
      let userRecord;

      try {
        userRecord = await admin.auth().createUser({
          email: lowerEmail,
          emailVerified: false,
          disabled: false,
        });
        functions.logger.info(`User cree: ${userRecord.uid}`);
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
            functions.logger.error("Err getUser (approveInv):", getUserError);
            throw new HttpsError("internal", "Err verif user.");
          }

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
        functions.logger.error("Auth create err (approveInv):", authError);
        throw new HttpsError("internal", "Err create user.");
      }

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminUid,
        authUid: userRecord.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Invit. ok, user cree: ${lowerEmail}`);
      return {
        success: true,
        message: `Invit. ${lowerEmail} ok. MDP via 'Oublie?'.`,
      };
    } catch (error: unknown) {
      let code: functions.https.FunctionsErrorCode = "internal";
      let message = "Echec approbation. Verif logs.";

      if (error instanceof HttpsError) {
        functions.logger.error(
          `Err approveInv (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        functions.logger.error(
          "Err approveInv (Error instance):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        functions.logger.error(
            "Err approveInv (type inconnu):",
            {errorObject: error, data: request.data}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);

export const rejectInvitation = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<RejectInvitationData>) => {
    functions.logger.info("Rejet invit:", request.data);

    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Acces non-autorise (reject).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    functions.logger.info(`Reject: admin OK. UID: ${adminUid}`);

    try {
      const validResult = rejectInvitationDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        functions.logger.error("Valid. échouée (rejectInv):", flatErrors);
        throw new HttpsError("invalid-argument", "Donnees invalides.");
      }

      const {email, reason} = validResult.data;
      const lowerEmail = email.toLowerCase();

      const requestQuery = await db.collection("invitationRequests")
        .where("email", "==", lowerEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (requestQuery.empty) {
        throw new HttpsError("not-found", `Aucune demande: ${lowerEmail}.`);
      }

      const invitationDoc = requestQuery.docs[0];

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: adminUid,
        rejectionReason: reason || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Invitation rejetee: ${lowerEmail}`);
      return {
        success: true,
        message: `Invitation pour ${lowerEmail} rejetee.`,
      };
    } catch (error: unknown) {
      let code: functions.https.FunctionsErrorCode = "internal";
      let message = "Echec rejet. Verif logs.";

      if (error instanceof HttpsError) {
        functions.logger.error(
          `Err rejectInv (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        functions.logger.error(
          "Err rejectInv (Error instance):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        functions.logger.error(
            "Err rejectInv (type inconnu):",
            {errorObject: error, data: request.data}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);

export const listPendingInvitations = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<void>) => {
    functions.logger.info("Listage invitations en attente.");

    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Acces non-autorise (listPending).");
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
      let code: functions.https.FunctionsErrorCode = "internal";
      const message = "Echec liste. Verif logs.";

      if (error instanceof HttpsError) {
        functions.logger.error(
          `Err listPend (HttpsError ${error.code}):`,
          {message: error.message, details: error.details}
        );
        throw error;
      } else if (error instanceof Error) {
        functions.logger.error(
          "Err listPend (Error instance):",
          {name: error.name, message: error.message, stack: error.stack}
        );
      } else {
        functions.logger.error(
            "Err listPend (type inconnu):",
            {errorObject: error}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);


export const setAdminRole = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<SetAdminRoleData>) => {
    if (!request.auth || !request.auth.token.admin) {
      functions.logger.error("Acces non-autorise (setAdminRole).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const callingAdminUid = request.auth.uid;
    functions.logger.info(
      `SetAdmin par: ${callingAdminUid}`, {data: request.data}
    );

    try {
      const validResult = setAdminRoleDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        functions.logger.error("Err setAdmin valid:", flatErrors);
        throw new HttpsError("invalid-argument", "Err. donnees.");
      }
      const {email, uid: providedUid} = validResult.data;
      let targetUid = providedUid;

      if (email && !targetUid) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (e: unknown) {
          functions.logger.error(`Err getUserByEmail ${email}:`, e);
          throw new HttpsError("not-found", "Err recup user.");
        }
      }

      if (!targetUid) {
        throw new HttpsError("not-found", "User non trouve.");
      }

      await admin.auth().setCustomUserClaims(targetUid, {admin: true});
      functions.logger.info(`Role admin pour: ${targetUid}`);
      const targetIdentifier = email || targetUid;
      return {
        success: true,
        message: `Role admin pour ${targetIdentifier}.`,
      };
    } catch (error: unknown) {
      let code: functions.https.FunctionsErrorCode = "internal";
      let message = "Echec role admin. Verif logs.";

      if (error instanceof HttpsError) {
        functions.logger.error(
          `Err setAdmin (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        functions.logger.error(
          "Err setAdmin (Error instance):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        functions.logger.error(
            "Err setAdmin (type inconnu):",
            {errorObject: error, data: request.data}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);
