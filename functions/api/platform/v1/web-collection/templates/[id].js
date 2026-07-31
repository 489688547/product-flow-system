import { successResponse } from "../_shared/http.js";
import { getCollectorTemplate } from "../_shared/templateStorage.js";
import { runCollectorSessionRoute } from "../_shared/templateRoute.js";

export async function onRequest(context) {
  return runCollectorSessionRoute(context, {
    permission: "view",
    methods: ["GET"],
    handler: async ({ db, requestId, params }) => (
      successResponse(
        await getCollectorTemplate(db, String(params?.id || "")),
        requestId
      )
    )
  });
}
