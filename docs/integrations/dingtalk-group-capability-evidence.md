# DingTalk Group Capability Evidence

Status: PASS
Verified at: 2026-07-17T16:10:00+08:00

## Release gate

Solution A is backed by the production DingTalk MCP capabilities available to the enterprise application:

- search groups visible to the signed-in DingTalk user;
- page through members of the selected group;
- resolve enterprise members to todo executors without treating the group itself as an executor;
- request a fresh DingTalk user authorization when the stored user token is missing or expired.

The application permission `qyapi_chat_read` is authorized. DingTalk application version `1.0.8` (`a1e59ed9-0f5b-4d98-bbb0-81c7a910e27b`) was published with status `RELEASE`.

## Verified MCP contracts

### Search groups

- Endpoint: `https://mcp-gw.dingtalk.com/server/450eede6b54d83e030140e66ec77c98a2e89a0869ef4db481f8217a98a42f821`
- Tool: `search_groups`
- Arguments: `keyword`, `cursor`, `limit`
- Result fields used: `result.groups[].openConversationId`, `title`, `memberCount`, and `result.hasMore`

A live probe returned five groups visible to the signed-in DingTalk user.

### Read group members

- Endpoint: `https://mcp-gw.dingtalk.com/server/0a1609437385696b77fc4771c3ddaf5656b487f809966c0cc8d4755e7b1d3b74`
- Tool: `get_group_members`
- Arguments: `openconversation_id`, `cursor`
- Result fields used: `result.list[].memberNick`, `openDingtalkId`, and `result.hasMore`

A live probe against the group named `运营群` returned all 16 members.

### Resolve todo executors

- Endpoint: `https://mcp-gw.dingtalk.com/server/db4b26cb38ea6a8739ad55d1997fa1da608cd36b33a6cf0f77884f70c49382fe`
- Tool: `search_contact_by_key_word`
- Argument: `keyword`
- Result fields used: `name`, `openDingTalkId`, and `userId`

The group member name is used only to find candidate contacts. The implementation accepts a contact only when its `openDingTalkId` exactly matches the group member, then maps the contact `userId` to the organization's cached `unionId`. Members that cannot be matched exactly are skipped and reported to the user; identity is never guessed from the name alone.

## Runtime behavior

- The browser never receives or stores the DingTalk access token.
- The Cloudflare Function stores the user token encrypted with AES-GCM and associates it with the hashed application session ID.
- Selecting a group adds its resolvable members to the final person list.
- The user may remove any person before sending.
- Only people are submitted to the existing todo API; group metadata is never included and no group message is sent.
- The application does not silently truncate the executor list. If DingTalk rejects a request, the existing todo error path displays the upstream error.

## Documentation-service note

The official DingTalk developer-document gateway returned a pre-MCP EOF during this verification window. Recovery event `evt_1784275374920158000` was finalized as `handoff`. The production MCP contracts above were therefore verified through live DWS dry-runs and live group/member/contact probes rather than inferred from unavailable documentation.
