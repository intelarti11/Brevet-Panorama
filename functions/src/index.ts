
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Log prefix pour cette version
const LOG_PREFIX_V13_1 = "INIT_V13_1"; // Updated log marker

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

// Ultra minimal function for basic testing
export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    const logMarker = "ULTRA_MINIMAL_V13_1_LOG"; // Updated log marker
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
    const logMarker = "INVITE_WRITE_V13_1_LOG"; // Updated log marker
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
      // Check if a pending request for this email already exists
      const existingQuery = db.collection(collectionName)
        .where("email", "==", email)
        .where("status", "==", "pending");
      const existingSnapshot = await existingQuery.get();

      if (!existingSnapshot.empty) {
        logger.info(`${logMarker}: Pending req for ${email} already exists.`);
        return {
          success: false, // Or true, depending on desired UX
          message: `Une demande pour ${email} est déjà en attente.`,
          receivedData: request.data,
        };
      }

      const newRequestRef = db.collection(collectionName).doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });

      logger.info(
        `${logMarker}: Firestore write OK for ${email}. ID: ${newRequestRef.id}`
      );
      const successMsg = `Demande pour ${email} enregistrée.`;
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
      logger.error(
        `${logMarker}: Firestore write FAILED for ${email}.`,
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

// Function to list pending invitation requests
const listPendingInvitationsOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public", // Allows unauthenticated access
};

export const listPendingInvitations = onCall(
  listPendingInvitationsOptions,
  async () => {
    const logMarker = "LIST_INVITES_V13_2_LOG"; 
    logger.info(`${logMarker}: Func start. Listing invites (v13.2 - with order).`);

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
        .where("status", "==", "pending")
        // .orderBy("requestedAt", "asc"); // Temporarily removed for index issue
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
          const warnMsg = `${logMarker}: Invalid reqAt for doc ${doc.id}.`;
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
      const logMsg = `${logMarker}: Invites found. Count: ${invitations.length}`;
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

// Function to approve an invitation request
const approveInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  // invoker: "private" // Default, requires auth if not specified as public
};
export const approveInvitation = onCall(
  approveInvitationOptions,
  async (request) => {
    const logMarker = "APPROVE_INVITE_V2_LOG";
    logger.info(`${logMarker}: Called. Data:`, {structuredData: true, data: request.data});

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {success: false, message: "Erreur serveur (DB)." };
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      logger.error(`${logMarker}: Invalid/missing invitationId.`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        logger.warn(`${logMarker}: Invitation ${invitationId} not found.`);
        return {success: false, message: "Invitation non trouvée."};
      }
      
      const docData = inviteDoc.data();
      if (docData?.status !== "pending") {
        logger.warn(`${logMarker}: Invite ${invitationId} not pending. Status: ${docData?.status}`);
        return {success: false, message: `Invitation déjà traitée (${docData?.status}).`};
      }

      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      const emailForLog = docData?.email || "[email non trouvé]";
      logger.info(`${logMarker}: Invitation ${invitationId} approved for ${emailForLog}.`);
      return {success: true, message: `Invitation pour ${emailForLog} approuvée.`};
    } catch (err: unknown) {
      let errorMsg = "Unknown error approving invitation.";
      if (err instanceof Error) {errorMsg = err.message;}
      logger.error(`${logMarker}: Approval FAILED for ${invitationId}.`, {error: errorMsg, originalError: String(err)});
      return {success: false, message: `Échec approbation: ${errorMsg}`};
    }
  }
);

// Function to reject an invitation request
const rejectInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  // invoker: "private" // Default, requires auth if not specified as public
};
export const rejectInvitation = onCall(
  rejectInvitationOptions,
  async (request) => {
    const logMarker = "REJECT_INVITE_V2_LOG";
    logger.info(`${logMarker}: Called. Data:`, {structuredData: true, data: request.data});

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {success: false, message: "Erreur serveur (DB)."};
    }

    const invitationId = request.data.invitationId;
    const reason = request.data.reason; 

    if (!invitationId || typeof invitationId !== "string") {
      logger.error(`${logMarker}: Invalid/missing invitationId.`, {invitationId});
      return {success: false, message: "ID d'invitation invalide."};
    }

    try {
      const inviteRef = db.collection("invitationRequests").doc(invitationId);
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        logger.warn(`${logMarker}: Invitation ${invitationId} not found.`);
        return {success: false, message: "Invitation non trouvée."};
      }
      
      const docData = inviteDoc.data();
      if (docData?.status !== "pending") {
         logger.warn(`${logMarker}: Invite ${invitationId} not pending. Status: ${docData?.status}`);
        return {success: false, message: `Invitation déjà traitée (${docData?.status}).`};
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
      
      logger.info(`${logMarker}: Update payload for ${invitationId}:`, {payload: updatePayload});
      await inviteRef.update(updatePayload);
      
      const emailForLog = docData?.email || "[email non trouvé]";
      logger.info(`${logMarker}: Invitation ${invitationId} rejected for ${emailForLog}.`);
      return {success: true, message: `Invitation pour ${emailForLog} rejetée.`};
    } catch (err: unknown) {
      let errorMsg = "Unknown error rejecting invitation.";
      if (err instanceof Error) {errorMsg = err.message;}
      logger.error(`${logMarker}: Rejection FAILED for ${invitationId}.`, {error: errorMsg, originalError: String(err)});
      return {success: false, message: `Échec rejet: ${errorMsg}`};
    }
  }
);

logger.info(
  `${LOG_PREFIX_V13_1}: Script end. Admin SDK init attempt done (v13.1).`
);

    