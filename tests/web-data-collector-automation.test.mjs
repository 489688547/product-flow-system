import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTENSION_ID,
  collectorLaunchAgentPlist,
  validatePairingKey,
  validateRunnerToken
} from "../scripts/web-data-collector/automation.mjs";

test("web collector validates separate runner and pairing secrets", () => {
  assert.equal(validateRunnerToken(`wdc_${"a".repeat(48)}`), true);
  assert.equal(validatePairingKey(`wcp_${"b".repeat(48)}`), true);
  assert.equal(validateRunnerToken(`wcp_${"b".repeat(48)}`), false);
  assert.match(EXTENSION_ID, /^[a-p]{32}$/);
});

test("LaunchAgent keeps the loopback runner alive and pins the repository entrypoint", () => {
  const plist = collectorLaunchAgentPlist({
    nodePath: "/usr/local/bin/node",
    collectorPath: "/repo/scripts/web-data-collector/index.mjs",
    root: "/Users/company/Desktop/company-data-archive",
    baseUrl: "https://flow.example.com"
  });
  assert.match(plist, /com\.company\.web-data-collector/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<key>KeepAlive<\/key>/);
  assert.match(plist, /<true\/>/);
  assert.doesNotMatch(plist, /pairing|wdc_|wcp_/i);
});
