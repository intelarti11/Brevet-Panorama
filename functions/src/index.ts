
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {z} from "zod";

// Initialiser Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  functions.logger.error("Firebase admin initialization error", e);
}

const db = admin.firestore();

// Schéma de validation pour les demandes d'invitation
const invitationRequestSchema = z.object({
  email: z.string().email({ message: "Adresse e-mail invalide." })
    .regex(/^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/, { message: "L'adresse e-mail doit être au format prénom.nom@ac-montpellier.fr" }),
});

// Schéma de validation pour l'approbation ou le rejet
const manageInvitationSchema = z.object({
  email: z.string().email({ message: "Adresse e-mail invalide." }),
  // Alternativement, vous pourriez utiliser un ID de document si vous préférez
  // invitationId: z.string().min(1, { message: "L'ID de la demande est requis."}),
});

const rejectInvitationSchema = manageInvitationSchema.extend({
    reason: z.string().optional().describe("Raison optionnelle du rejet."),
});


/**
 * Enregistre une nouvelle demande d'invitation.
 * Appelée par le frontend lorsqu'un utilisateur soumet le formulaire de demande.
 */
export const requestInvitation = functions.region("europe-west1").https.onCall(async (data, context) => {
  functions.logger.info("Nouvelle demande d'invitation reçue:", data);

  try {
    const validationResult = invitationRequestSchema.safeParse(data);
    if (!validationResult.success) {
      functions.logger.error("Validation échouée pour requestInvitation:", validationResult.error.flatten());
      throw new functions.https.HttpsError("invalid-argument", "Données invalides: " + validationResult.error.flatten().formErrors.join(", "));
    }

    const { email } = validationResult.data;
    const lowerEmail = email.toLowerCase();

    const existingRequestQuery = await db.collection("invitationRequests")
      .where("email", "==", lowerEmail)
      .limit(1)
      .get();

    if (!existingRequestQuery.empty) {
      const existingRequest = existingRequestQuery.docs[0].data();
      if (existingRequest.status === "approved") {
        throw new functions.https.HttpsError("already-exists", "Un compte existe déjà pour cet e-mail.");
      }
      if (existingRequest.status === "pending") {
         throw new functions.https.HttpsError("already-exists", "Une demande d'invitation est déjà en cours pour cet e-mail.");
      }
      await db.collection("invitationRequests").doc(existingRequestQuery.docs[0].id).set({
        email: lowerEmail,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      functions.logger.info(`Demande d'invitation mise à jour pour ${lowerEmail}`);
      return { success: true, message: "Votre demande d'invitation a été soumise avec succès." };
    }

    await db.collection("invitationRequests").add({
      email: lowerEmail,
      status: "pending",
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Demande d'invitation enregistrée pour ${lowerEmail}`);
    return { success: true, message: "Votre demande d'invitation a été soumise avec succès." };

  } catch (error: any) {
    functions.logger.error("Erreur dans requestInvitation:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "Une erreur est survenue lors du traitement de votre demande.", error.message);
  }
});


/**
 * Approuve une demande d'invitation et crée un utilisateur dans Firebase Auth.
 * DEVRAIT ÊTRE APPELÉE UNIQUEMENT PAR UN ADMINISTRATEUR via une interface sécurisée.
 */
export const approveInvitation = functions.region("europe-west1").https.onCall(async (data, context) => {
  functions.logger.info("Approbation d'invitation reçue:", data);

  // !!! IMPORTANT SÉCURITÉ !!!
  // Décommentez et implémentez une vérification robuste des droits d'administrateur ici.
  // Par exemple, en vérifiant un custom claim:
  // if (!context.auth || !context.auth.token.admin) {
  //   functions.logger.error("Accès non autorisé à approveInvitation:", context.auth);
  //   throw new functions.https.HttpsError("permission-denied", "Vous n'avez pas les droits pour effectuer cette action.");
  // }
  // Pour cet exemple, la vérification admin est commentée. VOUS DEVEZ L'IMPLÉMENTER.
  functions.logger.warn("approveInvitation: LA VÉRIFICATION DES DROITS ADMIN EST DÉSACTIVÉE POUR L'EXEMPLE. À IMPLÉMENTER ABSOLUMENT !");


  try {
    const validationResult = manageInvitationSchema.safeParse(data);
    if (!validationResult.success) {
      functions.logger.error("Validation échouée pour approveInvitation:", validationResult.error.flatten());
      throw new functions.https.HttpsError("invalid-argument", "Données invalides pour l'approbation.");
    }

    const { email } = validationResult.data;
    const lowerEmail = email.toLowerCase();

    const requestQuery = await db.collection("invitationRequests")
      .where("email", "==", lowerEmail)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (requestQuery.empty) {
      throw new functions.https.HttpsError("not-found", `Aucune demande d'invitation en attente trouvée pour ${lowerEmail}.`);
    }

    const invitationDoc = requestQuery.docs[0];
    let userRecord;

    try {
        userRecord = await admin.auth().createUser({
            email: lowerEmail,
            emailVerified: false, 
            disabled: false,
        });
        functions.logger.info("Utilisateur créé avec succès:", userRecord.uid, "pour email:", lowerEmail);
    } catch (authError: any) {
        if (authError.code === 'auth/email-already-exists') {
            functions.logger.warn(`Tentative d'approbation pour un e-mail déjà existant dans Auth: ${lowerEmail}`);
            // Marquer la demande comme approuvée si l'utilisateur existe déjà dans Auth
            let existingUser;
            try {
                existingUser = await admin.auth().getUserByEmail(lowerEmail);
            } catch (getUserError) {
                 functions.logger.error(`Erreur en essayant de récupérer l'utilisateur existant ${lowerEmail} par e-mail:`, getUserError);
                 throw new functions.https.HttpsError("internal", "Erreur lors de la vérification de l'utilisateur existant.", (getUserError as Error).message);
            }

            await db.collection("invitationRequests").doc(invitationDoc.id).update({
                status: "approved",
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                approvedBy: context.auth?.uid || "unknown_admin_or_system", 
                authUid: existingUser.uid, 
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { success: true, message: `L'utilisateur ${lowerEmail} existe déjà dans Firebase Auth. La demande a été marquée comme approuvée.` };
        }
        functions.logger.error("Erreur lors de la création de l'utilisateur dans Firebase Auth:", authError);
        throw new functions.https.HttpsError("internal", "Erreur lors de la création de l'utilisateur.", authError.message);
    }

    await db.collection("invitationRequests").doc(invitationDoc.id).update({
      status: "approved",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: context.auth?.uid || "unknown_admin_or_system",
      authUid: userRecord.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Invitation approuvée et utilisateur créé pour ${lowerEmail}`);
    return { success: true, message: `L'invitation pour ${lowerEmail} a été approuvée. L'utilisateur peut maintenant se connecter.` };

  } catch (error: any) {
    functions.logger.error("Erreur dans approveInvitation:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "Une erreur est survenue lors de l'approbation.", error.message);
  }
});


/**
 * Rejette une demande d'invitation.
 * DEVRAIT ÊTRE APPELÉE UNIQUEMENT PAR UN ADMINISTRATEUR via une interface sécurisée.
 */
export const rejectInvitation = functions.region("europe-west1").https.onCall(async (data, context) => {
  functions.logger.info("Rejet d'invitation reçu:", data);

  // !!! IMPORTANT SÉCURITÉ !!!
  // Décommentez et implémentez une vérification robuste des droits d'administrateur ici.
  // if (!context.auth || !context.auth.token.admin) {
  //   functions.logger.error("Accès non autorisé à rejectInvitation:", context.auth);
  //   throw new functions.https.HttpsError("permission-denied", "Vous n'avez pas les droits pour effectuer cette action.");
  // }
  functions.logger.warn("rejectInvitation: LA VÉRIFICATION DES DROITS ADMIN EST DÉSACTIVÉE POUR L'EXEMPLE. À IMPLÉMENTER ABSOLUMENT !");

  try {
    const validationResult = rejectInvitationSchema.safeParse(data);
    if (!validationResult.success) {
      functions.logger.error("Validation échouée pour rejectInvitation:", validationResult.error.flatten());
      throw new functions.https.HttpsError("invalid-argument", "Données invalides pour le rejet.");
    }

    const { email, reason } = validationResult.data;
    const lowerEmail = email.toLowerCase();

    const requestQuery = await db.collection("invitationRequests")
      .where("email", "==", lowerEmail)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (requestQuery.empty) {
      throw new functions.https.HttpsError("not-found", `Aucune demande d'invitation en attente trouvée pour ${lowerEmail}.`);
    }

    const invitationDoc = requestQuery.docs[0];

    await db.collection("invitationRequests").doc(invitationDoc.id).update({
      status: "rejected",
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: context.auth?.uid || "unknown_admin_or_system",
      rejectionReason: reason || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Invitation rejetée pour ${lowerEmail}`);
    return { success: true, message: `L'invitation pour ${lowerEmail} a été rejetée.` };

  } catch (error: any) {
    functions.logger.error("Erreur dans rejectInvitation:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "Une erreur est survenue lors du rejet.", error.message);
  }
});

/**
 * Liste les demandes d'invitation en attente.
 * DEVRAIT ÊTRE APPELÉE UNIQUEMENT PAR UN ADMINISTRATEUR via une interface sécurisée.
 */
export const listPendingInvitations = functions.region("europe-west1").https.onCall(async (data, context) => {
  functions.logger.info("Demande de listage des invitations en attente reçue.");

  // !!! IMPORTANT SÉCURITÉ !!!
  // Décommentez et implémentez une vérification robuste des droits d'administrateur ici.
  // if (!context.auth || !context.auth.token.admin) {
  //   functions.logger.error("Accès non autorisé à listPendingInvitations:", context.auth);
  //   throw new functions.https.HttpsError("permission-denied", "Vous n'avez pas les droits pour effectuer cette action.");
  // }
  functions.logger.warn("listPendingInvitations: LA VÉRIFICATION DES DROITS ADMIN EST DÉSACTIVÉE POUR L'EXEMPLE. À IMPLÉMENTER ABSOLUMENT !");

  try {
    const snapshot = await db.collection("invitationRequests")
      .where("status", "==", "pending")
      .orderBy("requestedAt", "desc")
      .get();

    if (snapshot.empty) {
      return { invitations: [] };
    }

    const invitations = snapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        email: docData.email,
        requestedAt: docData.requestedAt.toDate().toISOString(), // Convertir Timestamp en ISO string
        status: docData.status,
      };
    });

    return { invitations };

  } catch (error: any) {
    functions.logger.error("Erreur dans listPendingInvitations:", error);
    throw new functions.https.HttpsError("internal", "Une erreur est survenue lors de la récupération des invitations.", error.message);
  }
});
    

    