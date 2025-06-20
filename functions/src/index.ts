
'use server'; // This directive is for Next.js server components/actions, not for Cloud Functions.
// It was likely a copy-paste error and might be causing issues. Removing it.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

console.log("ADMIN_SDK_REMOVED (DEBUG v7): Script loaded! Firebase Admin SDK is NOT initialized in this version.");

// --- Schémas Zod pour la validation des données d'entrée ---
// Schéma pour la demande d'invitation
const invitationRequestDataSchema = z.object({
    email: z.string().email({ message: "E-mail invalide." })
        .regex(/^[a-zA-Z0-9]+\.[a-zA-Z0-9]+@ac-montpellier\.fr$/, { message: "E-mail prenom.nom@ac-montpellier.fr requis." }),
});

// Schéma pour approuver/rejeter une invitation
const manageInvitationDataSchema = z.object({
    email: z.string().email({ message: "E-mail invalide." }),
});

// Schéma pour rejeter une invitation (avec raison optionnelle)
const rejectInvitationDataSchema = manageInvitationDataSchema.extend({
    reason: z.string().optional().describe("Raison optionnelle."),
});

// Schéma pour définir un rôle admin
const setAdminRoleDataSchema = z.object({
    email: z.string().email("E-mail invalide.").optional(),
    uid: z.string().min(1, "UID requis.").optional(),
}).refine((data) => data.email || data.uid, {
    message: "E-mail ou UID requis.",
    path: ["email"],
});


/**
 * Enregistre une nouvelle demande d'invitation.
 * ADMIN SDK REMOVED FOR DEBUGGING.
 */
