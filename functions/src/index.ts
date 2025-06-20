
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

// Schéma de validation pour l'approbation
const approveInvitationSchema = z.object({
  email: z.string().email({ message: "Adresse e-mail invalide." }),
  // Alternativement, vous pourriez utiliser un ID de document si vous préférez
  // invitationId: z.string().min(1, { message: "L'ID de la demande est requis."}),
});

/**
 * Enregistre une nouvelle demande d'invitation.
 * Appelée par le frontend lorsqu'un utilisateur soumet le formulaire de demande.
 */
export const requestInvitation = functions.region("europe-west1").https.onCall(async (data, context) => {
  functions.logger.info("Nouvelle demande d'invitation reçue:", data);

  try {
    // Validation des données d'entrée
    const validationResult = invitationRequestSchema.safeParse(data);
    if (!validationResult.success) {
      functions.logger.error("Validation échouée pour requestInvitation:", validationResult.error.flatten());
      throw new functions.https.HttpsError("invalid-argument", "Données invalides: " + validationResult.error.flatten().formErrors.join(", "));
    }

    const { email } = validationResult.data;

    // Vérifier si une demande existe déjà pour cet e-mail
    const existingRequestQuery = await db.collection("invitationRequests")
      .where("email", "==", email)
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
      // Si rejected, on pourrait permettre une nouvelle demande ou la mettre à jour
      // Pour l'instant, on crée une nouvelle demande ou on met à jour si elle était rejected.
      await db.collection("invitationRequests").doc(existingRequestQuery.docs[0].id).set({
        email: email.toLowerCase(),
        status: "pending", // "pending", "approved", "rejected"
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      functions.logger.info(`Demande d'invitation mise à jour pour ${email}`);
      return { success: true, message: "Votre demande d'invitation a été soumise avec succès." };
    }

    // Enregistrer la nouvelle demande dans Firestore
    await db.collection("invitationRequests").add({
      email: email.toLowerCase(),
      status: "pending", // "pending", "approved", "rejected"
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Demande d'invitation enregistrée pour ${email}`);
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
  // Vérifiez ici que l'appelant est un administrateur.
  // Cela se fait généralement en vérifiant les custom claims de l'utilisateur authentifié.
  // Exemple :
  // if (!context.auth || !context.auth.token.admin) {
  //   functions.logger.error("Accès non autorisé à approveInvitation:", context.auth);
  //   throw new functions.https.HttpsError("permission-denied", "Vous n'avez pas les droits pour effectuer cette action.");
  // }
  // Pour cet exemple, la vérification admin est commentée. VOUS DEVEZ L'IMPLÉMENTER.
  functions.logger.warn("approveInvitation: LA VÉRIFICATION DES DROITS ADMIN EST DÉSACTIVÉE POUR L'EXEMPLE. À IMPLÉMENTER ABSOLUMENT !");


  try {
    const validationResult = approveInvitationSchema.safeParse(data);
    if (!validationResult.success) {
      functions.logger.error("Validation échouée pour approveInvitation:", validationResult.error.flatten());
      throw new functions.https.HttpsError("invalid-argument", "Données invalides pour l'approbation.");
    }

    const { email } = validationResult.data;

    // Trouver la demande d'invitation dans Firestore
    const requestQuery = await db.collection("invitationRequests")
      .where("email", "==", email.toLowerCase())
      .where("status", "==", "pending") // On ne peut approuver que les demandes en attente
      .limit(1)
      .get();

    if (requestQuery.empty) {
      throw new functions.https.HttpsError("not-found", `Aucune demande d'invitation en attente trouvée pour ${email}.`);
    }

    const invitationDoc = requestQuery.docs[0];

    // Créer l'utilisateur dans Firebase Authentication
    // Un mot de passe temporaire peut être généré ou vous pouvez utiliser
    // le flux de réinitialisation de mot de passe de Firebase Auth pour que l'utilisateur définisse le sien.
    // Pour cet exemple, nous ne créons pas de mot de passe ici.
    // L'utilisateur devra utiliser le flux "mot de passe oublié" après création.
    // Ou vous pourriez envoyer un lien de création de mot de passe (plus complexe).
    let userRecord;
    try {
        userRecord = await admin.auth().createUser({
            email: email.toLowerCase(),
            emailVerified: false, // L'e-mail est vérifié par le format ac-montpellier.fr
            // Vous pouvez définir un mot de passe temporaire ici si vous le souhaitez :
            // password: "temporaryPassword123!", // Assurez-vous qu'il soit conforme
            disabled: false,
        });
        functions.logger.info("Utilisateur créé avec succès:", userRecord.uid, "pour email:", email);
    } catch (authError: any) {
        if (authError.code === 'auth/email-already-exists') {
            functions.logger.warn(`Tentative d'approbation pour un e-mail déjà existant dans Auth: ${email}`);
            // Marquer la demande comme approuvée si l'utilisateur existe déjà dans Auth
            // mais n'était pas approuvé dans la collection 'invitationRequests'.
            await db.collection("invitationRequests").doc(invitationDoc.id).update({
                status: "approved",
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                approvedBy: context.auth?.uid || "unknown_admin_or_system", // ID de l'admin qui approuve
                authUid: authError.uid || null, // Si l'erreur fournit l'UID de l'utilisateur existant
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { success: true, message: `L'utilisateur ${email} existe déjà dans Firebase Auth. La demande a été marquée comme approuvée.` };
        }
        functions.logger.error("Erreur lors de la création de l'utilisateur dans Firebase Auth:", authError);
        throw new functions.https.HttpsError("internal", "Erreur lors de la création de l'utilisateur.", authError.message);
    }


    // Mettre à jour le statut de la demande dans Firestore
    await db.collection("invitationRequests").doc(invitationDoc.id).update({
      status: "approved",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: context.auth?.uid || "unknown_admin_or_system", // ID de l'admin qui approuve (si disponible)
      authUid: userRecord.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Optionnel : Ajouter l'utilisateur à une collection "users" avec son rôle
    // await db.collection("users").doc(userRecord.uid).set({
    //   email: userRecord.email,
    //   role: "user", // ou tout autre rôle par défaut
    //   createdAt: admin.firestore.FieldValue.serverTimestamp(),
    // });

    functions.logger.info(`Invitation approuvée et utilisateur créé pour ${email}`);
    // Ici, vous pourriez déclencher un e-mail pour informer l'utilisateur.
    // Pour l'instant, l'utilisateur devra utiliser "mot de passe oublié"
    // pour définir son mot de passe s'il n'a pas été défini lors de la création.

    return { success: true, message: `L'invitation pour ${email} a été approuvée. L'utilisateur peut maintenant se connecter (il devra peut-être réinitialiser son mot de passe).` };

  } catch (error: any) {
    functions.logger.error("Erreur dans approveInvitation:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "Une erreur est survenue lors de l'approbation.", error.message);
  }
});

// Vous pouvez ajouter d'autres fonctions ici, par exemple pour rejeter une invitation,
// lister les demandes, assigner des rôles d'admin, etc.
// Pensez à toujours sécuriser les fonctions qui modifient des données ou accordent des accès.
    