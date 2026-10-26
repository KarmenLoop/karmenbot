# Gap fill (post #5–#12)

What recent tranches closed vs what stays out of scope.

## Closed in #12 (`feat/gap-fill-remaining`)

| Gap | Ship |
|-----|------|
| TUI settings for MCP / memory / skills | Settings centre pages + toggles |
| skill install from URL | `skill install https://…` (zip/tarball, scan, decide) |
| scripts/ auto-run | `config.skills.autoRunScripts` + decide still required |
| 网络检索 Path B | `brave-search` preset first-class; `fetch` kept |
| Voice P2 MVP | `karmenbot voice say\|last\|ask` BYOK STT + OS TTS |
| Vault polish (doctor) | doctor lists `mcp.*` and voice STT key presence |

## Closed here (post-#12 polish)

| Gap | Ship |
|-----|------|
| Edit-before-send on draft cards | `改` / `edit` replace, `+` / `追加` append; send still required |
| Vault CLI | `karmenbot vault list\|has\|unset` (no `get` that prints secrets) |
| Windows TTS | PowerShell `System.Speech` in `src/voice/tts.mjs` |
| Official example skill | `examples/skills/daily-brief` (+ existing `demo-readonly`) |

## Intentionally not done

- Auto-pay / shopping agents
- Vendor kernel reverse-engineering or exposing private kernel tool APIs
- Full in-TUI OAuth for Google remote MCP (stdio + docs remain)
- Offline whisper binary bundling (bring your own endpoint)
- True multimodal tool registration inside the proprietary Koder harness (Path B: MCP sidecars + decide)

## Needs kernel / external

- In-harness multimodal / private tool registration (stay on MCP + decide)
- Streamable HTTP MCP OAuth UX polish (see MCP.md Future note)
