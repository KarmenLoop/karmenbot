# Gateway notes

## Draft-then-send

By default the chat gateway **holds assistant replies as a draft** before they go out on Feishu / WeCom / WeChat / DingTalk / Telegram / Slack / Discord / WhatsApp.

1. Karmen finishes a turn and posts a card headed `【待发送草稿】` / `[Draft — not sent yet]` with the reply body.
2. Optional edit while the draft is pending:
   - **改 …** / **修改 …** / **编辑 …** or **edit …** / **edit:** / **/edit …** → replace the draft body and re-show the card (does **not** send).
   - **+ …** or **追加 …** → append to the draft and re-show the card (does **not** send).
3. The same person replies with **发送** / **send** / **批准** / **y** (or any existing approve word) → the current body is sent for real.
4. **拒绝** / **deny** / **n** → the draft is cancelled; nothing else is delivered.
5. File-edit and shell decide prompts are unchanged (they already ask first). Pairing codes, `/help`, `/status`, notices, and “busy / stopped” messages still send immediately.

### Disable (legacy immediate send)

In `~/.karmenbot/config.json`:

```json
{
  "gateway": {
    "draftThenSend": false
  }
}
```

Unset or `true` keeps draft-then-send on (the default for new installs). `/status` shows `草稿确认：开/关`.

Confirm is always required while the flag is on. Editing alone never delivers the message.

## Proactive follow-ups

See [FOLLOWUPS.md](./FOLLOWUPS.md) for the durable follow-up queue
(`gateway followup` / `gateway tick`), draft-safe defaults, rate limits, and quiet hours.

Chat pairing, platforms, and background service install remain as described in GUIDE.md.
