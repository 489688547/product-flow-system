---
name: verification
description: Use when validating, handing off, or claiming completion for changes in product-flow-system.
---

# Verification

## Overview

Completion is an evidence report, not a confidence statement. Read `AGENTS.md` first; its current Definition of Done and environment boundaries are authoritative.

## Verification sequence

1. Identify changed surfaces from `git status --short` and `git diff --stat`.
2. Run focused regression tests while iterating.
3. Before handoff, freshly run every Definition of Done command in `AGENTS.md`; do not substitute a partial test for the full suite.
4. Add surface-specific checks:
   - UI: keyboard and focus, loading/empty/error/disabled/no-permission states, real laptop width, narrow screens, console errors, and DingTalk WebView review.
   - API: authentication, authorization, validation, provider failure, timeout/retry, idempotency where applicable, and compatibility.
   - Persisted data: migration, old-state compatibility, capacity impact, and rollback.
5. Keep local preview, production build, Cloudflare runtime, DingTalk embedded runtime, and external-provider acceptance as separate results. Never infer one from another.
6. For environment, binding, D1 schema, production-data, deployment, or provider-configuration changes, use `environment-parity`; after deployment run `npm run verify:production -- --require-platform <platform-id>` for every affected platform. A warning on any affected platform blocks completion and deployment-success claims. Report it as `受阻` when the required ignored local token or deployment authority is unavailable—never silently omit it.
7. Recheck `git diff --check` and `git status --short`; verify only intended files are included.

## Evidence report

For each check report: `通过`, `失败`, `未执行`, or `受阻`; include the command or environment, exit result, test counts, meaningful warnings, and uncovered boundary. Only `通过` supports a completion claim.

## Common mistakes

- Saying “tests pass” after only a focused test.
- Treating a Vite build as API or DingTalk acceptance.
- Hiding warnings or unverified external environments.
- Reusing results from before the latest code change.
- Deploying or changing remote settings merely to complete verification.
