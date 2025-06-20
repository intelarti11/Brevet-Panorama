
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Log prefix pour cette version
const LOG_PREFIX_V13 = "INIT_V13"; // Changed log marker

logger.info(
  `${LOG_PREFIX_V13}: Script top. Admin init.`
);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(
    `${LOG_PREFIX_V13}: Attempting admin.initializeApp()...`
  );
  adminApp = admin.initializeApp();
  logger.info(
    `${LOG_PREFIX_V13}: admin.initializeApp() SUCCESS.`
  );

  logger.info(`${LOG_PREFIX_V13}: Attempting admin.firestore()...`);
  db = admin.firestore();
  logger.info(`${LOG_PREFIX_V13}: admin.firestore() SUCCESS.`);
  logger.info(
    `${LOG_PREFIX_V13}: FB Admin SDK init OK.`
  );
} catch (error: unknown) {
  let errorMessage = "Unknown error during Firebase Admin init.";
  let errorStack = "No stack trace for Firebase Admin init error.";
  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "No stack trace available";
  }
  logger.error(
    `${LOG_PREFIX_V13}: CRITICAL_ERROR_DURING_FIREBASE_ADMIN_INIT.`,
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
    const logMarker = "ULTRA_MINIMAL_V13_LOG"; // Changed log marker
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
      message: "Ultra minimal function (v13) executed.",
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
    const logMarker = "INVITE_WRITE_V13_LOG"; // Changed log marker
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
      const newRequestRef = db.collection(collectionName).doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });

      logger.info(
        `${logMarker}: Firestore write OK: ${email}. ID: ${newRequestRef.id}`
      );
      const successMsg = `Demande pour ${email} ok.`;
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
        `${logMarker}: Firestore write FAILED: ${email}.`,
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
  invoker: "public",
};

export const listPendingInvitations = onCall(
  listPendingInvitationsOptions,
  async () => {
    const logMarker = "LIST_INVITES_V13_LOG"; // Changed log marker
    logger.info(`${logMarker}: INIT - Listing invites (v13 - no order).`);

    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {
        success: false,
        message: "Erreur serveur: DB indisponible pour lister.",
        invitations: [],
      };
    }

    try {
      // Temporarily removed .orderBy("requestedAt", "asc")
      const query = db.collection("invitationRequests")
        .where("status", "==", "pending");
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
          const warnMsg = `${logMarker}: Invalid reqAt: doc ${doc.id}`;
          logger.warn(warnMsg, {reqTsVal: String(reqTimestamp)});
          requestedAtISO = new Date().toISOString(); // Fallback
        }
        return {
          id: doc.id,
          email: data.email,
          requestedAt: requestedAtISO,
          status: data.status,
        };
      });

      logger.info(`${logMarker}: Invites found.`, {count: invitations.length});
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
      const logErr = `${logMarker}: Failed to list invites.`;
      logger.error(logErr, {error: errorMsg, originalError: String(error)});
      return {
        success: false,
        message: `Erreur serveur: ${errorMsg}`,
        invitations: [],
      };
    }
  }
);


logger.info(
  `${LOG_PREFIX_V13}: Script end. Admin SDK init attempt done (v13).`
);
