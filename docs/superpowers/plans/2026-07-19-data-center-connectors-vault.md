# 数据中心连接器与凭据保险箱实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first production-safe vertical slice of the Data Center connector catalog and encrypted D1 credential vault without enabling real provider collection or importing production credentials.

**Architecture:** Connector schemas stay pure and feature-local; non-sensitive connector instances use a Data Center API, while all secrets use a shared `/api/platform/v1/credential-vault` boundary backed by AES-256-GCM and append-only audit. The React UI renders built-in logo cards and schema-driven dialogs, never stores plaintext locally, and never reports a saved configuration as a healthy connection.

**Tech Stack:** React 19, Vite 7, Node test runner, Cloudflare Pages Functions, Cloudflare D1, Web Crypto AES-GCM, existing UI primitives and CSS tokens.

## Global Constraints

- Sales reporting remains `create_time`, `Asia/Shanghai`, through yesterday, excluding `其它` from normal operations.
- The Data Center keeps seven left-navigation routes and does not restore a Data Analysis tab.
- `DATA_CREDENTIAL_MASTER_KEY` is a Cloudflare Secret containing a base64url-encoded 32-byte key; no real value enters Git or logs.
- Passwords, API secrets, tokens, cookies, and reusable sessions may be encrypted; OTP, SMS codes, QR contents, slider answers, and one-time verification results are rejected.
- Ordinary GET responses never return plaintext, ciphertext, IVs, password lengths, or reusable secret prefixes.
- Saving a configuration produces `pending_validation`; only a future real adapter can produce `healthy`.
- Existing `/api/data-center`, `/api/data-center/sales`, `data_sources`, and `product_sales_daily` remain compatible.
- No Cloudflare deploy, production migration, real credential import, or external-provider action is authorized by this plan.

---

## File Map

- `src/domain/dataCenterConnectors.js`: immutable connector and vault type definitions, schema lookup, status priority, and safe configuration normalization.
- `functions/api/platform/_shared/credentialCrypto.js`: base64url conversion, master-key import, AES-GCM encrypt/decrypt, and key-version validation.
- `functions/api/platform/_shared/credentialVaultStorage.js`: D1 tables, metadata reads/writes, encrypted entry persistence, archive, permission rows, and redacted audit.
- `functions/api/platform/_shared/credentialVaultAuthorization.js`: action-level authorization and 15-minute reveal-session check.
- `functions/api/platform/v1/credential-vault.js`: list and create.
- `functions/api/platform/v1/credential-vault/[id].js`: replace metadata/secret and archive.
- `functions/api/platform/v1/credential-vault/[id]/reveal.js`: explicit, non-cacheable reveal.
- `functions/api/data-center/connectors.js`: connector-instance list and upsert.
- `src/state/dataCenterConnectionsApi.js`: browser API client with stable errors and no persistence.
- `src/features/data-center/connections/ConnectorCatalog.jsx`: connector cards and internal-vault type switcher.
- `src/features/data-center/connections/ConnectorConfigDialog.jsx`: schema-driven connector form.
- `src/features/data-center/connections/InternalVaultWorkspace.jsx`: NAS/email/finance/government/SaaS item list and editor entry.
- `src/features/data-center/connections/DataConnectionsWorkspace.jsx`: loading, error, selection, API orchestration, and page composition.
- `src/assets/connectors/*.svg`: local logo/mark assets with stable names and text alternatives.
- `migrations/0003_data_center_credentials.sql`: stage-1 tables and indexes.
- `docs/platform/apis/credential-vault-v1.md`: stable request, response, permission, error, cache, audit, and compatibility contract.

### Task 1: Connector definitions and safe configuration model

**Files:**
- Create: `src/domain/dataCenterConnectors.js`
- Create: `react-tests/data-center-connectors.test.mjs`
- Modify: `src/domain/dataCenter.js`

