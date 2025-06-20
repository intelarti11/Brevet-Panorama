
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

const LOG_PREFIX_V11 = "INIT_V11";

logger.info(`${LOG_PREFIX_V11}: Script top. About to init admin.`);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(
    `${LOG_PREFIX_V11}: Attempting admin.initializeApp()...`
  );
  adminApp = admin.initializeApp();
  logger.info(
    `${LOG_PREFIX_V11}: admin.initializeApp() SUCCESS.`
  );

  logger.info(`${LOG_PREFIX_V11}: Attempting admin.firestore()...`);
  db = admin.firestore();
  logger.info(`${LOG_PREFIX_V11}: admin.firestore() SUCCESS.`);
  logger.info(
    `${LOG_PREFIX_V11}: Firebase Admin SDK initialized successfully.`
  );
} catch (error: unknown) {
  let errorMessage = "Unknown error during Firebase Admin init.";
  let errorStack = "No stack trace for Firebase Admin init error.";
  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "No stack trace available";
  }
  logger.error(
    `${LOG_PREFIX_V11}: CRITICAL_ERROR_DURING_FIREBASE_ADMIN_INIT.`,
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
    const logMarker = "ULTRA_MINIMAL_V11_LOG";
    logger.info(
      `${logMarker}: ultraMinimalFunction called.`,
      {structuredData: true, data: request.data}
    );
    if (!db) {
      logger.warn(
        `${logMarker}: Firestore (db) is not initialized.`
      );
      return {
        success: false,
        message: "Firestore not available for ultraMinimalFunction.",
        receivedData: request.data,
      };
    }
    return {
      success: true,
      message: "Ultra minimal function (v11) executed successfully.",
      receivedData: request.data,
    };
  }
);

// RequestInvitation - SIMPLIFIED VERSION FOR DEPLOYMENT TEST
export const requestInvitation = onCall(
  {region: "europe-west1"},
  (request) => {
    const logMarker = "REQUEST_INVITATION_SIMPLIFIED_V11_LOG";
    logger.info(
      `${logMarker}: requestInvitation (simplified) called.`,
      {structuredData: true, data: request.data}
    );

    if (!adminApp) {
      logger.error(`${logMarker}: AdminApp not initialized!`);
      // Ne pas retourner ici, test de fin de fonction
    }
    if (!db) {
      logger.warn(
        `${logMarker}: Firestore (db) is not initialized.`
      );
      return {
        success: false,
        message: "Simplified v11: Firestore unavailable for requestInvite.",
        receivedData: request.data,
      };
    }

    // Pas d'écriture Firestore, juste un log et un retour
    logger.info(
      `${logMarker}: Email rcvd (not processed): ${request.data.email}`
    );
    return {
      success: true,
      message: "Simplified v11: Req logged. No Firestore write in this ver.",
      receivedData: request.data,
    };
  }
);

logger.info(
  `${LOG_PREFIX_V11}: Script bottom. Functions defined. Admin SDK init attempted.`
);
