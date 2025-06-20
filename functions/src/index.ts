
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

const LOG_PREFIX_V10 = "INIT_V10";

logger.info(`${LOG_PREFIX_V10}: Script top. About to init admin.`);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(
    `${LOG_PREFIX_V10}: Attempting admin.initializeApp()...`
  );
  adminApp = admin.initializeApp();
  logger.info(
    `${LOG_PREFIX_V10}: admin.initializeApp() SUCCESS.`
  );

  logger.info(`${LOG_PREFIX_V10}: Attempting admin.firestore()...`);
  db = admin.firestore();
  logger.info(`${LOG_PREFIX_V10}: admin.firestore() SUCCESS.`);
  logger.info(
    `${LOG_PREFIX_V10}: Firebase Admin SDK initialized successfully.`
  );
} catch (error: any) {
  logger.error(
    `${LOG_PREFIX_V10}: CRITICAL_ERROR_DURING_FIREBASE_ADMIN_INIT.`,
    {
      errorMessage: error.message,
      errorStack: error.stack,
      errorObject: JSON.stringify(error),
    }
  );
  db = null; // Ensure db is null if init fails
  // We don't throw here to allow other minimal functions to potentially work
  // and to ensure these logs are sent.
}

// Ultra minimal function for basic testing
export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    logger.info(
      "ULTRA_MINIMAL_V10_LOG: ultraMinimalFunction called.",
      {structuredData: true, data: request.data}
    );
    if (!db) {
      logger.warn(
        "ULTRA_MINIMAL_V10_LOG: Firestore (db) is not initialized."
      );
      return {
        success: false,
        message: "Firestore not available.",
        receivedData: request.data,
      };
    }
    return {
      success: true,
      message: "Ultra minimal function (v10) executed successfully.",
      receivedData: request.data,
    };
  }
);

// Simplified requestInvitation for testing Firestore write
export const requestInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    logger.info(
      `${LOG_PREFIX_V10} - requestInvitation: Called.`,
      {data: request.data}
    );

    if (!db) {
      logger.error(
        `${LOG_PREFIX_V10} - requestInvitation: Firestore (db) is not initialized. Cannot process request.`
      );
      return {
        success: false,
        message: "Error: Firestore is not available. Request not processed.",
      };
    }

    const email = request.data.email;
    if (typeof email !== "string" || !email.includes("@")) {
      logger.warn(
        `${LOG_PREFIX_V10} - requestInvitation: Invalid email received.`,
        {email}
      );
      return {success: false, message: "Invalid email format."};
    }

    try {
      logger.info(
        `${LOG_PREFIX_V10} - requestInvitation: Attempting to write to Firestore for email: ${email}`
      );
      const docRef = db.collection("invitationRequests_debug_v10")
        .doc(email);
      await docRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending_debug_v10",
      });
      logger.info(
        `${LOG_PREFIX_V10} - requestInvitation: Firestore write SUCCESS for email: ${email}`
      );
      return {
        success: true,
        message: "Debug V10: Invitation request recorded (simulated).",
      };
    } catch (error: any) {
      logger.error(
        `${LOG_PREFIX_V10} - requestInvitation: Firestore write FAILED for email: ${email}`,
        {
          errorMessage: error.message,
          errorStack: error.stack,
        }
      );
      return {
        success: false,
        message: "Error: Could not write to Firestore.",
      };
    }
  }
);

logger.info(
  `${LOG_PREFIX_V10}: Script bottom. Functions defined. Admin SDK init attempted.`
);
