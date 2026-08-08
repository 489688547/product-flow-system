---
name: verification
description: Use when validating, handing off, or claiming completion for changes in product-flow-system.
---

# Verification

## Overview

Completion is an evidence report, not a confidence statement. Read `AGENTS.md` first; its current Definition of Done and environment boundaries are authoritative.

## Verification sequence

1. Identify changed surfaces from `git status --short` and `git diff --stat`.
2. When implementing or debugging a documented area, search `docs/solutions/` by `module`, `tags`, and `problem_type`. Current code and tests, then `PRODUCT.md`, design, platform docs, and ADRs, take priority over learning documents.
3. Run focused regression tests while iterating.
4. Run `ce-compound` once for each non-trivial problem only after it is resolved, verified, and reusable. Do not capture an unresolved issue, an unverified observation, a guess, or a mechanical edit such as a typo; do not create a learning merely because a delivery is being handed off.
5. When a learning contradicts the current tree, overlaps another learning, or shows drift, use `ce-compound-refresh`. If the evidence cannot establish the current rule, mark the learning `stale` instead of overwriting code, tests, or durable documentation.
6. After all learning writes, before handoff, freshly run every Definition of Done command in `AGENTS.md`; do not substitute a partial test for the full suite.
7. Add surface-specific checks:
   - UI: keyboard and focus, loading/empty/error/disabled/no-permission states, real laptop width, narrow screens, console errors, and DingTalk WebView review.
   - API: authentication, authorization, validation, provider failure, timeout/retry, idempotency where applicable, and compatibility.
   - Persisted data: migration, old-state compatibility, capacity impact, and rollback.
8. Keep local SQLite sandbox, production build, Cloudflare static test frontend, ECS test API, ECS production, DingTalk embedded runtime, and external-provider acceptance as separate results. Never infer one from another.
9. For environment, binding, SQLite schema, production-data, deployment, or provider-configuration changes, use `environment-parity`; after deployment run `npm run verify:production -- --require-platform <platform-id>` for every affected platform. A warning on any affected platform blocks completion and deployment-success claims. Report it as `受阻` when the required ignored operational token or deployment authority is unavailable—never silently omit it.
10. Recheck `git diff --check` and `git status --short`; verify only intended files are included.

## Evidence report

For each check report: `通过`, `失败`, `未执行`, or `受阻`; include the command or environment, exit result, test counts, meaningful warnings, and uncovered boundary. Only `通过` supports a completion claim.

## Common mistakes

- Saying “tests pass” after only a focused test.
- Treating a Vite build as API or DingTalk acceptance.
- Hiding warnings or unverified external environments.
- Reusing results from before the latest code change.
- Deploying or changing remote settings merely to complete verification.
