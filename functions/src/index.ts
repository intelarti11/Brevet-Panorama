
console.log("LOG_MARKER_A: Entered functions/src/index.ts (v5)");

import * as admin from "firebase-admin";
console.log("LOG_MARKER_B: Imported firebase-admin (v5)");

import {z} from "zod";
console.log("LOG_MARKER_C: Imported zod (v5)");

import {
  onCall,
  HttpsError,
  type CallableRequest,
} from "firebase-functions/v2/https";
console.log("LOG_MARKER_D: Imported firebase-functions/v2/https (v5)");


let db: admin.firestore.Firestore | undefined = undefined; // Explicitly allow undefined initially

try {
  console.log("LOG_MARKER_E: Attempting admin.initializeApp() (v5)");
  admin.initializeApp(); // Relies on GOOGLE_APPLICATION_CREDENTIALS or GCF environment
  console.log("LOG_MARKER_F: admin.initializeApp() succeeded (v5)");

  console.log("LOG_MARKER_G: Attempting admin.firestore() (v5)");
  db = admin.firestore();
  console.log("LOG_MARKER_H: admin.firestore() succeeded (v5)");

  if (!db) {
    console.error("CRITICAL_ERROR_DB_UNDEFINED: Firestore db object is undefined after initialization! (v5)");
    // This specific error should be caught by the main catch block below if thrown.
    throw new Error("Firestore db object is undefined after initialization! (v5)");
  }
  console.log("LOG_MARKER_I: Firestore db object is valid (v5)");

} catch (error: any) {
  const errorMessage = error && error.message ? error.message : "Unknown error during initialization";
  const errorStack = error && error.stack ? error.stack : "No stack trace available";
  console.error(`CRITICAL_ERROR_INIT_FAILED (v5): Message - ${errorMessage}. Stack - ${errorStack}`);
  // Re-throw a simple string error. This is crucial for Cloud Run to log it properly upon container exit.
  throw `FATAL_INITIALIZATION_ERROR (v5): ${errorMessage}`;
}

