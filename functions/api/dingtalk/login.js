import { onRequest as createEmbeddedSession } from "../auth/dingtalk/embedded.js";

// Keep the original embedded endpoint working for clients with a cached bundle.
export const onRequest = createEmbeddedSession;
