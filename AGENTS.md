## Imported Claude Cowork project instructions

## Source of truth

- `PRODUCT.md` and `docs/product/` define durable product intent, workflows, roles, and data definitions.
- `DESIGN.md` defines durable interface rules. Feature-specific interaction decisions live beside the feature PRD.
- `docs/platform/` defines shared components, middleware, API contracts, integrations, and errors.
- `docs/decisions/` records architecture decisions and their consequences.
- Code and executable tests must remain consistent with these documents. When behavior changes, update the durable source in the same pull request.

## Architecture boundaries

- `src/domain`: pure business rules; no React, browser globals, or network requests.
- `src/ui`: business-neutral reusable UI components.
- `src/features`: page and feature composition; reuse domain, state, and UI boundaries.
- `src/state`: application orchestration and API clients; no visual component definitions.
- `functions/api`: authenticated server routes and provider adapters; reuse shared middleware.
- `docs`: product, design, platform, feature, and decision sources of truth.

Dependency direction is `features -> ui/domain/state`, `state -> API clients`, and `functions/api routes -> shared middleware/provider adapters`. Features must not call DingTalk, Kuaimai, ERP, or other external systems directly.

Keep changes small and focused. When modifying a high-touch file that is already difficult to understand, extract the responsibility being changed instead of adding another unrelated branch. Do not perform broad refactors without a reviewed plan.

## Feature workflow

Medium or larger work requires `docs/features/<feature>/prd.md`, `design.md`, `plan.md`, and `tasks.md`.

1. Research the current code, tests, product rules, and runtime boundary.
2. Define the problem, non-goals, business rules, data definitions, and acceptance criteria in the PRD.
3. Define interaction states and component reuse in the design document.
4. Define files, interfaces, migration, rollback, and verification in the plan.
5. Write or update a failing test before implementation.
6. Implement one coherent task at a time and keep its task checkbox current.
7. Update durable product, design, platform, API, or decision documentation when rules change.

Small, low-risk fixes may omit feature documents only when the pull request explains why the change is self-contained and does not alter product behavior, architecture, permissions, data shape, or external contracts.

## Shared capability rules

- A UI component becomes shared when it is a base control or has at least two real consumers.
- Shared components use business-neutral APIs and cover applicable loading, empty, error, disabled, focus, and permission states.
- Middleware has one cross-cutting responsibility and documents input, output, ordering, side effects, timeout, retry, idempotency, and logs.
- Existing APIs remain internal until their contract is documented. New multi-system APIs use `/api/platform/v1/...`.
- API changes document authentication, authorization, request, response, errors, compatibility, deprecation, observability, and contract tests.
- Database or persisted-state changes require migration, backwards compatibility, capacity impact, and rollback notes.
- Environment or provider configuration changes must update `docs/platform/environment-capabilities.json`, regenerate platform modules, and pass `npm run check:environment-capabilities` in the same pull request.
- A reusable component, middleware, skill, API, integration or environment rule discovered during feature work must be written back to `AGENTS.md`, `docs/platform/`, the integration registry or an ADR before merge; feature-only notes are not a durable rule.

## Security and external systems

- Before changing environment variables, bindings, D1 tables, production-data access, Cloudflare deployment behavior, or provider configuration, use `.agents/skills/environment-parity/SKILL.md`. A request to skip review does not waive automated gates, migration, rollback, or deployed production verification.
- Before coding, debugging, reviewing, or documenting work that may touch an external platform, use `.agents/skills/integration-router/SKILL.md` and route the task through `docs/platform/integration-registry.json`.
- Treat prompt keywords as advisory. A changed path matched by the registry is mandatory and must be declared in the pull request with `Integration-Impact` and `Integration-Impact-Reason`.
- Every pull request must declare `Rule-Writeback` and `Rule-Writeback-Reason`. Shared API, integration, environment, migration, error-contract, production-gateway, or provider-boundary changes must update and name an applicable durable rule file; CI rejects an ungrounded `none`.
- New branches start from the latest `main`; branches created earlier must update from `main` before merge so they receive the current registry and routing rules.
- Never commit credentials, access tokens, cookies, personal mobile numbers, or raw provider responses containing sensitive data.
- Company-wide provider credentials must be managed through the 平台连接保险箱. 浏览器、API 响应、日志和审计记录不得暴露任何明文凭据. Validate candidate credentials with a read-only provider request before switching the active version; provider adapters must resolve credentials through the shared vault resolver, with legacy environment variables used only as a fallback.
- Company documents remain behind the existing authenticated application boundary even when all employees may view them.
- Validate authorization on the server; hidden UI is not an authorization boundary.
- Keep local preview, Cloudflare deployment, DingTalk embedded WebView, and external-provider verification separate.
- Local tests may read production data only through the server-side production data gateway. Cross-environment writes require a hashed personal token, active executive identity, 15-minute unlock, version check, snapshot and audit. Database write access never implies external-provider action access.
- Do not publish, deploy, send DingTalk actions, or change remote repository settings without the required authorization.

## Definition of done

Run all of the following from the repository root:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

UI work also requires keyboard, focus, empty/error/disabled states, real laptop width, responsive layout, WCAG AA contrast, and DingTalk WebView review. API work requires authentication, permission, failure, timeout, and compatibility coverage.

Before committing, inspect `git status --short` and stage only files belonging to the current task. Existing user changes and unrelated worktrees must never be overwritten or included.
