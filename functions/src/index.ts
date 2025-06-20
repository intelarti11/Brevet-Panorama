
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

const LOG_PREFIX_V13_1 = "INIT_V13_1";

logger.info(
  `${LOG_PREFIX_V13_1}: Script top. Admin init.`
);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(
    `${LOG_PREFIX_V13_1}: Attempting admin.initializeApp()...`
  );
  adminApp = admin.initializeApp();
  logger.info(
    `${LOG_PREFIX_V13_1}: admin.initializeApp() SUCCESS.`
  );

  logger.info(`${LOG_PREFIX_V13_1}: Attempting admin.firestore()...`);
  db = admin.firestore();
  logger.info(`${LOG_PREFIX_V13_1}: admin.firestore() SUCCESS.`);
  logger.info(
    `${LOG_PREFIX_V13_1}: FB Admin SDK init OK.`
  );
} catch (error: unknown) {
  let errorMessage = "Unknown error during Firebase Admin init.";
  let errorStack = "No stack trace for Firebase Admin init error.";
  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "No stack trace available";
  }
  logger.error(
    `${LOG_PREFIX_V13_1}: CRITICAL_ERROR_DURING_FIREBASE_ADMIN_INIT.`,
    {
      errorMessage: errorMessage,
      errorStack: errorStack,
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
      logger.warn(
        `${logMarker}: Firestore (db) not initialized.`
      );
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
        message: "Erreur serveur (DB indisponible).",
        receivedData: request.data,
      };
    }

    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error(`${logMarker}: Invalid/missing email.`, {email});
      return {
        success: false,
        message: "Email invalide ou manquant.",
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
          message: `Demande pour ${email} déjà en attente.`,
          receivedData: request.data,
        };
      }

      const newRequestRef = db.collection(collectionName).doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });

      const successMsg = `Demande pour ${email} enregistrée.`;
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
      const logFail = `${logMarker}: Firestore write FAIL for ${email}.`;
      logger.error(
        logFail,
        {error: errorMsg, originalError: String(writeError)}
      );
      return {
        success: false,
        message: `Échec enregistrement: ${errorMsg}`,
        receivedData: request.data,
      };
    }
  }
);

const listPendingInvitationsOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public", // Allows unauthenticated calls for now
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
        message: "Erreur serveur: DB indisponible pour lister.",
        invitations: [],
      };
    }

    try {
      const query = db.collection("invitationRequests")
        .where("status", "==", "pending");
        // .orderBy("requestedAt", "desc"); Temporarily removed for no-index
      const snapshot = await query.get();

      if (snapshot.empty) {
        logger.info(`${logMarker}: No pending invites found.`);
        return {
          success: true,
          message: "Aucune demande d'invitation en attente.",
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
          const warnMsg = `${logMarker}: Invalid reqAt for ${doc.id}.`;
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
        message: "Invitations en attente récupérées.",
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
        message: `Erreur serveur (liste): ${errorMsg}`,
        invitations: [],
      };
    }
  }
);

const approveInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public", // Added to allow unauthenticated calls for now
};
export const approveInvitation = onCall(
  approveInvitationOptions,
  async (request) => {
    const logMarker = "APPROVE_INVITE_V3_LOG";
    logger.info(`${logMarker}: Called. Data:`,
      {structuredData: true, data: request.data});

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {success: false, message: "Erreur serveur (DB)."};
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      logger.error(`${logMarker}: Invalid/missing invitationId.`,
        {invitationId});
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
          message: `Inv. déjà traitée (${docData?.status}).`,
        };
      }

      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const emailLog = docData?.email || "[email N/A]";
      const sucMsg = `${logMarker}: OK ${invitationId} for ${emailLog}.`;
      logger.info(sucMsg);
      return {success: true, message: `Invite ${emailLog} approuvée.`};
    } catch (err: unknown) {
      let errorMsg = "Unknown error approving invitation.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = `${logMarker}: Approval FAIL ${invitationId}.`;
      logger.error(logErr, {error: errorMsg, originalError: String(err)});
      return {success: false, message: `Échec approbation: ${errorMsg}`};
    }
  }
);

const rejectInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public", // Added to allow unauthenticated calls for now
};
export const rejectInvitation = onCall(
  rejectInvitationOptions,
  async (request) => {
    const logMarker = "REJECT_INVITE_V3_LOG";
    logger.info(`${logMarker}: Called. Data:`,
      {structuredData: true, data: request.data});

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {success: false, message: "Erreur serveur (DB)."};
    }

    const invitationId = request.data.invitationId;
    const reason = request.data.reason;

    if (!invitationId || typeof invitationId !== "string") {
      logger.error(`${logMarker}: Invalid/missing invitationId.`,
        {invitationId});
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
          message: `Inv. déjà traitée (${docData?.status}).`,
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
        updatePayload.rejectionReason = reason;
      }

      const payloadLog = `${logMarker}: Payload for ${invitationId}:`;
      logger.info(payloadLog, {payload: updatePayload});
      await inviteRef.update(updatePayload);

      const emailLog = docData?.email || "[email N/A]";
      const sucMsg = `${logMarker}: KO ${invitationId} for ${emailLog}.`;
      logger.info(sucMsg);
      return {success: true, message: `Invite ${emailLog} rejetée.`};
    } catch (err: unknown) {
      let errorMsg = "Unknown error rejecting invitation.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      const logErr = `${logMarker}: Rejection FAIL ${invitationId}.`;
      logger.error(logErr, {error: errorMsg, originalError: String(err)});
      return {success: false, message: `Rejet échec: ${errorMsg}`};
    }
  }
);

logger.info(
  `${LOG_PREFIX_V13_1}: Script end. Admin SDK init done (v13.1).`
);
