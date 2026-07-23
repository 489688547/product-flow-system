import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    removeItem(key) {
      entries.delete(key);
    }
  };
}

test("application recovery requires confirmation before clearing local caches and reloading", async () => {
  const modulePath = resolve(root, "src/state/applicationRecovery.js");
  assert.ok(existsSync(modulePath), "application recovery module must exist");
  const { clearCachesAndReload } = await import(pathToFileURL(modulePath).href);
  const localStorage = createStorage({ productFlowState: "large", authenticationSession: "keep" });
  const sessionStorage = createStorage({ companyAiAssistantSessionV1: "chat" });
  let reloads = 0;
  const cancelledWindow = {
    localStorage,
    sessionStorage,
    confirm: () => false,
    location: { reload: () => { reloads += 1; } }
  };

  assert.equal(clearCachesAndReload(cancelledWindow), false);
  assert.equal(localStorage.getItem("productFlowState"), "large");
  assert.equal(reloads, 0);

  const confirmedWindow = { ...cancelledWindow, confirm: () => true };
  assert.equal(clearCachesAndReload(confirmedWindow), true);
  assert.equal(localStorage.getItem("productFlowState"), null);
  assert.equal(localStorage.getItem("authenticationSession"), "keep");
  assert.equal(sessionStorage.getItem("companyAiAssistantSessionV1"), null);
  assert.equal(reloads, 1);
});

test("root error boundary renders safe recovery actions outside every business provider", () => {
  const componentPath = resolve(root, "src/ui/ApplicationErrorBoundary.jsx");
  assert.ok(existsSync(componentPath), "root application error boundary must exist");
  const component = read("src/ui/ApplicationErrorBoundary.jsx");
  const main = read("src/main.jsx");

  assert.match(component, /getDerivedStateFromError/);
  assert.match(component, /componentDidCatch/);
  assert.match(component, /role="alert"/);
  assert.match(component, /页面遇到问题/);
  assert.match(component, /重新加载/);
  assert.match(component, /清理本机缓存后重试/);
  assert.match(component, /clearCachesAndReload/);
  assert.doesNotMatch(component, /error\.message|error\.stack|componentStack/);
  assert.match(main, /import \{ ApplicationErrorBoundary \}/);
  assert.match(main, /<ApplicationErrorBoundary>[\s\S]*<AuthProvider>/);
});

test("fatal fallback styles cover focus, narrow screens and DingTalk safe areas", () => {
  const styles = read("src/styles.css");

  assert.match(styles, /\.fatal-error-screen/);
  assert.match(styles, /min-height:\s*100dvh/);
  assert.match(styles, /env\(safe-area-inset-/);
  assert.match(styles, /\.fatal-error-actions/);
  assert.match(styles, /@media \(max-width:\s*640px\)/);
});
