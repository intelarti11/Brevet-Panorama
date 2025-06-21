
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

// Initialiser le SDK Admin Firebase.
// Il est préférable de le faire une seule fois.
try {
  admin.initializeApp();
  logger.info("Firebase Admin SDK initialisé avec succès.");
} catch (error) {
  logger.error("Erreur lors de l'initialisation du SDK Admin Firebase:", error);
}

const db = admin.firestore();


/**
 * Gère une nouvelle demande d'invitation d'un utilisateur.
 * Attend un e-mail dans les données de la requête.
 * Crée un nouveau document dans la collection 'invitationRequests'.
 */
export const requestInvitation = onCall(
  {region: "europe-west1", invoker: "public"},
  async (request) => {
    const email = request.data.email;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      logger.error("requestInvitation: E-mail invalide ou manquant.", {email});
      throw new onCall.HttpsError("invalid-argument", "L'adresse e-mail fournie est invalide.");
    }

    try {
      const collectionRef = db.collection("invitationRequests");
      const existingQuery = collectionRef
        .where("email", "==", email)
        .where("status", "==", "pending");

      const existingSnapshot = await existingQuery.get();

      if (!existingSnapshot.empty) {
        logger.info(`requestInvitation: Une demande pour ${email} existe déjà.`);
        throw new onCall.HttpsError("already-exists", `Une demande pour l'adresse ${email} est déjà en attente.`);
      }

      const newRequestRef = collectionRef.doc();
      await newRequestRef.set({
        email: email,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        notifiedAt: null,
      });

      logger.info(`requestInvitation: Demande créée pour ${email} avec l'ID: ${newRequestRef.id}`);
      return {
        success: true,
        message: `Votre demande pour ${email} a été enregistrée.`,
      };
    } catch (error) {
      if (error instanceof onCall.HttpsError) {
        throw error;
      }
      logger.error(`requestInvitation: Échec de l'écriture pour ${email}.`, {error});
      throw new onCall.HttpsError("internal", "Une erreur est survenue lors de l'enregistrement de votre demande.");
    }
  }
);

/**
 * Liste toutes les demandes d'invitation, triées par date de demande (plus récentes en premier).
 * Destinée à l'interface d'administration.
 */
export const listPendingInvitations = onCall(
  {region: "europe-west1"},
  async (request) => {
    if (request.auth?.token?.email !== 'florent.romero@ac-montpellier.fr') {
        throw new onCall.HttpsError('permission-denied', 'Vous n\'avez pas la permission d\'exécuter cette action.');
    }

    try {
      const snapshot = await db.collection("invitationRequests")
        .orderBy("requestedAt", "desc")
        .get();

      if (snapshot.empty) {
        return {
          success: true,
          message: "Aucune demande d'invitation trouvée.",
          invitations: [],
        };
      }

      const invitations = snapshot.docs.map((doc) => {
        const data = doc.data();
        const requestedAt = data.requestedAt as admin.firestore.Timestamp;
        const notifiedAt = data.notifiedAt as admin.firestore.Timestamp;

        return {
          id: doc.id,
          email: data.email,
          status: data.status,
          requestedAt: requestedAt?.toDate().toISOString() || new Date(0).toISOString(),
          notifiedAt: notifiedAt?.toDate().toISOString(),
        };
      });

      return {
        success: true,
        message: "Invitations récupérées avec succès.",
        invitations: invitations,
      };
    } catch (error) {
      logger.error("listPendingInvitations: Échec de la récupération des invitations.", {error});
      throw new onCall.HttpsError("internal", "Une erreur est survenue lors de la récupération des invitations.");
    }
  }
);

/**
 * Approuve une demande d'invitation.
 * Attend un invitationId dans les données de la requête.
 * Met à jour le statut à 'approved' et crée un utilisateur Firebase Auth.
 */