**Interfaces:**
- Produces: `DATA_CONNECTOR_DEFINITIONS`, `INTERNAL_VAULT_TYPES`, `CONNECTOR_STATUS_PRIORITY`, `connectorDefinition(id)`, `normalizeConnectorInstance(input)`, and `splitConnectorPayload(definition, input)`.
- `splitConnectorPayload` returns `{ metadata, secretPayload }`; `secretPayload` can contain only schema fields marked `sensitive: true` and never OTP-like field names.

- [ ] **Step 1: Write the failing domain tests**

```js
test("catalog defines eight connectors and merges Qianchuan into Ocean Engine", () => {
  assert.deepEqual(DATA_CONNECTOR_DEFINITIONS.map(item => item.id), [
    "douyin-ecommerce", "oceanengine", "kuaishou", "taobao",
    "pinduoduo", "xiaohongshu", "jd-jingmai", "kuaimai-erp"
  ]);
  assert.ok(connectorDefinition("oceanengine").accountTypes.includes("qianchuan"));
});

test("configuration splits metadata from allowed encrypted secrets and rejects OTP", () => {
  const definition = connectorDefinition("douyin-ecommerce");
  const split = splitConnectorPayload(definition, {
    name: "抖音官旗", consoleUrl: "https://example.com/", loginEmail: "ops@example.com", password: "secret"
  });
  assert.equal(split.metadata.name, "抖音官旗");
  assert.deepEqual(split.secretPayload, { loginEmail: "ops@example.com", password: "secret" });
  assert.throws(() => splitConnectorPayload(definition, { smsCode: "123456" }), /验证码/);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test react-tests/data-center-connectors.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/dataCenterConnectors.js`.

- [ ] **Step 3: Implement immutable definitions and validators**

Define each connector with `id`, `name`, `description`, `logo`, `methods`, `accountTypes`, `datasets`, and `fields`. Field entries use `{ key, label, type, required, sensitive, methods }`. Reject unknown keys, URL credentials, any key matching `otp|smsCode|verificationCode|captcha|qrCode|slider`, and values above declared limits. Normalize new instances to `pending_validation`, `create_time`, `Asia/Shanghai`, and `07:30` without accepting client-provided `healthy`.

- [ ] **Step 4: Narrow the legacy sanitizer**

Keep credential-like fields forbidden inside legacy `data_sources`, but stop using the old rule as the product credential boundary. Add a comment that secrets must use credential-vault and keep the existing legacy test passing.

- [ ] **Step 5: Run domain tests**

