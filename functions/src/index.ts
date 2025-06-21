
/**
 * @file Cloud Functions pour l'application Brevet Panorama.
 * @author Florent Romero
 * @version 1.0.0
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

// Initialiser le SDK Admin Firebase.
try {
  admin.initializeApp();
  logger.info("Firebase Admin SDK initialisé avec succès.");
} catch (error) {
  logger.error("Erreur initialisation SDK Admin Firebase:", error);
}

const db = admin.firestore();
const ADMIN_EMAIL = "florent.romero@ac-montpellier.fr";

/**
 * Gère une nouvelle demande d'invitation d'un utilisateur.
 */
export const requestInvitation = onCall(
  {region: "europe-west1", invoker: "public"},
  async (request) => {
    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error("E-mail invalide ou manquant.", {email});
      throw new HttpsError("invalid-argument", "E-mail invalide.");
    }

    try {
      const collectionRef = db.collection("invitationRequests");
      const q = collectionRef
        .where("email", "==", email)
        .where("status", "==", "pending");

      const snapshot = await q.get();

      if (!snapshot.empty) {
        logger.info(`Demande existante pour ${email}.`);
        throw new HttpsError(
          "already-exists",
          `Demande pour ${email} en attente.`
        );
      }

      const newRequestRef = collectionRef.doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        notifiedAt: null,
      });

      logger.info(`Demande ID: ${newRequestRef.id} pour ${email}.`);
      return {
        success: true,
        message: `Demande pour ${email} enregistrée.`,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Échec écriture pour ${email}.`, {error});
      throw new HttpsError(
        "internal",
        "Erreur enregistrement demande."
      );
    }
  }
);

/**
 * Liste toutes les demandes d'invitation.
 */
export const listPendingInvitations = onCall(
  {region: "europe-west1"},
  async (request) => {
    const userEmail = request.auth?.token?.email;
    if (userEmail !== ADMIN_EMAIL) {
      throw new HttpsError("permission-denied", "Action non autorisée.");
    }

    try {
      const snapshot = await db.collection("invitationRequests")
        .orderBy("requestedAt", "desc")
        .get();

      if (snapshot.empty) {
        return {success: true, message: "Non trouvée.", invitations: []};
      }

      const invitations = snapshot.docs.map((doc) => {
        const data = doc.data();
        const requestedAt = data.requestedAt as admin.firestore.Timestamp;
        const notifiedAt = data.notifiedAt as admin.firestore.Timestamp;

        return {
          id: doc.id,
          email: data.email,
          status: data.status,
          requestedAt: requestedAt?.toDate().toISOString() ||
            new Date(0).toISOString(),
          notifiedAt: notifiedAt?.toDate().toISOString(),
        };
      });

      return {
        success: true,
        message: "Invitations récupérées.",
        invitations: invitations,
      };
    } catch (error) {
      logger.error("Échec récupération invitations.", {error});
      throw new HttpsError(
        "internal",
        "Erreur récupération invitations."
      );
    }
  }
);

/**
 * Approuve une demande d'invitation.
 */
export const approveInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    const userEmail = request.auth?.token?.email;
    if (userEmail !== ADMIN_EMAIL) {
      throw new HttpsError("permission-denied", "Action non autorisée.");
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      throw new HttpsError("invalid-argument", "ID d'invitation invalide.");
    }

    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
      const inviteDoc = await inviteRef.get();
      const inviteData = inviteDoc.data();

      if (!inviteDoc.exists) {
        throw new HttpsError("not-found", "Invitation non trouvée.");
      }

      if (inviteData?.status !== "pending") {
        const msg = `Invitation déjà traitée (${inviteData?.status}).`;
        throw new HttpsError("failed-precondition", msg);
      }

      const email = inviteData?.email;
      if (!email) {
        throw new HttpsError("internal", "Invitation corrompue (sans e-mail).");
      }

      let userCreationMessage = "";
      try {
        const tempPassword = crypto.randomBytes(16).toString("hex");
        await admin.auth().createUser({
          email: email,
          emailVerified: true,
          password: tempPassword,
          disabled: false,
        });
        userCreationMessage = "Compte créé. 'Mot de passe oublié'.";
        logger.info(`Compte créé pour ${email}.`);
      } catch (authError: unknown) {
        const error = authError as {code?: string; message?: string};
        if (error.code === "auth/email-already-exists") {
          userCreationMessage = "Compte e-mail déjà existant.";
          logger.warn(`Compte pour ${email} existe déjà.`);
        } else {
          logger.error(`Échec création pour ${email}.`, {error});
          throw new HttpsError("internal", `Échec création: ${error.message}`);
        }
      }

      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: `Approuvée. ${userCreationMessage}`,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Échec approbation pour ${invitationId}.`, {error});
      throw new HttpsError("internal", "Erreur interne à l'approbation.");
    }
  }
);

/**
 * Rejette une demande d'invitation.
 */
export const rejectInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    const userEmail = request.auth?.token?.email;
    if (userEmail !== ADMIN_EMAIL) {
      throw new HttpsError("permission-denied", "Action non autorisée.");
    }

    const {invitationId, reason} = request.data;
    if (!invitationId || typeof invitationId !== "string") {
      throw new HttpsError("invalid-argument", "ID invitation invalide.");
    }

    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
      const inviteDoc = await inviteRef.get();
      const inviteData = inviteDoc.data();

      if (!inviteDoc.exists) {
        throw new HttpsError("not-found", "Invitation non trouvée.");
      }

      if (inviteData?.status !== "pending") {
        const msg = `Invitation déjà traitée (${inviteData?.status}).`;
        throw new HttpsError("failed-precondition", msg);
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
        updatePayload.rejectionReason = reason.substring(0, 200);
      }

      await inviteRef.update(updatePayload);
      return {success: true, message: "Invitation rejetée."};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Échec rejet pour ${invitationId}.`, {error});
      throw new HttpsError("internal", "Erreur interne au rejet.");
    }
  }
);

/**
 * Marque une invitation approuvée comme 'notifiée'.
 */
export const markInvitationAsNotified = onCall(
  {region: "europe-west1"},
  async (request) => {
    const userEmail = request.auth?.token?.email;
    if (userEmail !== ADMIN_EMAIL) {
      throw new HttpsError("permission-denied", "Action non autorisée.");
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      throw new HttpsError("invalid-argument", "ID invitation invalide.");
    }

    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
      const inviteDoc = await inviteRef.get();
      const inviteData = inviteDoc.data();

      if (!inviteDoc.exists) {
        throw new HttpsError("not-found", "Invitation non trouvée.");
      }

      if (inviteData?.status !== "approved") {
        throw new HttpsError(
          "failed-precondition",
          "Seulement approuvées peuvent être notifiées."
        );
      }

      if (inviteData?.notifiedAt) {
        return {
          success: true,
          message: "Invitation déjà marquée comme notifiée.",
        };
      }

      await inviteRef.update({
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: "Invitation marquée comme 'notifiée'.",
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Échec notification pour ${invitationId}.`, {error});
      throw new HttpsError(
        "internal",
        "Erreur interne à la mise à jour."
      );
    }
  }
);
