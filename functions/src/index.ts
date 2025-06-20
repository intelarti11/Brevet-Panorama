
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import type {UserRecord} from "firebase-admin/auth";
import * as crypto from "crypto";

const LOG_PREFIX_V13_1 = "INIT_V13_1";

logger.info(`${LOG_PREFIX_V13_1}: Script top. Admin init.`);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(`${LOG_PREFIX_V13_1}: Admin.initializeApp()...`);
  adminApp = admin.initializeApp();
  logger.info(`${LOG_PREFIX_V13_1}: admin.initializeApp() OK.`);

  logger.info(`${LOG_PREFIX_V13_1}: Admin.firestore()...`);
  db = admin.firestore();
  logger.info(`${LOG_PREFIX_V13_1}: admin.firestore() OK.`);
  logger.info(`${LOG_PREFIX_V13_1}: FB Admin SDK init OK.`);
} catch (error: unknown) {
  let errMsg = "Unknown error during Firebase Admin init.";
  let errStack = "No stack trace for Firebase Admin init error.";
  if (error instanceof Error) {
    errMsg = error.message;
    errStack = error.stack || "No stack trace available";
  }
  logger.error(
    `${LOG_PREFIX_V13_1}: CRIT_ERR_FB_ADMIN_INIT.`,
    {
      errorMessage: errMsg,
      errorStack: errStack,
      errorObjectString: String(error),
    }
  );
  db = null;
  adminApp = null;
}