Run: `node --test react-tests/data-center-connectors.test.mjs react-tests/data-center.test.mjs`
Expected: PASS with all connector and legacy source tests green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/dataCenterConnectors.js src/domain/dataCenter.js react-tests/data-center-connectors.test.mjs
git commit -m "feat(data): define connector schemas"
```

### Task 2: Versioned AES-GCM and D1 storage

**Files:**
- Create: `functions/api/platform/_shared/credentialCrypto.js`
- Create: `functions/api/platform/_shared/credentialVaultStorage.js`
- Create: `functions/api/platform/_shared/credentialVaultAuthorization.js`
- Create: `migrations/0003_data_center_credentials.sql`
- Create: `tests/credential-vault-crypto.test.mjs`
- Create: `tests/credential-vault-storage.test.mjs`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `.env.example`
- Regenerate: `functions/api/platform/_generated/environmentCapabilities.js`

**Interfaces:**
- Produces: `encryptCredential(payload, { masterKey, entryId, purpose, keyVersion })`, `decryptCredential(record, options)`, `credentialDatabase(env)`, `listCredentialMetadata(db, filter)`, `createCredentialEntry(db, input, context)`, `replaceCredentialEntry(db, id, input, context)`, `archiveCredentialEntry(db, id, context)`, `revealCredentialEntry(db, id, context)`, `authorizeCredentialAction(session, action, options)`.
- Encrypted record shape: `{ ciphertext, iv, algorithm: "AES-256-GCM", keyVersion: 1 }`; ciphertext and IV are base64url strings and never leave storage helpers.

- [ ] **Step 1: Write failing crypto tests**

```js
test("AES-GCM round trips with unique IVs and bound additional data", async () => {
  const masterKey = testMasterKey();
  const first = await encryptCredential({ password: "one" }, { masterKey, entryId: "cred-1", purpose: "connector", keyVersion: 1 });
  const second = await encryptCredential({ password: "one" }, { masterKey, entryId: "cred-1", purpose: "connector", keyVersion: 1 });
  assert.notEqual(first.iv, second.iv);
  assert.deepEqual(await decryptCredential(first, { masterKey, entryId: "cred-1", purpose: "connector" }), { password: "one" });
  await assert.rejects(() => decryptCredential(first, { masterKey, entryId: "cred-2", purpose: "connector" }));
});
```

- [ ] **Step 2: Run crypto tests and verify failure**

Run: `node --test tests/credential-vault-crypto.test.mjs`
Expected: FAIL because `credentialCrypto.js` does not exist.

- [ ] **Step 3: Implement crypto helpers**

Decode exactly 32 bytes from base64url, import with `crypto.subtle.importKey`, generate a new 12-byte IV per write, bind `entryId|purpose|keyVersion` as `additionalData`, and convert Web Crypto failures into `CREDENTIAL_KEY_UNAVAILABLE` or `CREDENTIAL_DECRYPT_FAILED` without including values.

- [ ] **Step 4: Write failing storage tests**

Test that create stores no plaintext, list returns no `ciphertext`/`iv`, replace changes ciphertext, archive hides the entry by default, reveal returns a payload only to the storage caller, and audit rows contain action/field categories but not values.

- [ ] **Step 5: Add migration and storage helpers**

The migration creates explicit typed columns for metadata and opaque encrypted columns, indexes `(scope_type, scope_id, archived_at)` and audit `(entry_id, created_at)`, and no plaintext secret columns. `credential_vault_permissions` is created for later item-level grants even though stage 1 authorizes administrators by policy.

- [ ] **Step 6: Register environment capability**

Add capability `data-credential-vault` with `DATA_CREDENTIAL_MASTER_KEY`, `PRODUCT_FLOW_DB`, and the five stage-1 tables. Add only `DATA_CREDENTIAL_MASTER_KEY=` to `.env.example`, run `npm run generate:platform-manifests`, and verify no secret value is present.

- [ ] **Step 7: Run storage and environment tests**

Run: `node --test tests/credential-vault-crypto.test.mjs tests/credential-vault-storage.test.mjs tests/environment-capabilities.test.mjs && npm run check:environment-capabilities`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/api/platform/_shared/credentialCrypto.js functions/api/platform/_shared/credentialVaultStorage.js functions/api/platform/_shared/credentialVaultAuthorization.js migrations/0003_data_center_credentials.sql tests/credential-vault-crypto.test.mjs tests/credential-vault-storage.test.mjs docs/platform/environment-capabilities.json functions/api/platform/_generated/environmentCapabilities.js .env.example
git commit -m "feat(platform): add encrypted credential storage"
```

### Task 3: Credential Vault v1 HTTP contract

