# Memory (Wave2)

karmenbot keeps two layers of memory under `~/.karmenbot/memory/` (override with `KARMENBOT_HOME`).

## L0 — workspace sessions (unchanged)

Per-workspace files:

```
~/.karmenbot/memory/<workspaceHash>/<session>.json
```

- `workspaceHash` is `sha256(absolute workspace path).slice(0, 16)`
- Holds conversation `messages` and up to **32** explicit `notes` (≤4096 chars each)
- CLI: `karmenbot memory show|add|remove|clear|forget|search`
- `--no-memory` or session `none` skips this session file

Workspace notes **do not** automatically promote to the global profile.

## L1 — global profile + journal

Cross-workspace, still local by default:

| Path | Role |
|---|---|
| `memory/profile.json` | Structured preference facts (`facts[]`) |
| `memory/journal/YYYY-MM-DD.jsonl` | Append-only daily journal |

```bash
karmenbot memory profile add "Prefers concise Chinese replies"
karmenbot memory profile show
karmenbot memory journal add "Shipped Wave2 memory PR"
karmenbot memory journal show
karmenbot memory status
karmenbot memory add profile "…"    # alias
karmenbot memory add journal "…"    # alias
karmenbot memory propose "Prefers dark theme"   # requires y/n; never silent
```

## Injection

Before each agent turn, `src/memory/inject.mjs` retrieves top-k profile/journal hits for the user text and appends a short block to the **system** message.

Skipped when:

- `--no-memory`
- session key / session id is `none`
- `config.memory.enabled === false`

Safety:

- Never copies `secrets.json` into the block
- Redacts any secret string that appears in retrieved text
- Drops lines that look like API keys, tokens, private keys, or pairing codes
- Refuses to **store** secret-like text in profile/journal

## Config (`config.json`)

```json
{
  "memory": {
    "backend": "local",
    "remote": false,
    "remoteBaseUrl": "",
    "enabled": true,
    "injectTopK": 6
  }
}
```

- `backend: "local"` (default) — keyword search over profile + journal
- `backend: "mem0"` with `remote: true` — reserved; this build does **not** call a remote mem0 service unless you extend `mem0-client.mjs`. Remote stays **off** by default.
- `karmenbot memory config set remote false`

## Privacy

- Files mode `600`, directories `700`
- No cloud upload unless you explicitly build/enable a remote backend later
- Clearing: `memory profile clear`, `memory journal clear`, `memory forget` (workspace only)

## Relation to mem0

The local client exposes a small mem0-like `add` / `search` / `update` surface. It does **not** vendor the mem0 package. Optional remote mem0 (Apache-2.0) is documented for future wiring; see `THIRD_PARTY_NOTICES.md`.
