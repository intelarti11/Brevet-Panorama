
// ULTRA_MINIMAL_V9
import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Ce log est crucial. S'il n'apparaît PAS dans les logs du CONTENEUR Cloud Run
// (pas les logs de la fonction, mais les logs stdout/stderr du conteneur lui-même),
// alors le script n'est même pas chargé par Node.js.
console.log(
  "ULTRA_MINIMAL_V9_LOG: Top of index.ts. Attempting to load. Region: europe-west1"
);

export const ultraMinimalFunction = onCall(
  { region: "europe-west1" }, // Spécifier la région est une bonne pratique
  (request) => {
    logger.info(
      "ULTRA_MINIMAL_V9_LOG: ultraMinimalFunction was called.",
      { structuredData: true, data: request.data }
    );
    return {
      success: true,
      message: "Ultra minimal function (v9) executed successfully.",
      receivedData: request.data,
    };
  }
);

console.log(
  "ULTRA_MINIMAL_V9_LOG: End of index.ts. ultraMinimalFunction defined."
);