**Files:**
- Create: `functions/api/platform/v1/credential-vault.js`
- Create: `functions/api/platform/v1/credential-vault/[id].js`
- Create: `functions/api/platform/v1/credential-vault/[id]/reveal.js`
- Create: `tests/credential-vault-api.test.mjs`
- Create: `docs/platform/apis/credential-vault-v1.md`
- Modify: `functions/api/auth/_shared/session.js`
- Modify: `tests/dingtalk-web-auth.test.mjs`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`

**Interfaces:**
- List response: `{ synced: true, entries: CredentialMetadata[] }`.
- Create request: `{ scopeType, scopeId, category, name, schemaVersion, secretPayload }`.
- Replace request: `{ expectedVersion, name?, secretPayload? }`; archive request: `{ expectedVersion, action: "archive" }`.
- Reveal request: `{ purpose, confirmation: "查看加密凭证" }`; response: `{ entry, secretPayload, revealedAt }` with `Cache-Control: no-store`.

- [ ] **Step 1: Expose safe session creation time**

Add `createdAt` to `publicSession` and the return value of `createSession`; test that middleware sessions expose the timestamp but not the token hash. This enables the 15-minute reveal check without adding a second authentication mechanism.

- [ ] **Step 2: Write failing API tests**

Cover anonymous 401, employee 403, operations create/replace allowed only for connector scope, operations reveal denied, administrator create/list/replace/archive, missing D1 501, missing key 503, unknown fields 400, version conflict 409, stale-session reveal 401, wrong confirmation 400, reveal `no-store`, and audit without values.

- [ ] **Step 3: Run tests and verify routes are missing**

Run: `node --test tests/credential-vault-api.test.mjs tests/dingtalk-web-auth.test.mjs`
Expected: FAIL with missing credential-vault route modules or absent `createdAt`.

- [ ] **Step 4: Implement list/create and item actions**

Use one shared JSON error helper, reject request methods outside the documented set, accept no client actor/timestamp/status fields, require `expectedVersion` for mutation, and map storage errors to the documented `CREDENTIAL_*` codes.

- [ ] **Step 5: Implement reveal boundary**

Require administrator, non-readonly session, `createdAt` within 15 minutes, exact confirmation, non-empty purpose up to 200 characters, and per-entry authorization. Return `Cache-Control: no-store, private`, `Pragma: no-cache`, and never include ciphertext metadata.

- [ ] **Step 6: Write the stable API contract**

Document request/response examples with fake values, authentication, authorization matrix, 15-minute rule, error codes, version conflict, audit fields, cache headers, compatibility, timeout, rate-limit expectations, and rollback. State that task grants are not implemented in stage 1.

- [ ] **Step 7: Run API and auth tests**

Run: `node --test tests/credential-vault-api.test.mjs tests/credential-vault-storage.test.mjs tests/dingtalk-web-auth.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/api/platform/v1/credential-vault.js functions/api/platform/v1/credential-vault functions/api/auth/_shared/session.js tests/credential-vault-api.test.mjs tests/dingtalk-web-auth.test.mjs docs/platform/apis/credential-vault-v1.md docs/platform/api-catalog.md docs/platform/error-codes.md
git commit -m "feat(platform): expose credential vault API"
```

### Task 4: Connector-instance API

**Files:**
- Create: `functions/api/data-center/connectors.js`
- Create: `functions/api/data-center/_shared/connectorStorage.js`
- Create: `tests/data-center-connectors-api.test.mjs`
- Modify: `docs/platform/api-catalog.md`

**Interfaces:**
- GET response: `{ synced: true, connectors: ConnectorInstance[], vaultItems: InternalVaultItem[] }`.
- PUT request: `{ expectedVersion, instance }`; `instance` is the output of `normalizeConnectorInstance` and contains only `credentialEntryId`, never `secretPayload`.
- DELETE is not supported; archive uses `PUT { expectedVersion, action: "archive", id }`.

- [ ] **Step 1: Write failing connector API tests**

Cover department read scope, operations/admin writes, finance read-only, missing D1, unknown connector ID, URL with credentials, client-forged `healthy`, valid `pending_validation` save, version conflict, archive, and no secret-looking fields in responses.

- [ ] **Step 2: Run test and verify route is missing**

Run: `node --test tests/data-center-connectors-api.test.mjs`
Expected: FAIL because `functions/api/data-center/connectors.js` does not exist.

- [ ] **Step 3: Implement storage and route**

Use the migration tables; validate through `normalizeConnectorInstance`; generate IDs and timestamps server-side; preserve real status fields on ordinary configuration edits; force new records to `pending_validation`; store `credential_entry_id` as an opaque reference; audit changed field names only.

- [ ] **Step 4: Run connector and legacy API tests**

Run: `node --test tests/data-center-connectors-api.test.mjs tests/data-center-api.test.mjs`
Expected: PASS with the legacy endpoint unchanged.

- [ ] **Step 5: Commit**

```bash
git add functions/api/data-center/connectors.js functions/api/data-center/_shared/connectorStorage.js tests/data-center-connectors-api.test.mjs docs/platform/api-catalog.md
git commit -m "feat(data): persist connector instances"
```

### Task 5: Browser API client and state orchestration

**Files:**
- Create: `src/state/dataCenterConnectionsApi.js`
- Create: `react-tests/data-center-connections-api.test.mjs`
- Modify: `src/state/DataCenterProvider.jsx`

**Interfaces:**
- Produces: `loadDataCenterConnections`, `saveConnectorInstance`, `createCredential`, `replaceCredential`, `revealCredential`, `archiveCredential`, and Provider values `connections`, `vaultEntries`, `connectionsLoading`, `connectionsError`, `refreshConnections`, `saveConnection`.
- `saveConnection({ instance, secretPayload })` creates/replaces the credential first, then saves only the returned credential ID with the instance; plaintext is held in the call stack only.

- [ ] **Step 1: Write failing client tests**

Assert exact internal URLs, JSON method/body, propagation of stable error codes, no fetch body on GET, reveal confirmation, and absence of localStorage/sessionStorage/caches/IndexedDB writes in the client source.

- [ ] **Step 2: Run test and verify module is missing**

Run: `node --test react-tests/data-center-connections-api.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement client and Provider state**