export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    const logMarker = "ULTRA_MINIMAL_V13_1_LOG";
    logger.info(
      `${logMarker}: Called.`,
      {structuredData: true, data: request.data}
    );
    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {
        success: false,
        message: "Firestore not available for ultraMinimalFunction.",
        receivedData: request.data,
      };
    }
    return {
      success: true,
      message: "Ultra minimal function (v13.1) executed.",
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
    const logMarker = "INVITE_WRITE_V13_1_LOG";
    logger.info(
      `${logMarker}: Called. Data:`,
      {structuredData: true, data: request.data}
    );

    if (!adminApp) {
      logger.error(`${logMarker}: AdminApp not init! Critical.`);
    }
    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not init.`);
      return {
        success: false,
        message: "Err serveur (DB indispo).",
        receivedData: request.data,
      };
    }

    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error(`${logMarker}: Invalid/missing email.`, {email});
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
        const msg = `${logMarker}: Pend. req for ${email} exists.`;
        logger.info(msg);
        return {
          success: false,
          message: `Demande ${email} attente.`,
          receivedData: request.data,
        };
      }

      const newRequestRef = db.collection(collectionName).doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });

      const successMsg = `Demande ${email} OK.`;
      const logOk = `${logMarker}: Write OK ${email}. ID: ${newRequestRef.id}`;
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
      const logFail = `${logMarker}: Firestore write FAIL ${email}.`;
      logger.error(
        logFail,
        {error: errorMsg, originalError: String(writeError)}
      );
      return {
        success: false,
        message: `Échec save: ${errorMsg}`,
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
    const logMarker = "LIST_INV_V13_3_LOG";
    logger.info(`${logMarker}: Func start. Listing (v13.3).`);

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {
        success: false,
        message: "Err serveur: DB indispo.",
        invitations: [],
      };
    }

    try {
      const query = db.collection("invitationRequests")
        .where("status", "==", "pending");
      const snapshot = await query.get();

      if (snapshot.empty) {
        logger.info(`${logMarker}: No pending invites found.`);
        return {
          success: true,
          message: "Aucune demande en attente.",
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
          const warnMsg = `${logMarker}: Invalid reqAt ${doc.id}.`;
          logger.warn(warnMsg, {reqTsVal: String(reqTimestamp)});
          requestedAtISO = new Date(0).toISOString();
        }
        return {
          id: doc.id,
          email: data.email,
          requestedAt: requestedAtISO,
          status: data.status,
        };
      });
      const logMsg = `${logMarker}: Found ${invitations.length} invites.`;
      logger.info(logMsg);
      return {
        success: true,
        message: "Invitations en attente OK.",
        invitations: invitations,
      };
    } catch (error: unknown) {
      let errorMsg = "Unknown error listing invites.";
      if (error instanceof Error) {
        errorMsg = error.message;
      }
      const logErr = `${logMarker}: List invites failed.`;
      logger.error(logErr, {error: errorMsg, originalError: String(error)});
      return {
        success: false,
        message: `Err serveur (liste): ${errorMsg}`,
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
    const logMarker = "INV_APPR_V6";
    logger.info(
      `${logMarker}: Called. Data:`,
      {structuredData: true, data: request.data}
    );

    if (!db || !adminApp) {
      logger.warn(`${logMarker}: DB or AdminApp not init.`);
      return {success: false, message: "Err serveur (DB/Admin)."};
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        logger.warn(`${logMarker}: Invite ${invitationId} not found.`);
        return {success: false, message: "Invitation non trouvée."};
      }

      const docData = inviteDoc.data();
      if (docData?.status !== "pending") {
        const msg = `Invite ${invitationId} not pending.`;
        logger.warn(`${logMarker}: ${msg} Status: ${docData?.status}`);
        return {
          success: false,
          message: `Inv. traitée (${docData?.status}).`,
        };
      }

      const emailToApprove = docData?.email;
      if (!emailToApprove || typeof emailToApprove !== "string") {
        logger.error(`${logMarker}: Email missing in ${invitationId}.`);
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
        const logUMsg = `${logMarker}: User ${userRecord.uid} created.`;
        logger.info(logUMsg);
        userCreationMessage = "Cpt créé. Use 'Mdp oublié'.";
        userMessageShort = "Cpt créé.";
      } catch (authErrorUnknown: unknown) {
        const authError = authErrorUnknown as {code?: string; message?: string};
        if (authError.code === "auth/email-already-exists") {
          logger.warn(`${logMarker}: User ${emailToApprove} exists.`);
          userCreationMessage = "Cpt existant.";
          userMessageShort = "Cpt existant.";
        } else {
          const errMsg = authError.message || "Auth error";
          const logErr = `${logMarker}: Auth FAIL: ${emailToApprove}.`;
          logger.error(logErr, {error: errMsg});
          return {success: false, message: `Échec Auth: ${errMsg}`};
        }
      }

      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const finalLogMsg = `${logMarker}: OK ${invitationId}. ${userMessageShort}`;
      logger.info(finalLogMsg);
      return {
        success: true,
        message: `Approuvé. ${userCreationMessage}`,
      };
    } catch (err: unknown) {
      let errorMsg = "Unknown error approving invitation.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = `${logMarker}: Approve FAIL ${invitationId}.`;
      logger.error(logErr, {error: errorMsg, originalError: String(err)});
      return {success: false, message: `Approb. échec: ${errorMsg}`};
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
    const logMarker = "INV_REJ_V5";
    logger.info(
      `${logMarker}: Called. Data:`,
      {structuredData: true, data: request.data}
    );

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {success: false, message: "Erreur serveur (DB)."};
    }

    const invitationId = request.data.invitationId;
    const reason = request.data.reason;

    if (!invitationId || typeof invitationId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        logger.warn(`${logMarker}: Invite ${invitationId} not found.`);
        return {success: false, message: "Invitation non trouvée."};
      }

      const docData = inviteDoc.data();
      if (docData?.status !== "pending") {
        const msg = `Invite ${invitationId} not pending.`;
        logger.warn(`${logMarker}: ${msg} Status: ${docData?.status}`);
        return {
          success: false,
          message: `Inv. traitée (${docData?.status}).`,
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

      const payloadLog = `${logMarker}: Payload for ${invitationId}:`;
      logger.info(payloadLog, {payload: updatePayload});
      await inviteRef.update(updatePayload);

      const emailLog = docData?.email || "[no_email]";
      const sucMsg = `${logMarker}: KO ${invitationId} for ${emailLog}.`;
      logger.info(sucMsg);
      return {success: true, message: `Invite ${emailLog} rejetée.`};
    } catch (err: unknown) {
      let errorMsg = "Unknown error rejecting invitation.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = `${logMarker}: Rej. FAIL ${invitationId}.`;
      logger.error(logErr, {error: errorMsg, originalError: String(err)});
      return {success: false, message: `Rejet échec: ${errorMsg}`};
    }
  }
);

logger.info(
  `${LOG_PREFIX_V13_1}: Script end. Admin SDK init done (v13.1).`
);
