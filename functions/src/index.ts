
// ULTRA_MINIMAL_V9
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Ce log est crucial.
console.log(
  "ULTRA_MINIMAL_V9_LOG: Top of index.ts. Load. Region: europe-west1"
);

export const ultraMinimalFunction = onCall(
  {region: "europe-west1"},
  (request) => {
    logger.info(
      "ULTRA_MINIMAL_V9_LOG: ultraMinimalFunction called.",
      {structuredData: true, data: request.data}
    );
    return {
      success: true,
      message: "Ultra minimal function (v9) executed successfully.",
      receivedData: request.data,
    };
  }
);

console.log(
  "ULTRA_MINIMAL_V9_LOG: End of index.ts. Func defined."
);
