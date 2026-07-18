---
name: integration-router
description: Use before coding, debugging, reviewing, or documenting work that may touch DingTalk, Kuaimai, Cloudflare, Aliyun, ERP imports, ecommerce platforms, advertising platforms, external domains, provider environment variables, or platform API routes. Routes the task through the repository integration registry so prior platform context is not missed.
---

# Integration Router

Use `docs/platform/integration-registry.json` as the only public source of platform status, capability, code boundary, relationship, and official documentation.

## Preflight

1. Route the task text and any known paths:

   ```bash
   node scripts/check-integration-impact.mjs --route --text "<task description>" --paths "<comma-separated repository paths>"
   ```

2. Report every direct candidate with its status, matching evidence, official docs, and limitations.
3. Read the direct platform entries and the one-hop related entries before changing code.
4. If several candidates match, keep all candidates until code or user evidence resolves the ambiguity.
5. Treat `planned` as unavailable, require repository evidence for `integrating`, and do not add a dependency on `retired` without an ADR.

## During implementation

- Update the registry in the same change when capability, lifecycle, code paths, domains, environment-variable names, or relations change.
- Never put console URLs, account subjects, owners, internal runbooks, credentials, tokens, passwords, cookies, private keys, or raw provider responses in the public registry.
- Platform adapters belong under `functions/api`; features never call external providers directly.

## Before handoff

- Add `Integration-Impact` and `Integration-Impact-Reason` to the PR body.
- Declare every platform required by changed paths. Use `none` only with a concrete reason.
- Run `npm run check:integrations` with the normal quality checks.
