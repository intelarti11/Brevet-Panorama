
"use strict";
import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type {UserRecord} from "firebase-admin/auth";
import * as crypto from "crypto";
import * as admin from "firebase-admin";

const LOG_PREFIX = "FN_V13"; // Raccourci

logger.info(`${LOG_PREFIX}: Top. Admin init.`);

let db: admin.firestore.Firestore | null = null;
let adminApp: admin.app.App | null = null;

try {
  logger.info(`${LOG_PREFIX}: Admin.initializeApp()...`);
  adminApp = admin.initializeApp();
  logger.info(`${LOG_PREFIX}: admin.initializeApp() OK.`);

  logger.info(`${LOG_PREFIX}: Admin.firestore()...`);
  db = admin.firestore();
  logger.info(`${LOG_PREFIX}: admin.firestore() OK.`);
  logger.info(`${LOG_PREFIX}: FB Admin SDK init OK.`);
} catch (error: unknown) {
  let errMsg = "Unk err FB Admin init."; // Raccourci
  let errStack = "No stack trace."; // Raccourci
  if (error instanceof Error) {
    errMsg = error.message;
    errStack = error.stack || "No stack"; // Raccourci
  }
  logger.error(
    `${LOG_PREFIX}: FB_INIT_FAIL.`, // Raccourci
    // Raccourcir les clés et les valeurs
    {m: errMsg.slice(0, 20), s: errStack.slice(0, 30), o: String(error).slice(0, 20)}
  );
  db = null;
  adminApp = null;
}

