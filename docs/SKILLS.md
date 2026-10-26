# Skills / Playbooks (Wave3)

Installable skill packs teach karmenbot a short, reviewable procedure. They are **not** silent agents: every shell or write step goes through the same `decide` / y-n flow as normal tools. Skills **cannot** enable `--yes`.

## Layout

Discovery paths (workspace overrides global on the same id):

```
~/.karmenbot/skills/<id>/
.karmenbot/skills/<id>/          # inside the current workspace
```

Each pack:

```
skill.json      # id, name, version, triggers, permissions
SKILL.md        # human steps; optional ## Steps section
scripts/        # optional helpers (scanned; not auto-run in Wave3)
```

### skill.json

```json
{
  "id": "demo-readonly",
  "name": "Demo read-only skill",
  "version": "1.0.0",
  "description": "…",
  "triggers": ["demo"],
  "permissions": { "network": false, "shell": false, "write": false }
}
```

Declare only what you need. Undeclared `network` / `shell` / `write` usage is **blocked** by the scanner.

### SKILL.md steps

Under a `## Steps` heading:

- Numbered or bulleted lines become informational steps
- Fenced `shell` / `bash` blocks become shell steps (need `permissions.shell` + approval)
- Fenced `write` / `file` blocks become file writes (need `permissions.write` + approval)

```markdown
## Steps

1. Explain the plan to the user.

\`\`\`shell
npm test
\`\`\`
```

## CLI

```bash
karmenbot skill list
karmenbot skill show demo-readonly
karmenbot skill install examples/skills/demo-readonly
karmenbot skill scan demo-readonly
karmenbot skill run demo-readonly
karmenbot skill on|off <id>
karmenbot skill uninstall <id>
```

TUI: `/skill` is registered in the slash palette (Wave3 handles listing via CLI; full TUI runner can follow).

## Scanner (`src/skills/scan.mjs`)

Blocks (install/run refuse):

- `curl|bash` / `wget|bash` download-and-run
- Hardcoded API keys / private keys
- Touches of `secrets.json` / `saveSecret`
- Attempts to force `--yes`
- Network/shell/write usage **without** matching permission flags

Warnings: declared network/shell/write patterns that are allowed by permissions.

## Approvals

`skill run` ignores `--yes` for shell/write. Without a TTY (or scripted `answers`), those steps are denied.

## Examples

```bash
karmenbot skill install ./examples/skills/demo-readonly
karmenbot skill install ./examples/skills/daily-brief
```

- [`examples/skills/demo-readonly`](../examples/skills/demo-readonly) — minimal scan-clean pack
- [`examples/skills/daily-brief`](../examples/skills/daily-brief) — read-only morning checklist (ask steps only)

## URL install

```bash
karmenbot skill install https://example.com/pack.zip
```

Only `https://`. Archive must contain `skill.json`; scanner runs before copy.

## scripts/ auto-run

Set `"skills": { "autoRunScripts": true }` in config. After markdown steps, each
`scripts/*` file is offered through the same decide gate as shell steps (never
skipped by `--yes`).
