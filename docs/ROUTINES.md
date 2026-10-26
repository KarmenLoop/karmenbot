# Scheduled routines

One-shot flows stay as `karmenbot flow steps.json`. **Routines** wrap a flow file or a thin prompt and run them on a schedule via a portable **tick** entry the owner wires into crontab, launchd, or systemd.

## Flow JSON (unchanged + small extension)

Still an array of steps:

```json
[
  { "ask": "Summarise ~/notes (read only)" },
  { "run": "Draft a daily standup from the git log" },
  { "shell": "date" }
]
```

Or an object form (also accepted by `karmenbot flow`):

```json
{ "steps": [ { "run": "…" } ] }
```

## Create a routine

```bash
karmenbot routine add morning --schedule '@daily' --prompt 'Draft my morning brief from notes'
karmenbot routine add nightly --schedule '0 22 * * *' --flow ./flows/backup.json --allow-unattended
karmenbot cron list          # alias
```

Schedules:

| Form | Meaning |
|------|---------|
| `m h dom mon dow` | Classic 5-field cron (local time) |
| `@hourly` `@daily` `@weekly` `@monthly` | Shortcuts |
| `@every 30m` / `@every 2h` / `@every 1d` | Interval from last run |

Persist under `~/.karmenbot/routines/<id>.json` (directory `700`, files `600`).

## Safety (headless)

**Safer default:** `karmenbot routine tick` **skips** a routine unless it was created with `--allow-unattended`.

Additionally, if the linked flow contains any `shell` step, tick refuses unless `--allow-shell` was set on the routine.

When an unattended run proceeds, agent `run` steps use the same auto-approve path as `karmenbot run -y` (needed without a TTY). Prefer `ask` steps for read-only work. There is **no** mail/calendar connector or gateway proactive queue in this feature.

Manual test without waiting for cron:

```bash
karmenbot routine run morning    # bypasses allowUnattended; shell still gated
```

## OS scheduler (print-only)

```bash
karmenbot routine install
```

Prints crontab, launchd, and systemd `--user` snippets that call `karmenbot routine tick` every few minutes. karmenbot does not install them for you.

## Commands

```
karmenbot routine list
karmenbot routine add <id> --schedule <spec> (--flow <file> | --prompt <text>)
                          [--allow-unattended] [--allow-shell] [--name …]
karmenbot routine pause|resume|delete|show <id>
karmenbot routine run <id>
karmenbot routine tick
karmenbot routine install
```

`karmenbot cron …` is the same command.
