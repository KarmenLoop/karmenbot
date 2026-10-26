# karmenbot tutorial (English)

[English](tutorial.en.md) · [中文](tutorial.zh-CN.md) · back to [README](../README.md)

This guide takes you from an empty terminal to one approved write on disk, then covers updates and removal. OS-specific keys and paths are called out in each section. For the longest English chat-app walkthrough see [GUIDE.md](GUIDE.md). For screen chrome and screenshots see [TUI.md](TUI.md). Deep Chinese OS chapters remain at [教程-macOS.md](教程-macOS.md) · [教程-Windows.md](教程-Windows.md) · [教程-Linux.md](教程-Linux.md) (`karmenbot learn` / `karmenbot 教程`).

**Version covered:** v0.1.1 · **Site:** [karmenloop.com](https://karmenloop.com)

---

## 1. What “working” means

Stop when all of these are true:

1. `karmenbot --version` prints a version.
2. Settings shows a model with a green connection test.
3. You sent one job, saw a diff or command, pressed `y`, and saw the file on disk.
4. *(Optional)* A chat app is connected, the gateway is running, and a message from **your** account gets a reply.

You do not need a chat app for the terminal to be usable.

---

## 2. Check the computer

| System | Can install |
|---|---|
| macOS 12+, Intel or Apple silicon | Yes — no administrator password |
| Windows 10 / 11 | Yes — prefer Windows Terminal |
| Windows 7 / 8 / XP | No — Node.js 22 |
| Linux with glibc 2.28+ (Ubuntu 20.04+, Debian 10+, Fedora, Arch, openSUSE, …) | Yes — no `sudo` for install |
| Older glibc | Installer stops |
| Alpine / musl | Install Node.js 22 with the system package manager first, then run the installer |

---

## 3. Install

### Open a terminal

| OS | How |
|---|---|
| **macOS** | `⌘ Space` → Terminal → Enter |
| **Windows 11** | Right-click Start → Terminal |
| **Windows 10** | Right-click Start → Windows PowerShell |
| **Linux** | `Ctrl+Alt+T` (or your distro’s terminal) |

### Paste one line

**macOS / Linux** (paste: macOS `⌘V`, Linux often `Ctrl+Shift+V`):

```bash
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
```

**Windows PowerShell** (`Ctrl+V` or right-click):

```powershell
irm https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.ps1 | iex
```

**Windows CMD**:

```bat
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd
```

Watch the checklist: system → Node.js 22 (existing or private copy) → release metadata → download with **SHA-256** verify → install → PATH. A mismatch stops and writes nothing.

Pages: [Download](https://karmenloop.com/download.html) · [Updates](https://karmenloop.com/updates.html)

### Confirm on PATH

Open a **new** terminal window (PATH refresh), then:

```bash
karmenbot --version
```

| If missing… | Try |
|---|---|
| macOS / Linux | `export PATH="$HOME/.local/bin:$PATH"` and check `~/.zshrc` / `~/.bashrc` for the `# karmenbot PATH` block |
| Windows | Close every console and reopen; installer adds `%USERPROFILE%\.karmenbot\bin` to the user PATH. Log off if still missing |
| Slow Node download | Before install: `export KARMENBOT_NODE_MIRROR=https://npmmirror.com/mirrors/node` (PowerShell: `$env:KARMENBOT_NODE_MIRROR="https://npmmirror.com/mirrors/node"`) |

Custom locations: `KARMENBOT_HOME`, `KARMENBOT_BIN_DIR`.

---

## 4. Settings and first model

The first `karmenbot` with no model opens **Settings**. Later: `/settings` in the input line, or `karmenbot settings`.

| Action | Keyboard | Mouse |
|---|---|---|
| Move | `↑` `↓` | Hover the row |
| Open / toggle / confirm | Enter or Space | Left click |
| Back | `Esc` | Top “back” control |
| Scroll | `PgUp` `PgDn` | Wheel |
| Type / paste | Focus field; paste with the OS terminal paste key | Click field |

**Windows note:** mouse clicks work best in Windows Terminal; an old console may need keyboard only—every step is still reachable from the keyboard.

### Add a model (required)

1. Home → **Models** → **+ Add model**.
2. Type to filter vendors (e.g. `deep`).
3. Keep or edit the model id; paste the API key (shown as dots).
4. Leave **Set as default** on for the first model.
5. **Save and test** → green line = vendor answered.

Keys live in `~/.karmenbot/secrets.json` (Windows: `%USERPROFILE%\.karmenbot\secrets.json`), mode `600`. Logs show at most last-four. `karmenbot doctor` prints model status.

| Test failure | What to do |
|---|---|
| 401 | Incomplete / revoked key — clear, paste again |
| 402 / 403 | Balance or model not enabled in the vendor console |
| Timeout | Network blocked that host — try another network |

Prefer wizard style? `karmenbot setup`.

---

## 5. First job (required path)

```bash
cd ~/Documents          # Windows PowerShell: cd $HOME\Documents
karmenbot
```

Type a concrete task, for example:

```text
Turn these meeting notes into three conclusions and write them to conclusions.md
```

- Reads proceed without a prompt.
- A write shows a diff (`+` / `-`). A command shows the full line.
- Accept: `y` (or click Accept). Reject: `n` / `Esc`.
- Multiple choice: arrows + Enter, or click.

After `y`, open the file in another program. That completes required setup.

Leave `/yes` and `--yes` **off** until you have watched one real job. Choices and logins still stop even with auto-approve.

One-shot without the UI:

```bash
karmenbot "Turn these notes into three conclusions"
```

Terminal prompt is `[y/N]`; Enter alone means no.

### Useful slash commands

`/settings` · `/help` · `/learn` · `/model` · `/moa on|off` · `/yes` · `/new` · `/exit` · `/lang zh|en`

OS key notes:

| | macOS | Windows / Linux |
|---|---|---|
| Word jump | `Option+←/→` | `Ctrl+←/→` |
| Copy from screen while UI owns mouse | Hold `Option` and drag | Hold `Shift` and drag (Windows Terminal) |
| Quit | `/exit` or idle `Ctrl+C` twice | same |

---

## 6. Optional: MoA, chat, gateway

### Mixture of Agents

Need ≥2 configured models. Settings → **Mixture of Agents**: tick reference models, pick the combiner, once-per-turn rate, enable, save. Toggle: `/moa on` · `karmenbot moa on`. One shot: `karmenbot --moa "…"`. Each reference is a separate paid call.

### Chat apps

Skip if you only use the terminal. Credentials **and** a running gateway are both required.

Settings → **Chat apps**, or `karmenbot connect`:

- **QR:** Feishu / Lark, WeCom, DingTalk, personal WeChat.
- **Forms:** Telegram (`@BotFather` token), Slack (manifest + `xapp-` / `xoxb-`), Discord (bot token + MESSAGE CONTENT INTENT), WhatsApp **Business** Cloud API (not personal WhatsApp).

Pairing: non–scan-owner apps reply with an 8-character code. Approve on the Gateway page or `karmenbot pair approve CODE` (1 hour). Approval is local—forwarded codes are useless until you approve.

In chat: whole-message accept/reject words (`y` / `n` / localized yes-no). Five minutes of silence = reject. Groups must @ the bot. Writes send a diff; files land in the **gateway workspace**, not your current shell cwd.

### Gateway

Settings → **Gateway** → Start · or `karmenbot gateway start|stop|status|logs`.

| OS | Start at login |
|---|---|
| macOS | launchd login item; disable sleep overnight if needed |
| Windows | per-user Run entry; console may flash once |
| Linux | systemd user unit; after logout needs `loginctl enable-linger "$USER"` once |

Default workspace: `~/karmenbot-workspace` · Windows `%USERPROFILE%\karmenbot-workspace`. Override: `karmenbot gateway start -w /path`.

Gateway replies default to **draft-then-send** (edit / append / send / reject). Details: [GATEWAY.md](GATEWAY.md).

---

## 7. Memory, skills, MCP, routines (optional)

```bash
karmenbot memory add "Prefer short answers"
karmenbot memory profile add "…"
karmenbot skill install examples/skills/daily-brief
karmenbot connect playwright
karmenbot routine add …
```

Shell and write steps inside skills still ask. See [MEMORY.md](MEMORY.md) · [SKILLS.md](SKILLS.md) · [MCP.md](MCP.md) · [ROUTINES.md](ROUTINES.md) · [CONNECTORS.md](CONNECTORS.md) · [FOLLOWUPS.md](FOLLOWUPS.md) · [VOICE.md](VOICE.md).

---

## 8. Update and uninstall

- **Update:** re-run the same install one-liner for your OS, or use in-app **Official site** / version check against the download `latest.json` (sends no key or files). Also see [updates](https://karmenloop.com/updates.html).
- **Uninstall:** `karmenbot uninstall` (keep config) · `karmenbot uninstall --all` (remove config and secrets). On Unix, remove the `# karmenbot PATH` lines from your shell rc if desired. Windows also drops the user PATH entry.

---

## 9. From source (developers)

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
npm run fetch-kernel   # official release asset → vendor/
npm test
node bin/karmenbot.mjs
```

Node.js 22+. A failed kernel download is an install failure; `npm run test:source` alone does not make a usable agent.

---

## 10. Related docs and products

- [GUIDE.md](GUIDE.md) — long English setup
- [TUI.md](TUI.md) — screen walkthrough
- Chinese OS tutorials: [教程.md](教程.md)
- Family: [koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [koder-sdk](https://github.com/KarmenLoop/koder-sdk)
- Contact: [info@karmenloop.com](mailto:info@karmenloop.com)
