# Mail & calendar connectors (MCP presets)

Non-chat connectors for **email** and **calendar**. They register into the same
`~/.karmenbot/config.json` → `mcp.servers[]` shape as Wave1 MCP (#5), plus
secrets under `secrets.json` → `mcp.<id>`.

This PR does **not** implement a gateway proactive follow-up queue.

## What we ship

| Connect command | Server id | Default stdio |
|-----------------|-----------|---------------|
| `karmenbot connect gmail` / `connect mail` | `gmail` | `npx -y google-services-mcp` |
| `karmenbot connect calendar` / `connect google-calendar` | `google-calendar` | same package |

There is **no** official npm package `@modelcontextprotocol/server-gmail` or
`@modelcontextprotocol/server-google-calendar` (404 on the registry as of
2026-10). Google’s **official** surface today is **remote HTTP MCP**:

- Gmail: `https://gmailmcp.googleapis.com/mcp/v1`
- Calendar: `https://calendarmcp.googleapis.com/mcp/v1`

Docs: [Gmail MCP](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server),
[Calendar MCP](https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server).

Until karmenbot’s MCP client supports Streamable HTTP OAuth (post–Wave1), the
connect wizard writes a **stdio** preset using the community
[`google-services-mcp`](https://github.com/nabheet/google-services-mcp) package
(Gmail + Calendar + more). You may replace `command` / `args` in config with any
other MCP server.

**Composio** (and similar) is an optional third-party path — not a hard
dependency. Point `command`/`args` at their CLI if you prefer.

## Setup

1. Google Cloud project → enable Gmail API and/or Calendar API → OAuth **Desktop** client.
2. Connect (writes config; secrets optional interactively):

   ```bash
   karmenbot connect gmail
   karmenbot connect calendar
   karmenbot connect gmail --dry-run    # print entry only
   ```

3. Store OAuth client fields (mode 600 via secrets.json):

   ```json
   // secrets.json → mcp.gmail
   {
     "GOOGLE_MCP_CLIENT_ID": "…",
     "GOOGLE_MCP_CLIENT_SECRET": "…"
   }
   ```

   Or export the same env vars when the MCP server starts. First-time browser
   auth for the community package:

   ```bash
   npx -y google-services-mcp add personal
   ```

4. **Runtime:** tool calling needs the MCP client from **PR #5**. Without it,
   connect/doctor still work (config-only); doctor notes `needs MCP client (PR #5)`.

## Privacy & send safety

- Tokens live under your home (`secrets.json` and/or `~/.google-services-mcp`); mode 600 where karmenbot writes.
- Prefer least privilege (read/draft scopes when the server allows).
- When outbound mail is surfaced through the **chat gateway**, sending should
  still respect **draft-then-send** once that lands (PR #8 / `docs/GATEWAY.md`):
  show a draft, confirm with 发送/y before the real send. Connector tools that
  create Gmail drafts are preferred over silent send.

## Remove

```bash
karmenbot connect gmail remove
karmenbot connect calendar remove
```

## Doctor

`karmenbot doctor` lists which mail/calendar connectors are configured and
whether the MCP client runtime is present.
