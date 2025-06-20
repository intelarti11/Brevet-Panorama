
"use strict";
import {onCall, type HttpsOptions} from "firebase-functions/v2/https";
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
  let errMsg = "Unk err FB Admin init.";
  let errStack = "No stack trace.";
  if (error instanceof Error) {
    errMsg = error.message;
    errStack = error.stack || "No stack";
  }
  logger.error(
    `${LOG_PREFIX}: FB_INIT_FAIL.`,
    {m: errMsg.slice(0, 15), s: errStack.slice(0, 20), o: String(error).slice(0, 15)}
  );
  db = null;
  adminApp = null;
}

export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    const logMarker = "MIN";
    logger.info(
      `${logMarker}: Called.`,
      {d: request.data}
    );
    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        m: "DB UMF KO.",
        d: request.data,
      };
    }
    return {
      success: true,
      m: "UMF OK.",
      d: request.data,
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
    const logMarker = "REQ";
    logger.info(
      `${logMarker}: Called.`,
      {d: request.data}
    );

    if (!adminApp) {
      logger.error(`${logMarker}: AdminApp not init! Crit.`);
    }
    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        m: "Srv Err (DB KO).",
        d: request.data,
      };
    }

    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error(`${logMarker}: Invalid mail.`, {e: String(email).slice(0, 15)});
      return {
        success: false,
        m: "Mail invalide.",
        d: request.data,
      };
    }
    const emailShort = String(email).slice(0, 15);

    try {
      const coll = "invitationRequests";
      const query = db.collection(coll)
        .where("email", "==", email)
        .where("status", "==", "pending");
      const snap = await query.get();

      if (!snap.empty) {
        logger.info(`${logMarker}: Pend. req ${emailShort} exists.`);
        return {
          success: false,
          m: `Req ${emailShort} attente.`,
          d: request.data,
        };
      }

      const newRef = db.collection(coll).doc();
      await newRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        notifiedAt: null,
      });

      logger.info(`${logMarker}: OK ${emailShort}. ID: ${newRef.id.slice(0, 5)}`);
      return {
        success: true,
        m: `Req ${emailShort} OK.`,
        d: request.data,
      };
    } catch (writeError: unknown) {
      let errorMsg = "Unk FS write err.";
      if (writeError instanceof Error) {
        errorMsg = writeError.message;
      }
      logger.error(
        `${logMarker}: FS write KO ${emailShort}.`,
        {e: errorMsg.slice(0, 15), o: String(writeError).slice(0, 10)}
      );
      return {
        success: false,
        m: `Save KO: ${errorMsg.slice(0, 15)}`,
        d: request.data,
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
    const logMarker = "LST";
    logger.info(`${logMarker}: Func start. Listing all invites.`);

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        m: "Err srv: DB KO.",
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
          m: "0 inv.",
          invitations: [],
        };
      }

      const invitations = snapshot.docs.map((doc) => {
        const data = doc.data();
        const reqTs = data.requestedAt as admin.firestore.Timestamp;
        let reqAtISO: string;
        if (reqTs && typeof reqTs.toDate === "function") {
          reqAtISO = reqTs.toDate().toISOString();
        } else {
          logger.warn(`${logMarker}: Bad reqAt ${doc.id.slice(0, 5)}`, {
            ts: String(reqTs).slice(0, 10),
          });
          reqAtISO = new Date(0).toISOString();
        }

        const notifTs = data.notifiedAt as admin.firestore.Timestamp;
        let notifAtISO: string | undefined;
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
        m: "Liste OK.",
        invitations: invitations,
      };
    } catch (error: unknown) {
      let errorMsg = "Unk err listing.";
      if (error instanceof Error) {
        errorMsg = error.message;
      }
      logger.error(`${logMarker}: List fail. ${errorMsg.slice(0, 15)}`, {
        o: String(error).slice(0, 10),
      });
      return {
        success: false,
        m: `List KO: ${errorMsg.slice(0, 10)}`,
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
    const logMarker = "APR";
    logger.info(
      `${logMarker}: Called.`,
      {d: request.data}
    );

    if (!db || !adminApp) {
      logger.warn(`${logMarker}: DB/AdminApp KO.`);
      return {success: false, m: "Err srv (DB/Admin)."};
    }

    const invId = request.data.invitationId;
    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: String(invId).slice(0, 5)});
      return {success: false, m: "ID inv invalide."};
    }
    const invIdShort = String(invId).slice(0, 10);

    try {
      const invRef = db.collection("invitationRequests").doc(invId);
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, m: "Inv non trouvée."};
      }

      const docData = invDoc.data();
      if (docData?.status !== "pending") {
        logger.warn(`${logMarker}: Inv ${invIdShort} not pend. St: ${docData?.status}`);
        return {
          success: false,
          m: `Inv traitée (${docData?.status}).`,
        };
      }

      const email = docData?.email;
      if (!email || typeof email !== "string") {
        logger.error(`${logMarker}: Mail absent ${invIdShort}.`);
        return {success: false, m: "Mail absent."};
      }
      const emailShort = String(email).slice(0, 15);

      let userCrMsg = "";
      let userMsgShort = "";

      try {
        const tmpPwd = crypto.randomBytes(16).toString("hex");
        const userRec: UserRecord = await admin.auth().createUser({
          email: email,
          emailVerified: true,
          password: tmpPwd,
          disabled: false,
        });
        logger.info(`${logMarker}: Usr ${userRec.uid.slice(0, 5)} créé.`);
        userCrMsg = "Cpt créé. Mdp via 'Oublié'.";
        userMsgShort = "Usr ok.";
      } catch (authErrorUnknown: unknown) {
        const authErr = authErrorUnknown as {code?: string; message?: string};
        if (authErr.code === "auth/email-already-exists") {
          logger.warn(`${logMarker}: Usr ${emailShort} exists.`);
          userCrMsg = "Cpt existant.";
          userMsgShort = "Usr exist.";
        } else {
          const errMsg = authErr.message || "Auth err";
          logger.error(`${logMarker}: Auth KO: ${emailShort}.`, {e: errMsg.slice(0, 10)});
          return {success: false, m: `Auth KO: ${errMsg.slice(0, 10)}`};
        }
      }

      await invRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`${logMarker}: OK ${invIdShort}. ${userMsgShort}`);
      return {
        success: true,
        m: `Approuvé. ${userCrMsg}`,
      };
    } catch (err: unknown) {
      let errorMsg = "Unk err approving.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      logger.error(`${logMarker}: Appr KO ${invIdShort}.`,
        {e: errorMsg.slice(0, 15), o: String(err).slice(0, 10)}
      );
      return {success: false, m: `App. KO: ${errorMsg.slice(0, 15)}`};
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
    const logMarker = "REJ";
    logger.info(
      `${logMarker}: Called.`,
      {d: request.data}
    );

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {success: false, m: "Err srv (DB)."};
    }

    const invId = request.data.invitationId;
    const reason = request.data.reason;
    const invIdShort = String(invId).slice(0, 10);

    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: invIdShort});
      return {success: false, m: "ID inv invalide."};
    }

    try {
      const invRef = db.collection("invitationRequests").doc(invId);
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, m: "Inv non trouvée."};
      }

      const docData = invDoc.data();
      if (docData?.status !== "pending") {
        logger.warn(`${logMarker}: Inv ${invIdShort} not pend. St: ${docData?.status}`);
        return {
          success: false,
          m: `Inv traitée (${docData?.status}).`,
        };
      }

      const payload: {
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

      const emailLog = (docData?.email || "[no_mail]").slice(0, 15);
      logger.info(`${logMarker}: KO ${invIdShort} for ${emailLog}.`);
      return {success: true, m: `${emailLog} Rej.`};
    } catch (err: unknown) {
      let errorMsg = "Unk err rejecting.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      logger.error(`${logMarker}: Rej. KO ${invIdShort}.`,
        {e: errorMsg.slice(0, 15), o: String(err).slice(0, 10)}
      );
      return {success: false, m: `Rej. KO: ${errorMsg.slice(0, 15)}`};
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
    const logMarker = "NTF";
    logger.info(
      `${logMarker}: Called.`,
      {d: request.data}
    );

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {success: false, m: "Err srv (DB)."};
    }

    const invId = request.data.invitationId;
    const invIdShort = String(invId).slice(0, 10);
    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: invIdShort});
      return {success: false, m: "ID inv invalide."};
    }

    try {
      const invRef = db.collection("invitationRequests").doc(invId);
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, m: "Inv non trouvée."};
      }

      const docData = invDoc.data();
      if (docData?.status !== "approved") {
        const currSt = docData?.status ?? "unk";
        logger.warn(`${logMarker}: Inv ${invIdShort} not OK (St: ${currSt})`);
        return {success: false, m: "Inv not appr."};
      }
      if (docData?.notifiedAt) {
        logger.info(`${logMarker}: Inv ${invIdShort} already notified.`);
        return {success: true, m: "Inv déjà notif."};
      }

      await invRef.update({
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const emailLog = (docData?.email || "[no_mail]").slice(0, 15);
      logger.info(`${logMarker}: Inv ${invIdShort} for ${emailLog} notif.`);
      return {success: true, m: `Notif marquée ${emailLog}.`};
    } catch (err: unknown) {
      let errorMsg = "Err mark notif.";
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      logger.error(`${logMarker}: Mark notif KO ${invIdShort}.`,
        {e: errorMsg.slice(0, 15), o: String(err).slice(0, 10)}
      );
      return {success: false, m: `Notif KO: ${errorMsg.slice(0, 10)}`};
    }
  }
);

logger.info(
  `${LOG_PREFIX}: End. SDK init OK.`
);
