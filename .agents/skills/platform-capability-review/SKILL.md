---
name: platform-capability-review
description: Use when deciding whether UI, middleware, API, integration, or data behavior in product-flow-system should become a shared platform capability.
---

# Platform Capability Review

## Overview

Extract from proven sameness, not predicted reuse. Read `AGENTS.md` and the current `docs/platform/` inventory before making a boundary decision; those sources override this guide.

## Review sequence

1. Search the repository for existing implementations and real consumers. Prefer extending a compatible capability over creating a parallel one.
2. Classify the proposal:
   - UI: keep feature-specific composition in `src/features`; share only business-neutral controls that meet the repository reuse rule.
   - Domain: keep pure rules and internal models in `src/domain`; provider payloads must not leak into them.
   - Orchestration: keep requests and application coordination in `src/state` or an explicit API client boundary, not visual components.
   - Middleware: give it one cross-cutting responsibility and define ordering, input/output, side effects, failure, timeout, retry, idempotency, and logs.
   - External integration: route through authenticated server code and a provider adapter; features never call providers directly.
   - Shared API: follow the current versioning and contract rules in `AGENTS.md` and `docs/platform/api-catalog.md`.
3. Return one decision: `局部保留`, `复用现有能力`, `扩展现有能力`, or `抽取共享能力`.
4. Record evidence: consumers, stable common contract, differences that remain feature-owned, owner, migration cost, compatibility, and rollback.
5. Add or update applicable component, middleware, API, integration, error-code, ADR, and contract-test documentation in the same change.

## Approval checklist

- Business-neutral interface with at least two real consumers, unless it is a base control.
- Loading, empty, error, disabled, focus, permission, timeout, and retry states where applicable.
- Authentication and authorization enforced server-side.
- Stable internal data model; provider mapping stays at the adapter boundary.
- Backward compatibility, deprecation path, observability, ownership, tests, and catalog registration.

## Common mistakes

- Extracting because reuse is merely possible.
- Hiding business rules inside a “generic” component.
- Copying auth, retry, or provider mapping into each route.
- Calling a current internal endpoint a platform API before its contract is documented.
