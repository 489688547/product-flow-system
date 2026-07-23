import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionIdempotencyKey,
  collectionTargetFromRequestData,
  resolveCollectionBusinessDatabase
} from "../functions/api/platform/_shared/collectionTarget.js";
import { createDataEnvironmentD1Mock } from "./helpers/data-environment-d1-mock.mjs";

test("collection targets come only from server request data and isolate idempotency", () => {
  const production = collectionTargetFromRequestData({});
  const display = collectionTargetFromRequestData({
    dataEnvironment: { id: "display", version: 7 }
  });
  assert.deepEqual(production, { environmentId: "production", environmentVersion: 1 });
  assert.deepEqual(display, { environmentId: "display", environmentVersion: 7 });
  assert.notEqual(
    collectionIdempotencyKey("source-1", production),
    collectionIdempotencyKey("source-1", display)
  );
});

test("a persisted display collection target must still match the ready environment version", async () => {
  const controlDb = createDataEnvironmentD1Mock();
  const displayDb = {};
  assert.equal(await resolveCollectionBusinessDatabase({
    env: { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: displayDb },
    controlDb,
    target: { environmentId: "display", environmentVersion: 7 }
  }), displayDb);
  await assert.rejects(
    () => resolveCollectionBusinessDatabase({
      env: { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: displayDb },
      controlDb,
      target: { environmentId: "display", environmentVersion: 6 }
    }),
    error => error?.code === "COLLECTION_TARGET_VERSION_CONFLICT"
  );
});