export const approveInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    if (request.auth?.token?.email !== 'florent.romero@ac-montpellier.fr') {
        throw new onCall.HttpsError('permission-denied', 'Vous n\'avez pas la permission d\'exécuter cette action.');
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      throw new onCall.HttpsError("invalid-argument", "L'ID d'invitation est manquant ou invalide.");
    }

    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
      const inviteDoc = await inviteRef.get();

      if (!inviteDoc.exists) {
        throw new onCall.HttpsError("not-found", "L'invitation spécifiée n'a pas été trouvée.");
      }

      const inviteData = inviteDoc.data();
      if (inviteData?.status !== "pending") {
        throw new onCall.HttpsError("failed-precondition", `Cette invitation a déjà été traitée (statut: ${inviteData?.status}).`);
      }

      const emailToApprove = inviteData?.email;
      if (!emailToApprove) {
        throw new onCall.HttpsError("internal", "L'invitation est corrompue et n'a pas d'e-mail associé.");
      }

      let userCreationMessage = "";
      try {
        const tempPassword = crypto.randomBytes(16).toString("hex");
        await admin.auth().createUser({
          email: emailToApprove,
          emailVerified: true,
          password: tempPassword,
          disabled: false,
        });
        userCreationMessage = "Compte créé. Utilisez 'Mot de passe oublié' pour vous connecter.";
        logger.info(`approveInvitation: Compte utilisateur créé pour ${emailToApprove}.`);
      } catch (authError: any) {
        if (authError.code === "auth/email-already-exists") {
          userCreationMessage = "Un compte avec cet e-mail existe déjà.";
          logger.warn(`approveInvitation: Le compte pour ${emailToApprove} existe déjà.`);
        } else {
          logger.error(`approveInvitation: Échec de création pour ${emailToApprove}.`, {authError});
          throw new onCall.HttpsError("internal", `La création de l'utilisateur a échoué: ${authError.message}`);
        }
      }

      await inviteRef.update({
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, message: `Invitation approuvée. ${userCreationMessage}` };
    } catch (error) {
      if (error instanceof onCall.HttpsError) throw error;
      logger.error(`approveInvitation: Échec pour l'invitation ${invitationId}.`, {error});
      throw new onCall.HttpsError("internal", "Une erreur interne est survenue lors de l'approbation.");
    }
  }
);

/**
 * Rejette une demande d'invitation.
 * Attend un invitationId dans les données de la requête.
 * Met à jour le statut à 'rejected'.
 */
export const rejectInvitation = onCall(
  {region: "europe-west1"},
  async (request) => {
    if (request.auth?.token?.email !== 'florent.romero@ac-montpellier.fr') {
        throw new onCall.HttpsError('permission-denied', 'Vous n\'avez pas la permission d\'exécuter cette action.');
    }

    const { invitationId, reason } = request.data;
    if (!invitationId || typeof invitationId !== "string") {
      throw new onCall.HttpsError("invalid-argument", "L'ID d'invitation est manquant ou invalide.");
    }

    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
      const inviteDoc = await inviteRef.get();
      if (!inviteDoc.exists) {
        throw new onCall.HttpsError("not-found", "L'invitation spécifiée n'a pas été trouvée.");
      }
      
      const inviteData = inviteDoc.data();
      if (inviteData?.status !== "pending") {
        throw new onCall.HttpsError("failed-precondition", `Cette invitation a déjà été traitée (statut: ${inviteData?.status}).`);
      }

      const updatePayload: { status: string; rejectedAt: admin.firestore.FieldValue; rejectionReason?: string; } = {
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (reason && typeof reason === "string" && reason.trim() !== "") {
        updatePayload.rejectionReason = reason.substring(0, 200);
      }

      await inviteRef.update(updatePayload);
      return { success: true, message: "L'invitation a été rejetée." };
    } catch (error) {
      if (error instanceof onCall.HttpsError) throw error;
      logger.error(`rejectInvitation: Échec pour l'invitation ${invitationId}.`, {error});
      throw new onCall.HttpsError("internal", "Une erreur interne est survenue lors du rejet.");
    }
  }
);

/**
 * Marque une invitation approuvée comme 'notifiée'.
 * Attend un invitationId dans les données de la requête.
 */
export const markInvitationAsNotified = onCall(
  {region: "europe-west1"},
  async (request) => {
    if (request.auth?.token?.email !== 'florent.romero@ac-montpellier.fr') {
        throw new onCall.HttpsError('permission-denied', 'Vous n\'avez pas la permission d\'exécuter cette action.');
    }

    const invitationId = request.data.invitationId;
    if (!invitationId || typeof invitationId !== "string") {
      throw new onCall.HttpsError("invalid-argument", "L'ID d'invitation est manquant ou invalide.");
    }

    const inviteRef = db.collection("invitationRequests").doc(invitationId);

    try {
        const inviteDoc = await inviteRef.get();
        if (!inviteDoc.exists) {
            throw new onCall.HttpsError("not-found", "L'invitation spécifiée n'a pas été trouvée.");
        }
        
        const inviteData = inviteDoc.data();
        if (inviteData?.status !== 'approved') {
            throw new onCall.HttpsError("failed-precondition", "Seules les invitations approuvées peuvent être marquées comme notifiées.");
        }

        if (inviteData?.notifiedAt) {
            return { success: true, message: "Cette invitation est déjà marquée comme notifiée." };
        }

        await inviteRef.update({
            notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        return { success: true, message: "L'invitation a été marquée comme 'notifiée'." };
    } catch (error) {
        if (error instanceof onCall.HttpsError) throw error;
        logger.error(`markInvitationAsNotified: Échec pour l'invitation ${invitationId}.`, {error});
        throw new onCall.HttpsError("internal", "Une erreur interne est survenue lors de la mise à jour.");
    }
  }
);

    