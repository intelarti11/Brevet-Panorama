
"use strict";
import type {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type {UserRecord} from "firebase-admin/auth";
import * as crypto from "crypto";
import * as admin from "firebase-admin";

const LOG_PREFIX = "FN_V13";

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
} catch (eCatch: unknown) {
  let errMsg = "Unk err FB Admin init.";
  let errStack = "No stack trace.";
  if (eCatch instanceof Error) {
    errMsg = eCatch.message;
    errStack = eCatch.stack || "No stack";
  }
  logger.error(
    `${LOG_PREFIX}:INIT_KO ${String(eCatch).slice(0,30)}` // Line 34
  );
  db = null;
  adminApp = null;
}

export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (req) => {
    const logMarker = "MIN";
    logger.info(
      `${logMarker}: Called.`,
      {d: req.data}
    );
    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        m: "DB UMF KO.",
        d: req.data,
      };
    }
    return {
      success: true,
      m: "UMF OK.",
      d: req.data,
    };
  }
);

const requestInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};

export const requestInvitation = onCall(
  requestInvitationOptions,
  async (req) => {
    const logMarker = "REQ";
    logger.info(
      `${logMarker}: Called.`,
      {d: req.data}
    );

    if (!adminApp) {
      logger.error(`${logMarker}: AdminApp not init! Crit.`);
    }
    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {
        success: false,
        m: "Srv.DB KO.",
        d: req.data,
      };
    }

    const email = req.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error(`${logMarker}: Invalid mail.`, {e: String(email).slice(0, 8)});
      return {
        success: false,
        m: "Mail inv.",
        d: req.data,
      };
    }
    const emailShort = String(email).slice(0, 8);

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
          m: `Req ${emailShort} att.`,
          d: req.data,
        };
      }

      const newRef = db.collection(coll).doc();
      await newRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        notifiedAt: null,
      });

      logger.info(`${logMarker}:OK ${emailShort} ID:${newRef.id.slice(0,3)}`); // Line 92
      return {
        success: true,
        m: `Req ${emailShort} OK.`,
        d: req.data,
      };
    } catch (eCatch: unknown) {
      let errMsg = "Unk FS write err.";
      if (eCatch instanceof Error) {
        errMsg = eCatch.message;
      }
      logger.error(
        `${logMarker}:FS Wrt KO ${emailShort}`,
        {e: errMsg.slice(0, 2), o: String(eCatch).slice(0, 2)}
      );
      return {
        success: false,
        m: `Save KO: ${errMsg.slice(0, 8)}`,
        d: req.data,
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
        const dData = doc.data();
        const reqTs = dData.requestedAt as admin.firestore.Timestamp;
        let reqAtISO: string;
        if (reqTs && typeof reqTs.toDate === "function") {
          reqAtISO = reqTs.toDate().toISOString();
        } else {
          logger.warn(`${logMarker}:BadRA ${doc.id.sl(0,3)} TS:${String(reqTs).sl(0,3)}`); // Line 125, comma checked
          reqAtISO = new Date(0).toISOString();
        }

        const notifTs = dData.notifiedAt as admin.firestore.Timestamp;
        let notifAtISO: string | undefined;
        if (notifTs && typeof notifTs.toDate === "function") {
          notifAtISO = notifTs.toDate().toISOString();
        }

        return {
          id: doc.id,
          email: dData.email,
          requestedAt: reqAtISO,
          status: dData.status,
          notifiedAt: notifAtISO,
        };
      });
      logger.info(`${logMarker}: Found ${invitations.length} inv.`);
      return {
        success: true,
        m: "Liste OK.",
        invitations: invitations,
      };
    } catch (eCatch: unknown) {
      let errMsg = "Unk err listing.";
      if (eCatch instanceof Error) {
        errMsg = eCatch.message;
      }
      logger.error(
        `${logMarker}:Lst KO ${errMsg.slice(0, 3)}`,
        {o: String(eCatch).slice(0, 3)}
      );
      return {
        success: false,
        m: `Lst KO: ${errMsg.slice(0, 8)}`,
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
  async (req) => {
    const logMarker = "APR";
    logger.info(
      `${logMarker}: Called.`,
      {d: req.data}
    );

    if (!db || !adminApp) {
      logger.warn(`${logMarker}: DB/Adm KO.`);
      return {success: false, m: "Srv.DB/Adm KO."};
    }

    const invId = req.data.invitationId;
    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: String(invId).slice(0, 5)});
      return {success: false, m: "ID inv."};
    }
    const invIdShort = String(invId).slice(0, 8);

    try {
      const invRef = db.collection("invitationRequests").doc(invId);
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, m: "Inv no find."};
      }

      const dData = invDoc.data();
      if (dData?.status !== "pending") {
        logger.warn(`${logMarker}:Inv ${invIdShort} !pend St:${dData?.status}`); // Line 255
        return {
          success: false,
          m: `Inv done (${dData?.status}).`,
        };
      }

      const email = dData?.email;
      if (!email || typeof email !== "string") {
        logger.error(`${logMarker}: Mail absent ${invIdShort}.`);
        return {success: false, m: "Mail miss."};
      }
      const emailShort = String(email).slice(0, 8);

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
        logger.info(`${logMarker}:Usr ${userRec.uid.slice(0,3)} OK`); // Line 271
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
          logger.error(`${logMarker}:Auth KO ${emailShort}`, {e: errMsg.slice(0,3)});
          return {success: false, m: `Auth KO: ${errMsg.slice(0, 8)}`};
        }
      }

      await invRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`${logMarker}:OK ${invIdShort} ${userMsgShort}`); // Line 307
      return {
        success: true,
        m: `Approuvé. ${userCrMsg}`,
      };
    } catch (eCatch: unknown) {
      let errMsg = "Unk err approving.";
      if (eCatch instanceof Error) {
        errMsg = eCatch.message;
      }
      logger.error(
        `${logMarker}:Appr KO ${invIdShort}`,
        {e: errMsg.slice(0, 2), o: String(eCatch).slice(0, 2)}
      );
      return {success: false, m: `App. KO: ${errMsg.slice(0, 8)}`};
    }
  }
);

const rejectInvitationOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};
export const rejectInvitation = onCall(
  rejectInvitationOptions,
  async (req) => {
    const logMarker = "REJ";
    logger.info(
      `${logMarker}: Called.`,
      {d: req.data}
    );

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {success: false, m: "Srv.DB KO."};
    }

    const invId = req.data.invitationId;
    const reason = req.data.reason;
    const invIdShort = String(invId).slice(0, 8);

    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: invIdShort});
      return {success: false, m: "ID inv."};
    }

    try {
      const invRef = db.collection("invitationRequests").doc(invId);
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, m: "Inv no find."};
      }

      const dData = invDoc.data();
      if (dData?.status !== "pending") {
        logger.warn(`${logMarker}:Inv ${invIdShort} !pend St:${dData?.status}`); // Line 374
        return {
          success: false,
          m: `Inv done (${dData?.status}).`,
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

      const emailLog = (dData?.email || "[no_mail]").slice(0, 8);
      logger.info(`${logMarker}: KO ${invIdShort} for ${emailLog}.`);
      return {success: true, m: `${emailLog} Rej.`};
    } catch (eCatch: unknown) {
      let errMsg = "Unk err rej.";
      if (eCatch instanceof Error) {
        errMsg = eCatch.message;
      }
      logger.error(
        `${logMarker}:Rej KO ${invIdShort}`,
        {e: errMsg.slice(0, 1), o: String(eCatch).slice(0, 1)}
      );
      return {success: false, m: `RejKO:${errMsg.slice(0,7)}`};
    }
  }
);

const markInvitationAsNotifiedOptions: HttpsOptions = {
  region: "europe-west1",
  invoker: "public",
};
export const markInvitationAsNotified = onCall(
  markInvitationAsNotifiedOptions,
  async (req) => {
    const logMarker = "NTF";
    logger.info(
      `${logMarker}: Called.`,
      {d: req.data}
    );

    if (!db) {
      logger.warn(`${logMarker}: DB not init.`);
      return {success: false, m: "Srv.DB KO."};
    }

    const invId = req.data.invitationId;
    const invIdShort = String(invId).slice(0, 8);
    if (!invId || typeof invId !== "string") {
      logger.error(`${logMarker}: Invalid ID.`, {id: invIdShort});
      return {success: false, m: "ID inv."};
    }

    try {
      const invRef = db.collection("invitationRequests").doc(invId);
      const invDoc = await invRef.get();

      if (!invDoc.exists) {
        logger.warn(`${logMarker}: Inv ${invIdShort} not found.`);
        return {success: false, m: "Inv no find."};
      }

      const dData = invDoc.data();
      if (dData?.status !== "approved") {
        const currSt = dData?.status ?? "unk";
        logger.warn(`${logMarker}:Inv ${invIdShort} !OK St:${currSt}`);
        return {success: false, m: "Inv !appr."};
      }
      if (dData?.notifiedAt) {
        logger.info(`${logMarker}: Inv ${invIdShort} already notified.`);
        return {success: true, m: "Inv !notif."};
      }

      await invRef.update({
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const emailLog = (dData?.email || "[no_mail]").slice(0, 8);
      logger.info(`${logMarker}:Inv ${invIdShort} for ${emailLog} notif.`);
      return {success: true, m: `Notif marquée ${emailLog}.`};
    } catch (eCatch: unknown) {
      let errMsg = "Err mark notif.";
      if (eCatch instanceof Error) {
        errMsg = eCatch.message;
      }
      logger.error(
        `${logMarker}:Ntf KO ${invIdShort}`,
        {e: errMsg.slice(0, 1), o: String(eCatch).slice(0, 1)}
      );
      return {success: false, m: `NtfKO:${errMsg.slice(0,7)}`};
    }
  }
);

logger.info(
  `${LOG_PREFIX}: End. SDK OK.`
);
