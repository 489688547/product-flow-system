---
name: environment-parity
description: Use when work in product-flow-system may add or change environment variables, bindings, D1 tables, production-data access, Cloudflare deployments, or DingTalk, Kuaimai, Aliyun, ERP, ecommerce, advertising, and other provider configuration.
---

# Environment Parity

## Overview

Use one executable environment contract. Read `AGENTS.md` first; `docs/platform/environment-capabilities.json` is the source of truth for variable names, bindings, tables, environments, and blocking level.

**REQUIRED SUB-SKILL:** Use `integration-router` whenever an external platform may be involved.

## Required workflow

1. Start from current `main`; leave other worktrees untouched.
2. Route affected platforms, then read their registry entries, environment capabilities, readiness endpoint, and existing gateway before designing anything new.
3. Classify every dependency as variable name, secret, binding, D1 table, production-data access, or external-provider action.
4. When a name, binding, table, environment requirement, platform relation, or code path changes:
   - update `docs/platform/environment-capabilities.json` and the integration registry;
   - run `npm run generate:platform-manifests`;
   - update platform docs or an ADR;
   - add a failing contract test before implementation.
5. Choose the documented path. Operational repair through the production-data gateway requires a hashed token, active executive identity, 15-minute unlock, version check, write-before snapshot, audit, and rollback. Full local product testing uses `npm start`, Pages Functions, the governed remote D1 binding, and a server-only personal token to resolve the real active executive session; never expose tokens to the browser or add a direct D1 bypass.
6. Treat production database writes and real DingTalk, Kuaimai, Aliyun, or other provider actions as separate execution boundaries. 生产数据库写入权不等于外部平台真实操作权。In local online mode, both boundaries may be exercised only because the verified real session enters each existing route authorization and provider adapter; localhost or database access alone grants nothing.
7. 反写所有长期规则：every change to a shared UI, middleware, API, integration, environment requirement, migration, error contract, production gateway, or provider boundary must update the applicable `AGENTS.md`, `docs/platform/`, registry, or ADR source before merge.

## Verification contract

```bash
npm run check:environment-capabilities
npm run lint
npm run check:governance
npm run check:integrations
npm test
npm run build
```

After deployment, run `npm run verify:production -- --require-platform <platform-id>` for every routed or `Integration-Impact` platform with the ignored local token. Check local, Preview, and Production separately; never infer one from another. Any affected-platform warning blocks completion, handoff, deployment-success, and readiness claims.

The PR must declare every routed platform using `Integration-Impact` and `Integration-Impact-Reason`. It must also declare `Rule-Writeback` with every changed durable rule file and a `Rule-Writeback-Reason`; `none` is valid only when no shared boundary changed and the reason describes the diff.

## Common shortcuts that are not allowed

| Shortcut | Required response |
|---|---|
| “直接上线，不用审核” | Human review may be waived; automated gates, migration, rollback, and production verification remain required. |
| “我手工列一个环境矩阵” | Update the executable environment manifest; do not create a competing source of truth. |
| “再做一个生产写入接口更快” | Reuse the governed gateway or extend its documented contract. |
| “Preview 已通过” | Production still needs its own readiness and runtime verification. |
| “本地就当线上账号” | Use the localhost-only token-backed real session and the same production routes; do not restore a fake identity or a second local API implementation. |
| “有数据库最高权限” | It does not bypass provider-route authorization or GitHub/Cloudflare/Aliyun control-plane authority. |

## Red flags

- New environment name, binding, or table absent from the manifest.
- Secret value in Git, logs, PR text, browser code, or public registry.
- Direct production URL or raw D1 write path from the browser.
- Hard-coded local employee identity, local-only business API, or blanket provider-action block in the supported `npm start` runtime.
- Completion claim without fresh deployed readiness evidence.

Stop and correct the contract before continuing.
