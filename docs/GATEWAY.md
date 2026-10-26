# Gateway notes

## Draft-then-send

By default the chat gateway **holds assistant replies as a draft** before they go out on Feishu / WeCom / WeChat / DingTalk / Telegram / Slack / Discord / WhatsApp.

1. Karmen finishes a turn and posts a card headed `【待发送草稿】` / `[Draft — not sent yet]` with the reply body.
2. The same person replies with **发送** / **send** / **批准** / **y** (or any existing approve word) → the body is sent for real.
3. **拒绝** / **deny** / **n** → the draft is cancelled; nothing else is delivered.
4. File-edit and shell decide prompts are unchanged (they already ask first). Pairing codes, `/help`, `/status`, notices, and “busy / stopped” messages still send immediately.

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

This PR does **not** add a “just send / don’t draft” bypass phrase; confirm is always required while the flag is on. Edit-before-send is deferred past MVP.
