# DingTalk Group Capability Evidence

Status: FAIL
Verified at: 2026-07-17T15:54:36+08:00

## Result

The production API contract required by solution A could not be verified. No feature code or production deployment may proceed until the official DingTalk developer-document service is available and the following items are confirmed:

- signed-in-user visible-group search API;
- complete group-member pagination API;
- user-token authentication header and application permission;
- member identity fields and `unionId` conversion path;
- DingTalk todo executor limit.

## Evidence

- Command: `dws devdoc article search --query "搜索当前用户可见群聊 openConversationId 用户授权" --size 10 --format json`
- Result: DingTalk pre-MCP gateway returned EOF during service discovery.
- Recovery event: `evt_1784274776836133000`
- Recovery result: `analysis_failed`; official documentation search failed again; `decision_hints.retryable` was `false`; no grounded safe action was available.
- Recovery finalization: recorded as `handoff`.

## What Is Known

The installed DWS command contract exposes read-only `dws chat search` and `dws chat group members list` operations for the currently signed-in DWS account. This confirms that the DWS product can perform those user-scoped operations, but it does not establish the official OpenAPI path, permission, response fields, or whether the product-flow enterprise application can call the same capabilities in production.

## Release Decision

Do not create a static group list, guess OpenAPI paths, retain unverified permissions, or ship a UI that cannot be backed by the production enterprise application. Retry the official capability gate after the DingTalk developer-document gateway recovers.
