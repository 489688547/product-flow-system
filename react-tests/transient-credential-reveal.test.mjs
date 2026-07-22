import assert from "node:assert/strict";
import test from "node:test";
import { createTransientRevealGate } from "../src/state/transientRevealGate.js";

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

test("a clear event aborts and rejects an in-flight credential reveal", async () => {
  const gate = createTransientRevealGate();
  const request = gate.begin();
  const pending = deferred();

  gate.invalidate();
  pending.resolve({ fields: { apiKey: "late-secret" } });
  const result = await pending.promise;

  assert.equal(request.signal.aborted, true);
  assert.equal(gate.accepts(request, { active: true, hidden: false }), false);
  assert.equal(result.fields.apiKey, "late-secret");
});

test("only the current visible and active request can publish a result", () => {
  const gate = createTransientRevealGate();
  const request = gate.begin();

  assert.equal(gate.accepts(request, { active: true, hidden: false }), true);
  assert.equal(gate.accepts(request, { active: false, hidden: false }), false);
  assert.equal(gate.accepts(request, { active: true, hidden: true }), false);

  const replacement = gate.begin();
  assert.equal(request.signal.aborted, true);
  assert.equal(gate.accepts(request, { active: true, hidden: false }), false);
  assert.equal(gate.accepts(replacement, { active: true, hidden: false }), true);
});
