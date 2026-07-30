import { successResponse } from "../_shared/http.js";
import { getExperimentalRun } from "../_shared/templateStorage.js";
import { runCollectorSessionRoute } from "../_shared/templateRoute.js";

export async function onRequest(context) {
  return runCollectorSessionRoute(context, {
    permission: "view",
    methods: ["GET"],
    handler: async ({ db, requestId, params }) => (
      successResponse(await getExperimentalRun(db, String(params?.id || "")), requestId)
    )
  });
}