Load connector instances and credential metadata in parallel, keep failures separate from sales loading, clear secret payload references in `finally`, and never add secrets to the Provider value. Existing sales and metadata refresh behavior remains unchanged.

- [ ] **Step 4: Run client and Provider tests**

Run: `node --test react-tests/data-center-connections-api.test.mjs react-tests/data-center-provider.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/dataCenterConnectionsApi.js src/state/DataCenterProvider.jsx react-tests/data-center-connections-api.test.mjs react-tests/data-center-provider.test.mjs
git commit -m "feat(data): orchestrate connector settings"
```

### Task 6: Logo catalog, schema-driven dialog, and internal vault UI

**Files:**
- Create: `src/assets/connectors/douyin.svg`
- Create: `src/assets/connectors/oceanengine.svg`
- Create: `src/assets/connectors/kuaishou.svg`
- Create: `src/assets/connectors/taobao.svg`
- Create: `src/assets/connectors/pinduoduo.svg`
- Create: `src/assets/connectors/xiaohongshu.svg`
- Create: `src/assets/connectors/jd.svg`
- Create: `src/assets/connectors/kuaimai.svg`
- Create: `src/features/data-center/connections/ConnectorCatalog.jsx`
- Create: `src/features/data-center/connections/ConnectorConfigDialog.jsx`
- Create: `src/features/data-center/connections/InternalVaultWorkspace.jsx`
- Create: `src/features/data-center/connections/DataConnectionsWorkspace.jsx`
- Create: `react-tests/data-center-connections-ui.test.mjs`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `react-tests/data-center-app.test.mjs`
- Modify: `src/styles.css`

**Interfaces:**
- `ConnectorCatalog({ instances, onSelect })` emits a connector definition.
- `ConnectorConfigDialog({ definition, instance, credentialMetadata, onSave, onClose })` emits `{ instance, secretPayload }` and never receives plaintext from the server.
- `InternalVaultWorkspace({ items, onSelectType, onReveal })` renders metadata only.
- `DataConnectionsWorkspace` consumes the Provider orchestration and owns dialog selection/drafts.

- [ ] **Step 1: Write failing UI structure tests**

Assert eight local logo imports, one Ocean Engine/Qianchuan entry, no generic source form, platform-specific field schema use, API/web/export methods, the five internal vault types, encrypted/OTP/audit copy, dialog semantics, `pending_validation`, no secret persistence, and no Data Analysis route.

- [ ] **Step 2: Run tests and verify components are missing**

Run: `node --test react-tests/data-center-connections-ui.test.mjs react-tests/data-center-app.test.mjs`
Expected: FAIL on missing components and the legacy “不保存账号密码” form.

- [ ] **Step 3: Add local connector marks**

Create restrained local SVG marks using approved brand-identifying shapes/colors, a square viewBox, no remote references, no embedded text smaller than 12px, and `aria-hidden` images paired with visible platform names.

- [ ] **Step 4: Implement catalog and dialog**

