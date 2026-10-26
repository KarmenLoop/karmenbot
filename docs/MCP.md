# MCP and Playwright (Wave1)

karmenbot can attach **Model Context Protocol** servers as extra tools. Wave1 ships a public JS client (stdio JSON-RPC), a registry, risk policy, CLI, and a **Playwright** preset. The Koder kernel stays untouched: tools run through a **Path B sidecar** and the same `decide` / y-or-n flow used for shell and file edits.

## Quick start

```bash
# Add the official Playwright MCP server (@playwright/mcp)
karmenbot connect playwright
# or: karmenbot connect mcp
# or: karmenbot mcp add playwright

karmenbot mcp list
karmenbot mcp test playwright
karmenbot mcp doctor
```

If Chromium is missing:

```bash
npx playwright install chromium
```

## Config

Stored in `~/.karmenbot/config.json` (override with `KARMENBOT_HOME`):

```json
{
  "mcp": {
    "servers": [
      {
        "id": "playwright",
        "enabled": true,
        "preset": "playwright",
        "command": "npx",
        "args": ["-y", "@playwright/mcp@latest"],
        "env": {}
      }
    ]
  }
}
```

Optional secrets for a server go under `secrets.json` → `mcp.<id>` (mode 600) and are merged into the child process environment.

## Tool names

Running tools are addressed as `mcp.<serverId>.<toolName>` (example: `mcp.playwright.browser_navigate`).

## Approvals

| Tier | Examples | `--yes` |
|---|---|---|
| `read` | snapshot, list, fetch | may auto-accept |
| `write` | type, click, write file | may auto-accept |
| `submit` | submit, send, pay, delete, login | **never** auto-accept |

Submit-class MCP calls always pause for `decide`. Chat gateway uses the same 批准 / 拒绝 words as shell and diffs (`pause.kind === "mcp"`).

## CLI

```
karmenbot mcp list|ls
karmenbot mcp presets
karmenbot mcp add [preset|id]
karmenbot mcp remove|rm <id>
karmenbot mcp on|off <id>
karmenbot mcp test <id>
karmenbot mcp doctor
karmenbot connect mcp|playwright
```

## Path B (kernel)

`src/kernel.mjs` only re-exports known public vendor helpers. There is no public tools-registration API on the closed kernel, so Wave1 does **not** inject MCP tools into the harness tool list automatically. Instead:

1. `openAgent` starts enabled MCP servers and exposes `agent.mcp` (registry).
2. Callers use `invokeMcpTool` from `src/mcp/bridge.mjs` with the turn’s `decide`.
3. Turn-level `decide` is wrapped so `pause.kind === "mcp"` is handled in CLI and gateway.

When a future kernel export appears, wrap it thinly in `kernel.mjs` only—never reverse-engineer `vendor/`.

## Presets

| Id | Package | Notes |
|---|---|---|
| `playwright` | `@playwright/mcp` (Apache-2.0) | Default browser computer-use |
| `filesystem` | `@modelcontextprotocol/server-filesystem` | Optional; requires an allowed root |
| `fetch` | `@modelcontextprotocol/server-fetch` | Optional HTTP fetch |

## Out of scope (later waves)

mem0 cross-workspace memory, Skills/Playbooks, draft-then-send, cron routines, mail/calendar connectors.

## Web search

Preset `brave-search` (`@modelcontextprotocol/server-brave-search`) needs `BRAVE_API_KEY` in `secrets.mcp.brave-search` or the server env.

## Future

Full in-TUI Google / Streamable HTTP MCP OAuth stays deferred; use stdio presets and docs for now.