export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    const logMarker = "MIN"; // Raccourci
    logger.info(
      `${logMarker}: Called.`,
      {structuredData: true, d: request.data} // Clé 'd'
    );
    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        message: "DB UMF KO.", // Raccourci
        receivedData: request.data,
      };
    }
    return {
      success: true,
      message: "UMF OK.", // Raccourci
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
    const logMarker = "REQ"; // Raccourci
    logger.info(
      `${logMarker}: Called.`,
      {structuredData: true, d: request.data} // Clé 'd'
    );

    if (!adminApp) {
      logger.error(`${logMarker}: AdminApp not init! Crit.`);
    }
    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        message: "Srv Err (DB KO).", // Raccourci
        receivedData: request.data,
      };
    }

    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error(`${logMarker}: Invalid mail.`, {email: String(email).slice(0,15)});
      return {
        success: false,
        message: "Mail invalide.", // Raccourci
        receivedData: request.data,
      };
    }
    const emailShort = String(email).slice(0,15);

    try {
      const coll = "invitationRequests"; // Raccourci
      const query = db.collection(coll)
        .where("email", "==", email)
        .where("status", "==", "pending");
      const snap = await query.get(); // Raccourci

      if (!snap.empty) {
        logger.info(`${logMarker}: Pend. req ${emailShort} exists.`);
        return {
          success: false,
          message: `Req ${emailShort} attente.`, // Raccourci
          receivedData: request.data,
        };
      }

      const newRef = db.collection(coll).doc(); // Raccourci
      await newRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        notifiedAt: null,
      });

      logger.info(`${logMarker}: OK ${emailShort}. ID: ${newRef.id.slice(0, 5)}`);
      return {
        success: true,
        message: `Req ${emailShort} OK.`, // Raccourci
        receivedData: request.data,
      };
    } catch (writeError: unknown) {
      let errorMsg = "Unk FS write err."; // Raccourci
      if (writeError instanceof Error) {
        errorMsg = writeError.message;
      }
      logger.error(
        `${logMarker}: FS write KO ${emailShort}.`,
        {err: errorMsg.slice(0, 15), orig: String(writeError).slice(0, 10)}
      );
      return {
        success: false,
        message: `Save KO: ${errorMsg.slice(0, 15)}`, // Raccourci
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
    const logMarker = "LST"; // Raccourci
    logger.info(`${logMarker}: Func start. Listing all invites.`);

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        message: "Err srv: DB KO.", // Raccourci
        invitations: [],
      };
    }

    try {
      const query = db.collection("invitationRequests")
        .orderBy("requestedAt", "desc");
      const snapshot = await query.get();

      if (snapshot.empty) {
        logger.info(`${logMarker}: No inv found.`);
        return {
          success: true,
          message: "0 inv.", // Raccourci
          invitations: [],
        };
      }

      const invitations = snapshot.docs.map((doc) => {
        const data = doc.data();
        const reqTs = data.requestedAt as admin.firestore.Timestamp; // Raccourci
        let reqAtISO: string; // Raccourci
        if (reqTs && typeof reqTs.toDate === "function") {
          reqAtISO = reqTs.toDate().toISOString();
        } else {
          logger.warn(`${logMarker}: Bad reqAt ${doc.id.slice(0,5)}`, {
            ts: String(reqTs).slice(0, 10),
          });
          reqAtISO = new Date(0).toISOString();
        }

        const notifTs = data.notifiedAt as admin.firestore.Timestamp; // Raccourci
        let notifAtISO: string | undefined; // Raccourci
        if (notifTs && typeof notifTs.toDate === "function") {
          notifAtISO = notifTs.toDate().toISOString();
        }

        return {
          id: doc.id,
          email: data.email,
          requestedAt: reqAtISO,
          status: data.status,
          notifiedAt: notifAtISO,
        };
      });
      logger.info(`${logMarker}: Found ${invitations.length} inv.`);
      return {
        success: true,
        message: "Liste OK.", // Raccourci
        invitations: invitations,
      };
    } catch (error: unknown) {
      let errorMsg = "Unk err listing."; // Raccourci
      if (error instanceof Error) {
        errorMsg = error.message;
      }
      logger.error(`${logMarker}: List fail. ${errorMsg.slice(0, 15)}`, {
        orig: String(error).slice(0, 10),
      });
      return {
        success: false,
        message: `Err liste: ${errorMsg.slice(0, 15)}`, // Raccourci
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
    const logMarker = "APR"; // Raccourci
    logger.info(
      `${logMarker}: Called.`,
      {structuredData: true, d: request.data} // Clé 'd'
    );

    if (!db || !adminApp) {
      logger.warn(`${logMarker}: DB/AdminApp KO.`);
      return {success: false, message: "Err srv (DB/Admin)."};
    }

    const invId = request.data.invitationId; // Raccourci
    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: String(invId).slice(0,5)});
      return {success: false, message: "ID inv invalide."}; // Raccourci
    }
    const invIdShort = String(invId).slice(0,10);

    try {
      const invRef = db.collection("invitationRequests").doc(invId); // Raccourci
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, message: "Inv non trouvée."}; // Raccourci
      }

      const docData = invDoc.data();
      if (docData?.status !== "pending") {
        logger.warn(`${logMarker}: Inv ${invIdShort} not pend. St: ${docData?.status}`);
        return {
          success: false,
          message: `Inv traitée (${docData?.status}).`, // Raccourci
        };
      }

      const email = docData?.email; // Raccourci
      if (!email || typeof email !== "string") {
        logger.error(`${logMarker}: Mail absent ${invIdShort}.`);
        return {success: false, message: "Mail absent."}; // Raccourci
      }
      const emailShort = String(email).slice(0,15);

      let userCrMsg = ""; // Raccourci
      let userMsgShort = "";

      try {
        const tmpPwd = crypto.randomBytes(16).toString("hex"); // Raccourci
        const userRec: UserRecord = await admin.auth().createUser({ // Raccourci
          email: email,
          emailVerified: true,
          password: tmpPwd,
          disabled: false,
        });
        logger.info(`${logMarker}: Usr ${userRec.uid.slice(0,5)} créé.`);
        userCrMsg = "Cpt créé. Mdp via 'Oublié'."; // Raccourci
        userMsgShort = "Usr ok.";
      } catch (authErrorUnknown: unknown) {
        const authErr = authErrorUnknown as {code?: string; message?: string}; // Raccourci
        if (authErr.code === "auth/email-already-exists") {
          logger.warn(`${logMarker}: Usr ${emailShort} exists.`);
          userCrMsg = "Cpt existant."; // Raccourci
          userMsgShort = "Usr exist.";
        } else {
          const errMsg = authErr.message || "Auth err"; // Raccourci
          logger.error(`${logMarker}: Auth KO: ${emailShort}.`, {e: errMsg.slice(0,10)});
          return {success: false, message: `Auth KO: ${errMsg.slice(0,10)}`}; // Raccourci
        }
      }

      await invRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`${logMarker}: OK ${invIdShort}. ${userMsgShort}`);
      return {
        success: true,
        message: `Approuvé. ${userCrMsg}`, // Raccourci
      };
    } catch (err: unknown) {
      let errorMsg = "Unk err approving."; // Raccourci
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      logger.error(`${logMarker}: Appr KO ${invIdShort}.`, 
        {e: errorMsg.slice(0,15), o: String(err).slice(0,10)} // Clés 'e', 'o'
      );
      return {success: false, message: `App. KO: ${errorMsg.slice(0,15)}`}; // Raccourci
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
    const logMarker = "REJ"; // Raccourci
    logger.info(
      `${logMarker}: Called.`,
      {structuredData: true, d: request.data} // Clé 'd'
    );

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {success: false, message: "Err srv (DB)."}; // Raccourci
    }

    const invId = request.data.invitationId; // Raccourci
    const reason = request.data.reason;
    const invIdShort = String(invId).slice(0,10);

    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: invIdShort});
      return {success: false, message: "ID inv invalide."}; // Raccourci
    }

    try {
      const invRef = db.collection("invitationRequests").doc(invId); // Raccourci
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, message: "Inv non trouvée."}; // Raccourci
      }

      const docData = invDoc.data();
      if (docData?.status !== "pending") {
        logger.warn(`${logMarker}: Inv ${invIdShort} not pend. St: ${docData?.status}`);
        return {
          success: false,
          message: `Inv traitée (${docData?.status}).`, // Raccourci
        };
      }

      const payload: { // Raccourci
        status: string;
        rejectedAt: admin.firestore.FieldValue;
        rejectionReason?: string;
      } = {
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (reason && typeof reason === "string" && reason.trim() !== "") {
        payload.rejectionReason = reason.substring(0, 50);
      }

      await invRef.update(payload);

      const emailLog = (docData?.email || "[no_mail]").slice(0,15); // Raccourci
      logger.info(`${logMarker}: KO ${invIdShort} for ${emailLog}.`);
      return {success: true, message: `${emailLog} Rej.`}; // Raccourci
    } catch (err: unknown) {
      let errorMsg = "Unk err rejecting."; // Raccourci
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      logger.error(`${logMarker}: Rej. KO ${invIdShort}.`,
        {e: errorMsg.slice(0,15), o: String(err).slice(0,10)} // Clés 'e', 'o'
      );
      return {success: false, message: `Rej. KO: ${errorMsg.slice(0,15)}`}; // Raccourci
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
    const logMarker = "NTF"; // Raccourci
    logger.info(
      `${logMarker}: Called.`,
      {structuredData: true, d: request.data} // Clé 'd'
    );

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {success: false, message: "Err srv (DB)."}; // Raccourci
    }

    const invId = request.data.invitationId; // Raccourci
    const invIdShort = String(invId).slice(0,10);
    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: invIdShort});
      return {success: false, message: "ID inv invalide."}; // Raccourci
    }

    try {
      const invRef = db.collection("invitationRequests").doc(invId); // Raccourci
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, message: "Inv non trouvée."}; // Raccourci
      }

      const docData = invDoc.data();
      if (docData?.status !== "approved") {
        const currSt = docData?.status ?? "unk"; // Raccourci
        logger.warn(`${logMarker}: Inv ${invIdShort} not OK (St: ${currSt})`);
        return {success: false, message: "Inv not appr."}; // Raccourci
      }
      if (docData?.notifiedAt) {
        logger.info(`${logMarker}: Inv ${invIdShort} already notified.`);
        return {success: true, message: "Inv déjà notif."}; // Raccourci
      }

      await invRef.update({
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const emailLog = (docData?.email || "[no_mail]").slice(0,15); // Raccourci
      logger.info(`${logMarker}: Inv ${invIdShort} for ${emailLog} notif.`);
      return {success: true, message: `Notif marquée ${emailLog}.`}; // Raccourci
    } catch (err: unknown) {
      let errorMsg = "Err mark notif."; // Raccourci
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      logger.error(`${logMarker}: Mark notif KO ${invIdShort}.`,
        {e: errorMsg.slice(0,15), o: String(err).slice(0,10)} // Clés 'e', 'o'
      );
      return {success: false, message: `Notif KO: ${errorMsg.slice(0,10)}`}; // Raccourci
    }
  }
);

logger.info(
  `${LOG_PREFIX}: End. SDK init OK.` // Raccourci
);
