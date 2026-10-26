# Gap fill (post #5–#11)

What this tranche closed vs what stays out of scope.

## Closed here (`feat/gap-fill-remaining`)

| Gap | Ship |
|-----|------|
| TUI settings for MCP / memory / skills | Settings centre pages + toggles |
| skill install from URL | `skill install https://…` (zip/tarball, scan, decide) |
| scripts/ auto-run | `config.skills.autoRunScripts` + decide still required |
| 网络检索 Path B | `brave-search` preset first-class; `fetch` kept |
| Voice P2 MVP | `karmenbot voice say\|last\|ask` BYOK STT + OS TTS |
| Vault polish | doctor lists `mcp.*` and voice STT key presence |

## Intentionally not done

- Auto-pay / shopping agents
- Vendor kernel reverse-engineering or exposing private kernel tool APIs
- Full in-TUI OAuth for Google remote MCP (stdio + docs remain)
- Edit-before-send inside draft cards (still confirm-only)

## Needs kernel / external

- True multimodal tool registration inside the proprietary Koder harness (we stay Path B: MCP sidecars + decide)
- Offline whisper binary bundling (bring your own endpoint)
