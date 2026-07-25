import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function managedBrowserRuntime() {
  return import("../scripts/browser-runtime/managed-chrome.mjs").catch(() => ({}));
}

test("managed Chrome profiles are deterministic and never use a personal default profile", async () => {
  const { managedChromeProfile } = await managedBrowserRuntime();
  assert.equal(typeof managedChromeProfile, "function", "managedChromeProfile must be implemented");

  const rootDir = join(homedir(), "Library", "Application Support", "Product Flow Collector", "Profiles");
  const profile = managedChromeProfile({
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    rootDir
  });

  assert.equal(profile.profileKey, "douyin-ecommerce:90862283");
  assert.equal(profile.providerId, "douyin-ecommerce");
  assert.equal(profile.storeId, "90862283");
  assert.match(profile.profileDir, /Product Flow Collector\/Profiles\/douyin-ecommerce\/90862283$/);
  assert.throws(
    () => managedChromeProfile({
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      rootDir: join(homedir(), "Library", "Application Support", "Google", "Chrome")
    }),
    /个人 Chrome|默认 Profile/
  );
});

test("managed Chrome rejects unsafe profile identities and non-loopback DevTools endpoints", async () => {
  const { managedChromeProfile, normalizeLoopbackEndpoint } = await managedBrowserRuntime();
  assert.equal(typeof managedChromeProfile, "function", "managedChromeProfile must be implemented");
  assert.equal(typeof normalizeLoopbackEndpoint, "function", "normalizeLoopbackEndpoint must be implemented");

  const rootDir = join(homedir(), "Library", "Application Support", "Product Flow Collector", "Profiles");
  assert.throws(
    () => managedChromeProfile({ providerId: "douyin-ecommerce", storeId: "../personal", rootDir }),
    /店铺/
  );
  assert.throws(
    () => managedChromeProfile({ providerId: "unknown", storeId: "90862283", rootDir }),
    /Provider/
  );
  assert.equal(normalizeLoopbackEndpoint("http://127.0.0.1:9222/"), "http://127.0.0.1:9222");
  assert.throws(() => normalizeLoopbackEndpoint("http://192.168.1.8:9222"), /本机/);
  assert.throws(() => normalizeLoopbackEndpoint("https://collector.example.com"), /本机/);
});

test("DevToolsActivePort is converted into a localhost-only endpoint", async () => {
  const { readDevToolsActivePort } = await managedBrowserRuntime();
  assert.equal(typeof readDevToolsActivePort, "function", "readDevToolsActivePort must be implemented");

  const result = await readDevToolsActivePort("/managed/profile", {
    readFile: async path => {
      assert.equal(path, "/managed/profile/DevToolsActivePort");
      return "43127\n/devtools/browser/instance-id\n";
    }
  });

  assert.deepEqual(result, {
    port: 43127,
    endpoint: "http://127.0.0.1:43127",
    browserPath: "/devtools/browser/instance-id"
  });
  await assert.rejects(
    readDevToolsActivePort("/managed/profile", { readFile: async () => "not-a-port\n" }),
    /调试端口/
  );
});

test("safe managed browser status never exposes a local profile path", async () => {
  const { safeManagedChromeStatus } = await managedBrowserRuntime();
  assert.equal(typeof safeManagedChromeStatus, "function", "safeManagedChromeStatus must be implemented");

  const status = safeManagedChromeStatus({
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    profileKey: "douyin-ecommerce:90862283",
    profileDir: "/Users/employee/Library/Application Support/Product Flow Collector/Profiles/douyin-ecommerce/90862283",
    endpoint: "http://127.0.0.1:43127",
    online: true,
    lastSeenAt: "2026-07-25T09:00:00.000Z"
  });

  assert.deepEqual(status, {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    profileKey: "douyin-ecommerce:90862283",
    online: true,
    lastSeenAt: "2026-07-25T09:00:00.000Z"
  });
  assert.doesNotMatch(JSON.stringify(status), /Users|43127|DevTools/i);
});

test("managed Chrome reuses a healthy profile without spawning another process", async () => {
  const { ensureManagedChrome, managedChromeProfile } = await managedBrowserRuntime();
  assert.equal(typeof ensureManagedChrome, "function", "ensureManagedChrome must be implemented");
  const profile = managedChromeProfile({
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    rootDir: "/managed/profiles"
  });
  let spawnCalls = 0;

  const result = await ensureManagedChrome(profile, {
    readActivePort: async () => ({
      port: 43127,
      endpoint: "http://127.0.0.1:43127",
      browserPath: "/devtools/browser/instance-id"
    }),
    endpointReady: async endpoint => endpoint === "http://127.0.0.1:43127",
    spawn: () => {
      spawnCalls += 1;
      throw new Error("must not spawn");
    },
    now: () => new Date("2026-07-25T09:00:00.000Z")
  });

  assert.equal(spawnCalls, 0);
  assert.equal(result.endpoint, "http://127.0.0.1:43127");
  assert.equal(result.reused, true);
  assert.equal(result.online, true);
});

test("managed Chrome starts visibly with an ephemeral localhost DevTools port", async () => {
  const { ensureManagedChrome, managedChromeProfile } = await managedBrowserRuntime();
  assert.equal(typeof ensureManagedChrome, "function", "ensureManagedChrome must be implemented");
  const profile = managedChromeProfile({
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    rootDir: "/managed/profiles"
  });
  const launches = [];
  let reads = 0;

  const result = await ensureManagedChrome(profile, {
    binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    mkdir: async path => assert.equal(path, "/managed/profiles/douyin-ecommerce/90862283"),
    readActivePort: async () => {
      reads += 1;
      if (reads < 3) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return {
        port: 43127,
        endpoint: "http://127.0.0.1:43127",
        browserPath: "/devtools/browser/instance-id"
      };
    },
    endpointReady: async endpoint => reads >= 3 && endpoint === "http://127.0.0.1:43127",
    spawn: (binary, args, options) => {
      launches.push({ binary, args, options });
      return { unref() {} };
    },
    wait: async () => {},
    now: () => new Date("2026-07-25T09:00:00.000Z")
  });

  assert.equal(launches.length, 1);
  assert.deepEqual(launches[0].args, [
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--user-data-dir=/managed/profiles/douyin-ecommerce/90862283",
    "--no-first-run",
    "--no-default-browser-check"
  ]);
  assert.equal(launches[0].options.detached, true);
  assert.equal(launches[0].options.stdio, "ignore");
  assert.equal(result.reused, false);
  assert.equal(result.online, true);
});
