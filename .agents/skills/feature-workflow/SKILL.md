---
name: feature-workflow
description: Use when starting, planning, implementing, or resuming a medium or larger feature in product-flow-system.
---

# Feature Workflow

**REQUIRED SUB-SKILL:** Use `environment-parity` when the feature may touch environment configuration, D1 schema, production data, deployment behavior, or an external provider.

## Overview

Use the repository contract as the source of truth and leave a resumable product-to-code trail. If this Skill conflicts with `AGENTS.md` or CI, follow the repository and CI.

## Required workflow

1. Before research or edits, run `git fetch origin main` and require `git merge-base --is-ancestor origin/main HEAD`. If the branch is behind, update it from `origin/main` before continuing; never overwrite unrelated or dirty user changes. Then read root `AGENTS.md`, relevant durable docs, current code, and tests, and invoke every required repository Skill before planning the affected boundary.
2. Decide whether the change is truly small under the exception in `AGENTS.md`. Otherwise create `docs/features/<feature-slug>/` by copying all four repository templates:
   - `docs/templates/prd.md` → `prd.md`
   - `docs/templates/design.md` → `design.md`
   - `docs/templates/plan.md` → `plan.md`
   - `docs/templates/tasks.md` → `tasks.md`
3. Resolve product, permission, data, interaction, migration, and rollback decisions in those documents before behavior code.
4. Execute one task at a time: failing test, smallest implementation, focused verification, task checkbox, coherent commit.
5. When a rule becomes durable, update `PRODUCT.md`, `DESIGN.md`, `docs/product/`, `docs/platform/`, or an ADR in the same change.
6. Run the Definition of Done commands from `AGENTS.md`; report environment-specific checks separately.

## Quick reference

| Need | Repository source |
|---|---|
| Product intent | `PRODUCT.md`, `docs/product/` |
| Interface rules | `DESIGN.md` |
| Feature artifacts | `docs/features/<feature-slug>/` |
| Shared platform contract | `docs/platform/` |
| Architecture decision | `docs/decisions/` |

## Common mistakes

- Putting feature artifacts in `docs/superpowers/` instead of `docs/features/`.
- Omitting `tasks.md`, permissions, edge states, migration, or rollback.
- Writing implementation first and tests after.
- Copying changing business facts into this Skill instead of updating repository docs.
