
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import type {UserRecord} from "firebase-admin/auth";
import * as crypto from "crypto";

const LOG_PREFIX = "INIT_V13"; 

logger.info(\`${LOG_PREFIX}: Script top. Admin init.\`);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(\`${LOG_PREFIX}: Admin.initializeApp()...\`);
  adminApp = admin.initializeApp();
  logger.info(\`${LOG_PREFIX}: admin.initializeApp() OK.\`);

  logger.info(\`${LOG_PREFIX}: Admin.firestore()...\`);
  db = admin.firestore();
  logger.info(\`${LOG_PREFIX}: admin.firestore() OK.\`);
  logger.info(\`${LOG_PREFIX}: FB Admin SDK init OK.\`);
} catch (error: unknown) {
  let errMsg = "Unknown error during Firebase Admin init.";
  let errStack = "No stack trace for Firebase Admin init error.";
  if (error instanceof Error) {
    errMsg = error.message;
    errStack = error.stack || "No stack trace available";
  }
  logger.error(
    \`${LOG_PREFIX}: CRIT_ERR_FB_ADMIN_INIT.\`,
    {
      errorMessage: errMsg.slice(0, 50), // Shorten error message
      errorStack: errStack.slice(0, 70), // Shorten stack
      errorObjectString: String(error).slice(0, 50),
    }
  );
  db = null;
  adminApp = null;
}

export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    const logMarker = "MIN_V13_LOG";
    logger.info(
      \`${logMarker}: Called.\`,
      {structuredData: true, data: request.data}
    );
    if (!db) {
      logger.warn(\`${logMarker}: Firestore (db) not initialized.\`);
      return {
        success: false,
        message: "DB not avail for ultraMinFunc.", // Shortened
        receivedData: request.data,
      };
    }
    return {
      success: true,
      message: "Ultra minimal func (v13) exec.", // Shortened
      receivedData: request.data,
    };
  }
);

const requestInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};

export const requestInvitation = onCall(
  requestInvitationOptions,
  async (request) => {
    const logMarker = "INV_WR_V13";
    logger.info(
      \`${logMarker}: Called. Data:\`,
      {structuredData: true, data: request.data}
    );

    if (!adminApp) {
      logger.error(\`${logMarker}: AdminApp not init! Critical.\`);
    }
    if (!db) {
      logger.warn(\`${logMarker}: Firestore (db) not init.\`);
      return {
        success: false,
        message: "Srv Err (DB indispo).", // Shortened
        receivedData: request.data,
      };
    }

    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error(\`${logMarker}: Invalid/missing email.\`, {email});
      return {
        success: false,
        message: "Email invalide/manquant.",
        receivedData: request.data,
      };
    }

    try {
      const collectionName = "invitationRequests";
      const existingQuery = db.collection(collectionName)
        .where("email", "==", email)
        .where("status", "==", "pending");
      const existingSnapshot = await existingQuery.get();

      if (!existingSnapshot.empty) {
        const msg = \`${logMarker}: Pend. req for ${email.slice(0, 25)} exists.\`;
        logger.info(msg);
        return {
          success: false,
          message: \`Demande ${email.slice(0, 25)} attente.\`, // Shortened
          receivedData: request.data,
        };
      }

      const newRequestRef = db.collection(collectionName).doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        notifiedAt: null,
      });

      const successMsg = \`Demande ${email.slice(0, 25)} OK.\`; // Shortened
      const logOk = \`${logMarker}: Write OK ${email.slice(0, 25)}. ID: ${newRequestRef.id.slice(0,10)}\`;
      logger.info(logOk);
      return {
        success: true,
        message: successMsg,
        receivedData: request.data,
      };
    } catch (writeError: unknown) {
      let errorMsg = "Unknown Firestore write error.";
      if (writeError instanceof Error) {
        errorMsg = writeError.message;
      }
      const logFail = \`${logMarker}: Firestore write FAIL ${email.slice(0, 25)}.\`;
      logger.error(
        logFail,
        {error: errorMsg.slice(0, 30), originalError: String(writeError).slice(0,20)}
      );
      return {
        success: false,
        message: \`Échec save: ${errorMsg.slice(0, 20)}\`, // Shortened
        receivedData: request.data,
      };
    }
  }
);

const listPendingInvitationsOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};

export const listPendingInvitations = onCall(
  listPendingInvitationsOptions,
  async () => {
    const logMarker = "LST_INV_V14";
    logger.info(\`${logMarker}: Func start. Listing all invites.\`);

    if (!db) {
      logger.warn(\`${logMarker}: Firestore (db) not initialized.\`);
      return {
        success: false,
        message: "Err serveur: DB indispo.",
        invitations: [],
      };
    }

    try {
      const query = db.collection("invitationRequests")
        .orderBy("requestedAt", "desc");
      const snapshot = await query.get();

      if (snapshot.empty) {
        logger.info(\`${logMarker}: No invites found at all.\`);
        return {
          success: true,
          message: "Aucune demande trouvée.", // Shortened
          invitations: [],
        };
      }

      const invitations = snapshot.docs.map((doc) => {
        const data = doc.data();
        const reqTimestamp = data.requestedAt as admin.firestore.Timestamp;
        let requestedAtISO: string;
        if (reqTimestamp && typeof reqTimestamp.toDate === "function") {
          requestedAtISO = reqTimestamp.toDate().toISOString();
        } else {
          const shortId = doc.id.substring(0, 10);
          const reqTsValStr = String(reqTimestamp);
          logger.warn(\`LST_INV: Bad reqAt ${shortId}\`, {
            ts: reqTsValStr.slice(0, 15), 
          });
          requestedAtISO = new Date(0).toISOString();
        }

        const notifiedTimestamp = data.notifiedAt as admin.firestore.Timestamp;
        let notifiedAtISO: string | undefined;
        if (notifiedTimestamp && typeof notifiedTimestamp.toDate === "function") {
          notifiedAtISO = notifiedTimestamp.toDate().toISOString();
        }

        return {
          id: doc.id,
          email: data.email,
          requestedAt: requestedAtISO,
          status: data.status,
          notifiedAt: notifiedAtISO,
        };
      });
      const logMsg = \`${logMarker}: Found ${invitations.length} invites.\`;
      logger.info(logMsg);
      return {
        success: true,
        message: "Liste OK.", // Shortened for line length
        invitations: invitations, // Explicitly listing property
      };
    } catch (error: unknown) {
      let errorMsg = "Unknown error listing invites.";
      if (error instanceof Error) {
        errorMsg = error.message;
      }
      const shortError = String(error).slice(0,20);
      logger.error(\`LST_INV: List fail. ${errorMsg.slice(0,25)}\`, {
        orig: shortError,
      });
      return {
        success: false,
        message: \`Err liste: ${errorMsg.slice(0,20)}\`, // Shortened
        invitations: [],
      };
    }
  }
);


const approveInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};
export const approveInvitation = onCall(
  approveInvitationOptions,
  async (request) => {
    const logMarker = "APPR_V7";
    logger.info(
      \`${logMarker}: Called. Data:\`,
      {structuredData: true, data: request.data} // Ensured space
    );

    if (!db || !adminApp) {
      logger.warn(\`${logMarker}: DB or AdminApp not init.\`);
      return {success: false, message: "Err serveur (DB/Admin)."};
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      logger.error(\`${logMarker}: Invalid ID.\`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        logger.warn(\`${logMarker}: Invite ${invitationId.slice(0,10)} not found.\`);
        return {success: false, message: "Invitation non trouvée."};
      }

      const docData = inviteDoc.data();
      if (docData?.status !== "pending") {
        const msg = \`Invite ${invitationId.slice(0,10)} not pending.\`;
        logger.warn(\`${logMarker}: ${msg} Status: ${docData?.status}\`);
        return {
          success: false,
          message: \`Inv. déjà traitée (${docData?.status}).\`,
        };
      }

      const emailToApprove = docData?.email;
      if (!emailToApprove || typeof emailToApprove !== "string") {
        logger.error(\`${logMarker}: Email missing in ${invitationId.slice(0,10)}.\`);
        return {success: false, message: "Email manquant."};
      }

      let userCreationMessage = "";
      let userMessageShort = "";

      try {
        const tempPassword = crypto.randomBytes(16).toString("hex");
        const userRecord: UserRecord = await admin.auth().createUser({
          email: emailToApprove,
          emailVerified: true,
          password: tempPassword,
          disabled: false,
        });
        const logUMsg = \`${logMarker}: User ${userRecord.uid.slice(0,10)} créé.\`;
        logger.info(logUMsg);
        userCreationMessage = "Cpt créé. Mdp via 'Oublié'."; // Shortened
        userMessageShort = "Usr ok.";
      } catch (authErrorUnknown: unknown) {
        const authError = authErrorUnknown as {code?: string; message?: string};
        if (authError.code === "auth/email-already-exists") {
          logger.warn(\`${logMarker}: User ${emailToApprove.slice(0,25)} exists.\`);
          userCreationMessage = "Cpt existant.";
          userMessageShort = "Usr exist.";
        } else {
          const errMsg = authError.message || "Auth error";
          const logErr = \`${logMarker}: Auth FAIL: ${emailToApprove.slice(0,25)}.\`;
          logger.error(logErr, {error: errMsg.slice(0,20)});
          const displayErrMsg = errMsg.substring(0, 20); // Shortened
          return {success: false, message: \`Échec Auth: ${displayErrMsg}\`};
        }
      }

      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const finalLogMsg = \`${logMarker}: OK ${invitationId.slice(0,10)}. ${userMessageShort}\`;
      logger.info(finalLogMsg);

      return {
        success: true,
        message: \`Approuvé. ${userCreationMessage}\`,
      };
    } catch (err: unknown) {
      let errorMsg = "Unknown error approving invitation.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = \`${logMarker}: Approve FAIL ${invitationId.slice(0,10)}.\`;
      logger.error(logErr, {error: errorMsg.slice(0,25), orig: String(err).slice(0,20)});
      const displayErrMsg = errorMsg.substring(0, 20); // Shortened
      return {success: false, message: \`App. KO: ${displayErrMsg}\`};
    }
  }
);

const rejectInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};
export const rejectInvitation = onCall(
  rejectInvitationOptions,
  async (request) => {
    const logMarker = "REJ_V6";
    logger.info(
      \`${logMarker}: Called. Data:\`,
      {structuredData: true, data: request.data}
    );

    if (!db) {
      logger.warn(\`${logMarker}: Firestore (db) not initialized.\`);
      return {success: false, message: "Erreur serveur (DB)."};
    }

    const invitationId = request.data.invitationId;
    const reason = request.data.reason;

    if (!invitationId || typeof invitationId !== "string") {
      logger.error(\`${logMarker}: Invalid ID.\`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        logger.warn(\`${logMarker}: Invite ${invitationId.slice(0,10)} not found.\`);
        return {success: false, message: "Invitation non trouvée."};
      }

      const docData = inviteDoc.data();
      if (docData?.status !== "pending") {
        const msg = \`Invite ${invitationId.slice(0,10)} not pending.\`;
        logger.warn(\`${logMarker}: ${msg} Status: ${docData?.status}\`);
        return {
          success: false,
          message: \`Inv. déjà traitée (${docData?.status}).\`,
        };
      }

      const updatePayload: {
        status: string;
        rejectedAt: admin.firestore.FieldValue;
        rejectionReason?: string;
      } = {
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (reason && typeof reason === "string" && reason.trim() !== "") {
        updatePayload.rejectionReason = reason.substring(0, 50);
      }

      await inviteRef.update(updatePayload);

      const emailLog = docData?.email || "[no_email]";
      const sucMsg = \`${logMarker}: KO ${invitationId.slice(0,10)} for ${emailLog.slice(0,20)}.\`;
      logger.info(sucMsg);
      return {success: true, message: \`${emailLog.slice(0,20)} Rej.\`}; // Shortened line
    } catch (err: unknown) {
      let errorMsg = "Unknown error rejecting invitation.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = \`${logMarker}: Rej. FAIL ${invitationId.slice(0,10)}.\`;
      logger.error(logErr, {error: errorMsg.slice(0,25), orig: String(err).slice(0,20)});
      const displayErrMsg = errorMsg.substring(0, 25); // Shortened
      return {success: false, message: \`Rejet échec: ${displayErrMsg}\`};
    }
  }
);

const markInvitationAsNotifiedOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};
export const markInvitationAsNotified = onCall(
  markInvitationAsNotifiedOptions,
  async (request) => {
    const logMarker = "NTFY_V1";
    logger.info(
      \`${logMarker}: Called. Data:\`,
      {structuredData: true, data: request.data}
    );

    if (!db) {
      logger.warn(\`${logMarker}: DB not init.\`);
      return {success: false, message: "Erreur serveur (DB)."};
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      logger.error(\`${logMarker}: Invalid ID.\`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) { // Corrected: space before brace
        logger.warn(\`${logMarker}: Inv ${invitationId.slice(0,10)} not found.\`);
        return {success: false, message: "Invitation non trouvée."};
      }
      
      const docData = inviteDoc.data(); // Removed trailing space
      if (docData?.status !== "approved") {
        const currSt = docData?.status ?? "unknown";
        logger.warn(\`${logMarker}: Inv ${invitationId.slice(0,10)} not OK (St: ${currSt})\`); // Shortened
        return {success: false, message: "Inv. non appr. pr notif."}; // Shortened
      }
      if (docData?.notifiedAt) {
        logger.info(\`${logMarker}: Inv ${invitationId.slice(0,10)} already notified.\`);
        return {success: true, message: "Inv. déjà notifiée."};
      }

      await inviteRef.update({
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const emailLog = docData?.email || "[no_email]";
      logger.info(\`${logMarker}: Inv ${invitationId.slice(0,10)} for ${emailLog.slice(0,20)} notif.\`); // Shortened
      return {success: true, message: \`Notif marquée ${emailLog.slice(0,20)}.\`};
    } catch (err: unknown) {
      let errorMsg = "Erreur lors du marquage de la notification.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = \`${logMarker}: Mark notified FAIL ${invitationId.slice(0,10)}.\`;
      logger.error(logErr, {error: errorMsg.slice(0,25), orig: String(err).slice(0,20)});
      const displayErrMsg = errorMsg.substring(0, 20); // Shortened
      return {success: false, message: \`Notif KO: ${displayErrMsg}\`};
    }
  }
);

logger.info(
  \`${LOG_PREFIX}: Script end. Admin SDK init done.\` // Shortened
);

    