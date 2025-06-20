
console.log("MINIMAL_FUNCTION_LOG_MARKER (v6): Script loaded!");

import { onCall, type HttpsError } from "firebase-functions/v2/https";

// A very simple function to ensure Firebase has something to deploy.
// Replace 'minimalTestFunction' with the name of one of your existing functions
// if you want to test calling it, e.g., 'requestInvitation'.
// For now, we'll use a new name to avoid conflicts with existing triggers
// if they are somehow still partially registered.
export const minimalTestFunction = onCall(
  { region: "europe-west1" },
  (request) => {
    console.log("MINIMAL_FUNCTION_LOG_MARKER (v6): minimalTestFunction was called with data:", request.data);
    return {
      success: true,
      message: "Minimal function executed successfully!",
      receivedData: request.data,
    };
  }
);

// To prevent "Function load error: Error: connect ECONNREFUSED /tmp/firestore.sock"
// if firebase-admin was initialized but no functions were exported.
// In this minimal version, we are not initializing firebase-admin, so this is less critical,
// but it's good practice if you were to re-add admin init without actual functions.
// However, since we are exporting minimalTestFunction, this is not strictly needed.

console.log("MINIMAL_FUNCTION_LOG_MARKER (v6): End of script.");
