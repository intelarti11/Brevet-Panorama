
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Log prefix pour cette version (V11 avec écriture Firestore)
const LOG_PREFIX_V11 = "INIT_V11";

logger.info(
  `${LOG_PREFIX_V11}: Script top. About to init admin.`
);

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

// RequestInvitation - Maintenant avec écriture Firestore
const requestInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};

export const requestInvitation = onCall(
  requestInvitationOptions,
  async (request) => { // Note: 'async' est ajouté ici
    const logMarker = "INVITE_WRITE_V11_LOG";
    logger.info(
      `${logMarker}: Called. Data:`,
      {structuredData: true, data: request.data}
    );

    if (!adminApp) {
      logger.error(`${logMarker}: AdminApp not initialized! Critical.`);
    }
    if (!db) {
      logger.warn(`${logMarker}: Firestore (db) not initialized.`);
      return {
        success: false,
        message: "Erreur interne du serveur (Firestore indisponible).",
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
        `${logMarker}: Firestore write OK for ${email}. ID: ${newRequestRef.id}`
      );
      return {
        success: true,
        message: `Votre demande d'invitation pour ${email} a bien été enregistrée. Vous serez contacté une fois votre demande examinée.`,
        receivedData: request.data,
        // requestId: newRequestRef.id, // ID is not sent to client anymore
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
        message: `Échec de l'enregistrement de votre demande: ${errorMsg}`,
        receivedData: request.data,
      };
    }
  }
);

logger.info(
  `${LOG_PREFIX_V11}: Script end. Admin SDK init attempt done.`
);
