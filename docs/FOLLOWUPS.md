# Gateway proactive follow-ups

The gateway process can **queue timed follow-ups** and deliver them later
(Dots/Muse-style “keeps working”) without reversing the Koder kernel.

## Store

`~/.karmenbot/gateway/followups.jsonl` (directory `700`, file `600`).

Each line is one JSON object: platform, chatId, text, dueAt, requireConfirm, status, …

## CLI

```bash
karmenbot gateway followup add \
  --platform telegram --chat 123456 \
  --at '+2h' \
  --text 'Checking back on the deploy — any blockers?'

karmenbot gateway followup list
karmenbot gateway followup cancel <id>
karmenbot gateway followup tick          # deliver due items
karmenbot gateway tick                   # alias
karmenbot gateway followup tick --dry-run
karmenbot gateway followup config
```

`--at` accepts ISO-8601 or relative `+30m` / `+2h` / `+1d` (local clock when formatting dates).

Wire tick into crontab / launchd the same way as `routine tick` (every few minutes).

## Draft-safe default

Proactive outbound defaults to **`requireConfirm: true`**: the channel receives a
clear **【主动跟进】【待确认草稿】** card, not a silent final send. Pass
`--no-confirm` only when you intentionally want immediate delivery.

If `gateway.draftThenSend` is present (PR #8) and not set to `false`, tick also
wraps as a draft even when confirm was disabled — merge-safe with #8; this PR
does **not** rewrite gateway draft/ask logic in `core.mjs`.

## Rate limits & quiet hours

In `~/.karmenbot/config.json`:

```json
{
  "gateway": {
    "followups": {
      "maxPerDay": 10,
      "quietHours": { "start": "22:00", "end": "08:00" }
    }
  }
}
```

- `maxPerDay` — max **sent** follow-ups per local calendar day (default 10).
- `quietHours` — local `HH:MM` window; due items are **deferred** (stay pending)
  until outside the window. Times are **local machine timezone** (document: not UTC).

## Safety notes

- Only sends to platforms already connected (`karmenbot connect`).
- Does not invent chat ids — you must pass the target `--chat` from a known session.
- No mail/calendar connector coupling in this feature; no Composio.
