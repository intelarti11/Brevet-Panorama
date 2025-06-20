
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
  console.log("Firebase Admin SDK initialized successfully.");
} catch (e: unknown) {
  // Utiliser console.error pour une journalisation plus standard
  console.error("Firebase Admin SDK initialization error:", e);
  // Il pourrait être judicieux de relancer l'erreur ou de gérer cet état critique
  // si l'application ne peut pas fonctionner sans admin SDK.
}

const db = admin.firestore();
if (!db) {
  console.error("Firestore database instance is undefined after admin.initializeApp(). This is critical.");
}

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
    console.info("Nouv. demande invit:", request.data);

    try {
      const validResult = invitationRequestDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("Valid. échouée (requestInv):", flatErrors);
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

        console.info(`Demande MAJ: ${lowerEmail}`);
        return {success: true, message: "Votre demande a été soumise."};
      }

      await db.collection("invitationRequests").add({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.info(`Demande enregistrée: ${lowerEmail}`);
      return {success: true, message: "Demande d'invitation soumise."};
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec demande. Verif logs.";

      if (error instanceof HttpsError) {
        console.error(
          `Err reqInv (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "Err reqInv (Error):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        console.error(
            "Err reqInv (unknown):",
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
    console.info("Approbation invit:", request.data);

    if (!request.auth || !request.auth.token.admin) {
      console.error("Acces non-autorise (approve).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    console.info(`Approve: admin OK. UID: ${adminUid}`);

    try {
      const validResult = manageInvitationDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("Valid. échouée (approveInv):", flatErrors);
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
        console.info(`User cree: ${userRecord.uid}`);
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
          console.warn("Approb. e-mail existant:", lowerEmail);
          let existingUser;
          try {
            existingUser = await admin.auth().getUserByEmail(lowerEmail);
          } catch (getUserError: unknown) {
            console.error("Err getUser (approveInv):", getUserError);
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
        console.error("Auth create err (approveInv):", authError);
        throw new HttpsError("internal", "Err create user.");
      }

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminUid,
        authUid: userRecord.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.info(`Invit. ok, user cree: ${lowerEmail}`);
      return {
        success: true,
        message: `Invit. ${lowerEmail} ok. MDP via 'Oublie?'.`,
      };
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec approbation. Verif logs.";

      if (error instanceof HttpsError) {
        console.error(
          `Err apprInv (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "Err apprInv (Error):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        console.error(
            "Err apprInv (unknown):",
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
    console.info("Rejet invit:", request.data);

    if (!request.auth || !request.auth.token.admin) {
      console.error("Acces non-autorise (reject).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    console.info(`Reject: admin OK. UID: ${adminUid}`);

    try {
      const validResult = rejectInvitationDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("Valid. échouée (rejectInv):", flatErrors);
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

      console.info(`Invitation rejetee: ${lowerEmail}`);
      return {
        success: true,
        message: `Invitation pour ${lowerEmail} rejetee.`,
      };
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec rejet. Verif logs.";

      if (error instanceof HttpsError) {
        console.error(
          `Err rejInv (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "Err rejInv (Error):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        console.error(
            "Err rejInv (unknown):",
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
    console.info("Listage invitations en attente.");

    if (!request.auth || !request.auth.token.admin) {
      console.error("Acces non-autorise (listPending).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    console.info("ListPending: admin OK.");
    if (request.auth?.uid) {
      console.info("Admin UID:", request.auth.uid);
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
      let code: typeof HttpsError.prototype.code = "internal";
      const message = "Echec liste. Verif logs.";

      if (error instanceof HttpsError) {
        console.error(
          `Err listPend (HttpsError ${error.code}):`,
          {message: error.message, details: error.details}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "Err listPend (Error):",
          {name: error.name, message: error.message, stack: error.stack}
        );
      } else {
        console.error(
            "Err listPend (unknown):",
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
      console.error("Acces non-autorise (setAdminRole).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const callingAdminUid = request.auth.uid;
    console.info(
      `SetAdmin par: ${callingAdminUid}`, {data: request.data}
    );

    try {
      const validResult = setAdminRoleDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("Err setAdmin valid:", flatErrors);
        throw new HttpsError("invalid-argument", "Err. donnees.");
      }
      const {email, uid: providedUid} = validResult.data;
      let targetUid = providedUid;

      if (email && !targetUid) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (e: unknown) {
          console.error(`Err getUserByEmail ${email}:`, e);
          throw new HttpsError("not-found", "Err recup user.");
        }
      }

      if (!targetUid) {
        throw new HttpsError("not-found", "User non trouve.");
      }

      await admin.auth().setCustomUserClaims(targetUid, {admin: true});
      console.info(`Role admin pour: ${targetUid}`);
      const targetIdentifier = email || targetUid;
      return {
        success: true,
        message: `Role admin pour ${targetIdentifier}.`,
      };
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec role admin. Verif logs.";

      if (error instanceof HttpsError) {
        console.error(
          `Err setAdmin (HttpsError ${error.code}):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "Err setAdmin (Error):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        }
      } else {
        console.error(
            "Err setAdmin (unknown):",
            {errorObject: error, data: request.data}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);

console.log("Top-level script execution completed in functions/src/index.ts");