// Guard all function definitions. If db is not initialized, they won't be defined.
// This helps prevent runtime errors if init failed, but won't fix the startup crash itself.
if (!db) {
  console.error("CRITICAL_SYSTEM_ERROR: db was not initialized. Functions will not be defined. (v5)");
  // To ensure the container exits if db is not set after the try-catch (shouldn't happen if catch throws).
  // This line is more of a safeguard; the throw in the catch block should be the primary exit point on error.
  throw "FATAL_DB_NOT_INITIALIZED_POST_CATCH (v5)";
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
type SetAdminRoleInput = CallableRequest<SetAdminRoleData>;


export const requestInvitation = onCall(
  {region: "europe-west1", enforceAppCheck: true},
  async (request: CallableRequest<InvitationRequestData>) => {
    console.info("requestInvitation: Nouv. demande invit (v5):", request.data);
    if (!db) {
        console.error("requestInvitation: Firestore DB not available at function call (v5). This indicates a severe initialization problem.");
        throw new HttpsError("internal", "Err. serveur critique.");
    }

    try {
      const validResult = invitationRequestDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("requestInvitation: Valid. échouée (v5):", flatErrors);
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

        console.info(`requestInvitation: Demande MAJ (v5): ${lowerEmail}`);
        return {success: true, message: "Votre demande a été soumise."};
      }

      await db.collection("invitationRequests").add({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.info(`requestInvitation: Demande enregistrée (v5): ${lowerEmail}`);
      return {success: true, message: "Demande d'invitation soumise."};
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec demande. Verif logs serveur (v5).";

      if (error instanceof HttpsError) {
        console.error(
          `requestInvitation: Err (HttpsError ${error.code}) (v5):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error; // Rethrow HttpsError as is
      } else if (error instanceof Error) {
        console.error(
          "requestInvitation: Err (Error) (v5):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        } else {
          message = error.message.slice(0,100); // Truncate for safety
        }
      } else {
        console.error(
            "requestInvitation: Err (unknown) (v5):",
            {errorObject: String(error).slice(0,200), data: request.data}
        );
         message = String(error).slice(0,100);
      }
      throw new HttpsError(code, message);
    }
  }
);

export const approveInvitation = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<ManageInvitationData>) => {
    console.info("approveInvitation: Approbation invit (v5):", request.data);
     if (!db) {
        console.error("approveInvitation: Firestore DB not available (v5).");
        throw new HttpsError("internal", "Err. serveur critique.");
    }

    if (!request.auth || !request.auth.token.admin) {
      console.error("approveInvitation: Acces non-autorise (v5).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    console.info(`approveInvitation: Admin OK (v5). UID: ${adminUid}`);

    try {
      const validResult = manageInvitationDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("approveInvitation: Valid. échouée (v5):", flatErrors);
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
        console.info(`approveInvitation: User cree (v5): ${userRecord.uid}`);
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
          console.warn("approveInvitation: E-mail existant (v5):", lowerEmail);
          let existingUser;
          try {
            existingUser = await admin.auth().getUserByEmail(lowerEmail);
          } catch (getUserError: unknown) {
            console.error("approveInvitation: Err getUser (v5):", getUserError);
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
        console.error("approveInvitation: Auth create err (v5):", authError);
        let errMsg = "Err create user.";
        if(authError instanceof Error) errMsg = authError.message.slice(0,100);
        throw new HttpsError("internal", errMsg);
      }

      await db.collection("invitationRequests").doc(invitationDoc.id).update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminUid,
        authUid: userRecord.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.info(`approveInvitation: Invit. ok, user cree (v5): ${lowerEmail}`);
      return {
        success: true,
        message: `Invit. ${lowerEmail} ok. MDP via 'Oublie?'.`,
      };
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec approbation. Verif logs serveur (v5).";

      if (error instanceof HttpsError) {
        console.error(
          `approveInvitation: Err (HttpsError ${error.code}) (v5):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "approveInvitation: Err (Error) (v5):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        } else {
          message = error.message.slice(0,100);
        }
      } else {
        console.error(
            "approveInvitation: Err (unknown) (v5):",
            {errorObject: String(error).slice(0,200), data: request.data}
        );
        message = String(error).slice(0,100);
      }
      throw new HttpsError(code, message);
    }
  }
);

export const rejectInvitation = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<RejectInvitationData>) => {
    console.info("rejectInvitation: Rejet invit (v5):", request.data);
    if (!db) {
        console.error("rejectInvitation: Firestore DB not available (v5).");
        throw new HttpsError("internal", "Err. serveur critique.");
    }

    if (!request.auth || !request.auth.token.admin) {
      console.error("rejectInvitation: Acces non-autorise (v5).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const adminUid = request.auth.uid;
    console.info(`rejectInvitation: Admin OK (v5). UID: ${adminUid}`);

    try {
      const validResult = rejectInvitationDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("rejectInvitation: Valid. échouée (v5):", flatErrors);
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

      console.info(`rejectInvitation: Invitation rejetee (v5): ${lowerEmail}`);
      return {
        success: true,
        message: `Invitation pour ${lowerEmail} rejetee.`,
      };
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec rejet. Verif logs serveur (v5).";

      if (error instanceof HttpsError) {
        console.error(
          `rejectInvitation: Err (HttpsError ${error.code}) (v5):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "rejectInvitation: Err (Error) (v5):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        } else {
          message = error.message.slice(0,100);
        }
      } else {
        console.error(
            "rejectInvitation: Err (unknown) (v5):",
            {errorObject: String(error).slice(0,200), data: request.data}
        );
        message = String(error).slice(0,100);
      }
      throw new HttpsError(code, message);
    }
  }
);

export const listPendingInvitations = onCall(
  {region: "europe-west1"},
  async (request: CallableRequest<void>) => {
    console.info("listPendingInvitations: Listage invitations (v5).");
    if (!db) {
        console.error("listPendingInvitations: Firestore DB not available (v5).");
        throw new HttpsError("internal", "Err. serveur critique.");
    }

    if (!request.auth || !request.auth.token.admin) {
      console.error("listPendingInvitations: Acces non-autorise (v5).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    console.info("listPendingInvitations: Admin OK (v5).");
    if (request.auth?.uid) {
      console.info("listPendingInvitations: Admin UID (v5):", request.auth.uid);
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
      const message = "Echec liste. Verif logs serveur (v5).";

      if (error instanceof HttpsError) {
        console.error(
          `listPendingInvitations: Err (HttpsError ${error.code}) (v5):`,
          {message: error.message, details: error.details}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "listPendingInvitations: Err (Error) (v5):",
          {name: error.name, message: error.message, stack: error.stack}
        );
      } else {
        console.error(
            "listPendingInvitations: Err (unknown) (v5):",
            {errorObject: String(error).slice(0,200)}
        );
      }
      throw new HttpsError(code, message);
    }
  }
);


export const setAdminRole = onCall(
  {region: "europe-west1"},
  async (request: SetAdminRoleInput) => {
    console.info("setAdminRole: Tentative (v5).", {data: request.data});
    if (!db) {
        console.error("setAdminRole: Firestore DB not available (v5).");
        throw new HttpsError("internal", "Err. serveur critique.");
    }
    if (!request.auth || !request.auth.token.admin) {
      console.error("setAdminRole: Acces non-autorise (v5).");
      throw new HttpsError("permission-denied", "Droits admin requis.");
    }
    const callingAdminUid = request.auth.uid;
    console.info(
      `setAdminRole: Admin ${callingAdminUid} execute (v5).`
    );

    try {
      const validResult = setAdminRoleDataSchema.safeParse(request.data);
      if (!validResult.success) {
        const flatErrors = validResult.error.flatten();
        console.error("setAdminRole: Err validation (v5):", flatErrors);
        throw new HttpsError("invalid-argument", "Err. donnees.");
      }
      const {email, uid: providedUid} = validResult.data;
      let targetUid = providedUid;

      if (email && !targetUid) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (e: unknown) {
          console.error(`setAdminRole: Err getUserByEmail ${email} (v5):`, e);
          let errMsg = "Err recup user.";
          if (e instanceof Error) errMsg = e.message.slice(0,100);
          throw new HttpsError("not-found", errMsg);
        }
      }

      if (!targetUid) {
        throw new HttpsError("not-found", "User non trouve.");
      }

      await admin.auth().setCustomUserClaims(targetUid, {admin: true});
      console.info(`setAdminRole: Role admin pour ${targetUid} (v5).`);
      const targetIdentifier = email || targetUid;
      return {
        success: true,
        message: `Role admin pour ${targetIdentifier}.`,
      };
    } catch (error: unknown) {
      let code: typeof HttpsError.prototype.code = "internal";
      let message = "Echec role admin. Verif logs serveur (v5).";

      if (error instanceof HttpsError) {
        console.error(
          `setAdminRole: Err (HttpsError ${error.code}) (v5):`,
          {message: error.message, details: error.details, data: request.data}
        );
        throw error;
      } else if (error instanceof Error) {
        console.error(
          "setAdminRole: Err (Error) (v5):",
          {name: error.name, message: error.message, stack: error.stack, data: request.data}
        );
        if (error.name === "ZodError") {
          code = "invalid-argument";
          message = "Donnees invalides.";
        } else {
          message = error.message.slice(0,100);
        }
      } else {
        console.error(
            "setAdminRole: Err (unknown) (v5):",
            {errorObject: String(error).slice(0,200), data: request.data}
        );
        message = String(error).slice(0,100);
      }
      throw new HttpsError(code, message);
    }
  }
);

console.log("LOG_MARKER_J: Top-level script execution completed in functions/src/index.ts (v5)");
