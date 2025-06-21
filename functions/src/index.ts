
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

const MATIERES_AUTORISEES = [
  "Mathématiques",
  "Français",
  "Histoire-Géographie-Enseignement moral et civique",
  "Technologie",
  "Physique-Chimie",
  "Sciences de la Vie et de la Terre",
];

/**
 * Vérifie si l'appelant est un administrateur.
 * @param {string | undefined} email L'email de l'utilisateur.
 * @throws {HttpsError} Si l'utilisateur n'est pas un administrateur.
 */
function ensureIsAdmin(email: string | undefined): void {
  if (email !== ADMIN_EMAIL) {
    logger.warn(`Tentative non autorisée par: ${email}`);
    throw new HttpsError("permission-denied", "Action non autorisée.");
  }
}

/**
 * Gère une nouvelle demande d'invitation.
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
      throw new HttpsError("internal", "Erreur enregistrement demande.");
    }
  }
);

/**
 * Liste toutes les demandes d'invitation en attente.
 */
export const listPendingInvitations = onCall(
  {region: "europe-west1"},
  async (request) => {
    ensureIsAdmin(request.auth?.token?.email);

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
      throw new HttpsError("internal", "Erreur récupération invitations.");
    }
  }
);

/**
 * Approuve une demande d'invitation.
 */
export const approveInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    ensureIsAdmin(request.auth?.token?.email);

    const {invitationId} = request.data;
    if (!invitationId || typeof invitationId !== "string") {
      throw new HttpsError("invalid-argument", "ID invitation invalide.");
    }
    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
      const inviteDoc = await inviteRef.get();
      if (!inviteDoc.exists) {
        throw new HttpsError("not-found", "Invitation non trouvée.");
      }
      const inviteData = inviteDoc.data();
      if (inviteData?.status !== "pending") {
        const msg = `Invitation déjà traitée (${inviteData?.status}).`;
        throw new HttpsError("failed-precondition", msg);
      }
      const email = inviteData?.email;
      if (!email) {
        throw new HttpsError("internal", "Invitation corrompue.");
      }
      let userCreationMessage = "";
      try {
        const tempPassword = crypto.randomBytes(16).toString("hex");
        await admin.auth().createUser({
          email: email, emailVerified: true, password: tempPassword,
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
          throw new HttpsError("internal", `Échec: ${error.message}`);
        }
      }
      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {success: true, message: `Approuvée. ${userCreationMessage}`};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Échec approbation ${invitationId}.`, {error});
      throw new HttpsError("internal", "Erreur interne approbation.");
    }
  }
);

/**
 * Rejette une demande d'invitation.
 */
export const rejectInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    ensureIsAdmin(request.auth?.token?.email);
    const {invitationId, reason} = request.data;
    if (!invitationId || typeof invitationId !== "string") {
      throw new HttpsError("invalid-argument", "ID invitation invalide.");
    }
    const inviteRef = db.collection("invitationRequests").doc(invitationId);
    try {
      const inviteDoc = await inviteRef.get();
      if (!inviteDoc.exists) {
        throw new HttpsError("not-found", "Invitation non trouvée.");
      }
      const inviteData = inviteDoc.data();
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
      logger.error(`Échec rejet ${invitationId}.`, {error});
      throw new HttpsError("internal", "Erreur interne rejet.");
    }
  }
);

/**
 * Marque une invitation approuvée comme 'notifiée'.
 */
export const markInvitationAsNotified = onCall(
  {region: "europe-west1"},
  async (request) => {
    ensureIsAdmin(request.auth?.token?.email);
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
        throw new HttpsError("failed-precondition", "Non approuvée.");
      }
      if (inviteData?.notifiedAt) {
        return {success: true, message: "Déjà marquée comme notifiée."};
      }
      await inviteRef.update({
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {success: true, message: "Invitation marquée 'notifiée'."};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Échec notif. ${invitationId}.`, {error});
      throw new HttpsError("internal", "Erreur interne MàJ.");
    }
  }
);

/**
 * Liste tous les utilisateurs de Firebase Auth.
 */
export const listAllUsers = onCall(
  {region: "europe-west1"},
  async (request) => {
    ensureIsAdmin(request.auth?.token?.email);

    try {
      const listUsersResult = await admin.auth().listUsers(1000);
      const users = listUsersResult.users.map((userRecord) => {
        return {
          uid: userRecord.uid,
          email: userRecord.email,
          customClaims: userRecord.customClaims,
        };
      });
      return {success: true, users: users};
    } catch (error) {
      logger.error("Erreur listage utilisateurs:", {error});
      throw new HttpsError("internal", "Erreur listage utilisateurs.");
    }
  }
);

/**
 * Assigne une matière à un utilisateur via les custom claims.
 */
export const setUserSubject = onCall(
  {region: "europe-west1"},
  async (request) => {
    ensureIsAdmin(request.auth?.token?.email);

    const {uid, subject} = request.data;

    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "UID utilisateur manquant.");
    }
    if (!subject || typeof subject !== "string") {
      throw new HttpsError("invalid-argument", "Matière manquante.");
    }
    if (!MATIERES_AUTORISEES.includes(subject)) {
      throw new HttpsError("invalid-argument", "Matière non valide.");
    }

    try {
      await admin.auth().setCustomUserClaims(uid, {subject: subject});
      logger.info(`Matière ${subject} assignée à ${uid}.`);
      return {
        success: true,
        message: `Matière ${subject} assignée avec succès.`,
      };
    } catch (error) {
      logger.error(`Échec assignation matière pour ${uid}:`, {error});
      throw new HttpsError("internal", "Erreur assignation matière.");
    }
  }
);

/**
 * Met à jour les notes d'un brevet blanc pour une série d'élèves.
 */
export const updateBrevetBlancNotes = onCall(
  {region: "europe-west1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const subject = request.auth.token.subject as string;
    if (!subject || !MATIERES_AUTORISEES.includes(subject)) {
      throw new HttpsError(
        "permission-denied",
        "Vous n'avez pas la permission de saisir des notes pour cette matière."
      );
    }

    const updates = request.data.updates as {
      studentId: string;
      noteBB1: number | null;
      noteBB2: number | null;
    }[];

    if (!Array.isArray(updates)) {
      throw new HttpsError(
        "invalid-argument",
        "Les données fournies sont invalides."
      );
    }

    const batch = db.batch();

    for (const update of updates) {
      const {studentId, noteBB1, noteBB2} = update;
      if (!studentId || typeof studentId !== "string") {
        logger.warn("ID élève manquant ou invalide dans le lot.", {update});
        continue;
      }
      
      const studentRef = db.collection("BrevetBlanc").doc(studentId);
      const notesToSet: {[key: string]: number} = {};

      if (noteBB1 !== null && !isNaN(noteBB1)) {
        notesToSet["bb1"] = noteBB1;
      }
      if (noteBB2 !== null && !isNaN(noteBB2)) {
        notesToSet["bb2"] = noteBB2;
      }
      
      // Use dot notation to update the specific subject field within the 'notes' map.
      // This will create or overwrite the subject's notes.
      batch.set(studentRef, {
        notes: {
          [subject]: notesToSet,
        },
      }, {merge: true});
    }

    try {
      await batch.commit();
      logger.info(
        `${updates.length} notes mises à jour pour la matière ${subject} ` +
        `par ${request.auth.token.email}.`
      );
      return {success: true, message: "Notes enregistrées avec succès."};
    } catch (error) {
      logger.error(
        "Échec de la mise à jour des notes du brevet blanc:", {error}
      );
      throw new HttpsError("internal", "Erreur lors de la sauvegarde des notes.");
    }
  }
);