export const requestInvitation = onCall({ region: "europe-west1", enforceAppCheck: true }, async (request) => {
    console.log("ADMIN_SDK_REMOVED (DEBUG v7) - requestInvitation called with:", request.data);
    try {
        const validResult = invitationRequestDataSchema.safeParse(request.data);
        if (!validResult.success) {
            const flatErrors = validResult.error.flatten();
            const errMsg = "Data invalides: " + flatErrors.formErrors.join(", ");
            console.error("ADMIN_SDK_REMOVED (DEBUG v7) - requestInvitation validation failed:", flatErrors);
            throw new HttpsError("invalid-argument", errMsg.slice(0, 40));
        }
        const { email } = validResult.data;
        console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - requestInvitation for ${email}. Firestore operations skipped.`);
        
        // Simulate success as Firestore is not available
        return { success: true, message: "DEBUG: Demande reçue (Firestore désactivé)." };

    } catch (error: any) {
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - Error in requestInvitation:", error.message);
        if (error instanceof HttpsError) {
            throw error;
        }
        let errMsg = "Echec demande.";
        if (error instanceof Error) errMsg = error.message.slice(0, 15);
        throw new HttpsError("internal", `DEBUG: ${errMsg}`);
    }
});

/**
 * Approuve une demande et crée un user Firebase Auth. Admin requis.
 * ADMIN SDK REMOVED FOR DEBUGGING.
 */
export const approveInvitation = onCall({ region: "europe-west1" }, async (request) => {
    console.log("ADMIN_SDK_REMOVED (DEBUG v7) - approveInvitation called with:", request.data);

    // Simulate auth check - normally this would use admin SDK
    if (!request.auth) { // Basic check, not actual admin role check
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - approveInvitation: Auth missing (simulated).");
        throw new HttpsError("permission-denied", "DEBUG: Droits admin simulés requis.");
    }
    console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - approveInvitation: Admin check passed (simulated).`);

    try {
        const validResult = manageInvitationDataSchema.safeParse(request.data);
        if (!validResult.success) {
            const flatErrors = validResult.error.flatten();
            console.error("ADMIN_SDK_REMOVED (DEBUG v7) - approveInvitation validation failed:", flatErrors);
            throw new HttpsError("invalid-argument", "Données invalides.");
        }
        const { email } = validResult.data;
        console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - approveInvitation for ${email}. Auth/Firestore operations skipped.`);
        
        // Simulate success
        return {
            success: true,
            message: `DEBUG: Invit. ${email} ok (Auth/Firestore désactivé).`,
        };
    } catch (error: any) {
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - Error in approveInvitation:", error.message);
        if (error instanceof HttpsError) {
            throw error;
        }
        let errMsg = "Echec approb.";
        if (error instanceof Error) errMsg = error.message.slice(0, 10);
        throw new HttpsError("internal", `DEBUG: ${errMsg}`);
    }
});

/**
 * Rejette une demande d'invitation. Admin requis.
 * ADMIN SDK REMOVED FOR DEBUGGING.
 */
export const rejectInvitation = onCall({ region: "europe-west1" }, async (request) => {
    console.log("ADMIN_SDK_REMOVED (DEBUG v7) - rejectInvitation called with:", request.data);
    
    if (!request.auth) { // Basic check
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - rejectInvitation: Auth missing (simulated).");
        throw new HttpsError("permission-denied", "DEBUG: Droits admin simulés requis.");
    }
    console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - rejectInvitation: Admin check passed (simulated).`);

    try {
        const validResult = rejectInvitationDataSchema.safeParse(request.data);
        if (!validResult.success) {
            const flatErrors = validResult.error.flatten();
            console.error("ADMIN_SDK_REMOVED (DEBUG v7) - rejectInvitation validation failed:", flatErrors);
            throw new HttpsError("invalid-argument", "Données invalides.");
        }
        const { email, reason } = validResult.data;
        console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - rejectInvitation for ${email} (reason: ${reason || 'none'}). Firestore ops skipped.`);
        
        // Simulate success
        return {
            success: true,
            message: `DEBUG: Invitation pour ${email} rejetée (Firestore désactivé).`,
        };
    } catch (error: any) {
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - Error in rejectInvitation:", error.message);
        if (error instanceof HttpsError) {
            throw error;
        }
        let errMsg = "Echec rejet.";
        if (error instanceof Error) errMsg = error.message.slice(0, 15);
        throw new HttpsError("internal", `DEBUG: ${errMsg}`);
    }
});

/**
 * Liste invitations en attente. Admin requis.
 * ADMIN SDK REMOVED FOR DEBUGGING.
 */
export const listPendingInvitations = onCall({ region: "europe-west1" }, async (request) => {
    console.log("ADMIN_SDK_REMOVED (DEBUG v7) - listPendingInvitations called.");

    if (!request.auth ) { // Basic check
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - listPendingInvitations: Auth missing (simulated).");
        throw new HttpsError("permission-denied", "DEBUG: Droits admin simulés requis.");
    }
    console.log("ADMIN_SDK_REMOVED (DEBUG v7) - listPendingInvitations: Admin check passed (simulated). Firestore ops skipped.");

    try {
        // Simulate returning an empty list
        return { success: true, invitations: [] };
    } catch (error: any) {
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - Error in listPendingInvitations:", error.message);
        let errMsg = "Echec liste.";
        if (error instanceof Error) errMsg = error.message.slice(0, 15);
        throw new HttpsError("internal", `DEBUG: ${errMsg}`);
    }
});

/**
 * Attribue le rôle d'admin. Nécessite que l'appelant soit admin.
 * ADMIN SDK REMOVED FOR DEBUGGING.
 */
export const setAdminRole = onCall({ region: "europe-west1" }, async (request) => {
    console.log("ADMIN_SDK_REMOVED (DEBUG v7) - setAdminRole called with:", request.data);
    
    if (!request.auth) { // Basic check
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - setAdminRole: Auth missing (simulated).");
        throw new HttpsError("permission-denied", "DEBUG: Droits admin simulés requis.");
    }
    console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - setAdminRole: Admin check passed (simulated).`);

    try {
        const validResult = setAdminRoleDataSchema.safeParse(request.data);
        if (!validResult.success) {
            const flatErrors = validResult.error.flatten();
            console.error("ADMIN_SDK_REMOVED (DEBUG v7) - setAdminRole validation failed:", flatErrors);
            throw new HttpsError("invalid-argument", "Err. données.");
        }
        const { email, uid: providedUid } = validResult.data;
        const targetIdentifier = email || providedUid;
        console.log(`ADMIN_SDK_REMOVED (DEBUG v7) - setAdminRole for ${targetIdentifier}. Auth operations skipped.`);

        // Simulate success
        return {
            success: true,
            message: `DEBUG: Rôle admin pour ${targetIdentifier} (Auth désactivé).`,
        };
    } catch (error: any) {
        console.error("ADMIN_SDK_REMOVED (DEBUG v7) - Error in setAdminRole:", error.message);
        if (error instanceof HttpsError) {
            throw error;
        }
        let errMsg = "Echec rôle admin.";
        if (error instanceof Error) errMsg = error.message.slice(0, 15);
        throw new HttpsError("internal", `DEBUG: ${errMsg}`);
    }
});

console.log("ADMIN_SDK_REMOVED (DEBUG v7): End of script. Functions defined without Admin SDK.");