Cards are real buttons or contain one explicit action without nested interactive elements. The dialog reuses `.modal-layer`/`.modal-sheet`, traps focus through the existing dialog pattern, labels every field, shows sensitive fields empty with “已加密保存”, treats blank sensitive values as unchanged, and shows OTP as instructions rather than an input.

- [ ] **Step 5: Implement internal vault and page composition**

Use a page-level segmented control for “经营数据连接器 / 内部系统保险箱”. Render NAS, email, finance, government/SaaS, and custom system types. Restrict reveal UI to the capability returned by the API; require purpose and exact confirmation in the reveal dialog; clear revealed text on close and after 60 seconds.

- [ ] **Step 6: Replace the legacy generic source form**

`DataSourcesWorkspace` delegates to `DataConnectionsWorkspace`; remove the old `SourceForm` and five-item array. Keep metrics, quality, sync, services, and settings exports unchanged, and update the settings security copy to the encrypted-vault rule.

- [ ] **Step 7: Add responsive and accessibility styles**

Use four/three/two/one-column catalog breakpoints, visible focus, text status, 390px full-screen dialog, safe-area bottom padding, field error association, reduced motion, and no page-level horizontal overflow.

- [ ] **Step 8: Run UI tests and build**

Run: `node --test react-tests/data-center-connections-ui.test.mjs react-tests/data-center-app.test.mjs react-tests/data-center-provider.test.mjs && npm run build`
Expected: PASS and all JavaScript chunks below 500,000 bytes.

- [ ] **Step 9: Commit**

```bash
git add src/assets/connectors src/features/data-center/connections src/features/data-center/DataGovernanceWorkspaces.jsx src/features/data-center/DataCenterAppPage.jsx src/styles.css react-tests/data-center-connections-ui.test.mjs react-tests/data-center-app.test.mjs
git commit -m "feat(data): add connector and vault workspace"
```

### Task 7: Stage-1 security and compatibility review

**Files:**
- Modify: `docs/features/data-center-app/tasks.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/platform/environment-capabilities.json` only if the implementation names differ from Task 2; regenerate after any change.
- Test: all repository tests.

**Interfaces:**
- Produces: a clean, reviewable stage-1 branch with no production side effects and checked task evidence.

- [ ] **Step 1: Scan for secret leakage and stale copy**

Run: `rg -n "不保存账号密码|不保存密码|type=\"password\"|secretPayload|ciphertext|DATA_CREDENTIAL_MASTER_KEY" src functions docs .env.example`
Expected: password inputs occur only in the connector dialog; `secretPayload` is confined to the client call and vault API; ciphertext is server-only; no key value is present; stale copy is historical or removed.

- [ ] **Step 2: Verify migration and environment parity**

Run: `npm run check:environment-capabilities && node --test tests/environment-capabilities.test.mjs`
Expected: PASS and all new tables/Secret names appear in generated manifests.

- [ ] **Step 3: Run complete Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 4: Perform browser verification**

At 1440, 900, 640, and 390px verify connector cards, keyboard navigation, focus return, empty/error/disabled states, platform-specific fields, sensitive replacement behavior, internal vault, reveal timeout, no horizontal overflow, and DingTalk WebView dialog/keyboard behavior. Do not enter real credentials.

- [ ] **Step 5: Update task evidence and commit**

```bash
git add docs/features/data-center-app/tasks.md docs/platform/integrations.md docs/platform/environment-capabilities.json functions/api/platform/_generated/environmentCapabilities.js
git commit -m "docs(data): record connector vault verification"
```

## Deferred plans

The following are intentionally not implemented by this plan because they require distinct runtime and production authority:

1. Company Mac collector, machine identity, public-key task grants, Chrome Profile isolation, heartbeat, and task recovery.
2. Cloudflare `07:30` scheduling, recent-day replay, monthly historical backfill, atomic fact replacement, and D1 capacity telemetry.
3. Authorized DingTalk “账密表” preview/import and provider-by-provider production verification.

Each deferred plan must start from the stage-1 credential-vault contract and may not expose the master key or reuse a human reveal response as a runner credential channel.
