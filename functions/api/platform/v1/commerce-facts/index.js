import { businessDatabase } from "../../_shared/dataEnvironment.js";
import { authorizeWebCollectionView } from "../web-collection/_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { normalizeCommerceFactFilters, queryCommerceFacts } from "./_shared/storage.js";

function filtersFromRequest(request) {
  const url = new URL(request.url);
  const input = {};
  for (const [key, value] of url.searchParams.entries()) input[key] = value;
  return normalizeCommerceFactFilters(input);
}

export async function onRequest(context) {
  const id = requestId();
  try {
    if (context.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: "GET, OPTIONS" } });
    }
    if (context.request.method !== "GET") {
      throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    }
    authorizeWebCollectionView(context.data?.session);
    const db = businessDatabase(context);
    return successResponse(await queryCommerceFacts(db, filtersFromRequest(context.request)), id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
