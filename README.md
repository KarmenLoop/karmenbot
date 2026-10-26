# karmenbot

[English](README.md) · [中文](README.zh-CN.md) · **v0.1.1**

[![Release](https://img.shields.io/github/v/release/KarmenLoop/karmenbot)](https://github.com/KarmenLoop/karmenbot/releases/latest)
[![Node 22+](https://img.shields.io/badge/node-22%2B-brightgreen)](https://nodejs.org/)
[![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-blue)](LICENSE)
[![Status: local terminal](https://img.shields.io/badge/status-local%20terminal-64748b)](#is--is-not)

**A full-screen terminal assistant on your computer: open a folder, connect your own model, describe the work—and approve every file write and command before it runs.**

karmenbot is the KARMEN full-screen terminal in the [Koder](https://github.com/KarmenLoop/koder-cli) family. It reads and organizes material in the workspace you opened, shows diffs and exact command lines for confirmation, and can optionally stay reachable from chat apps through a local background gateway. The Koder kernel that executes agent work ships as a **separate release asset** (not in this source tree).

Built and maintained by [KarmenLoop](https://github.com/KarmenLoop) / [KARMENLOOP](https://karmenloop.com). Current release: **[v0.1.1](https://github.com/KarmenLoop/karmenbot/releases/tag/v0.1.1)**. Repository license: **GPL-3.0-only** with a [kernel linking exception](LICENSE-EXCEPTION.md).

![Opening screen](docs/media/01-splash.png)

[Download v0.1.1](https://github.com/KarmenLoop/karmenbot/releases/tag/v0.1.1) · [Tutorial (EN)](docs/tutorial.en.md) · [中文教程](docs/tutorial.zh-CN.md) · [Setup guide](docs/GUIDE.md) · [Screen / TUI](docs/TUI.md) · [Product](https://karmenloop.com/karmen-bot.html)

---

## Why this exists

Coding and everyday file work on a laptop still needs a clear approval boundary: models propose changes; people decide what lands on disk. Cloud “agents” blur that line. Phone bots are not a substitute for a workspace you can see.

karmenbot keeps the loop local and explicit:

- your folder, your model key, your `y` / `n`;
- optional chat reachability without giving strangers a free pass;
- a kernel download that is checksum-verified from the official release.

It does **not** replace Koder CLI/TUI for headless scripting APIs, invent payment authority, or ship the phone app (still not downloadable).

---

## Snapshot

| | |
|---|---|
| **What you run** | Full-screen terminal UI + CLI (`karmenbot`) on macOS, Windows, Linux |
| **Version** | **0.1.1** (`package.json`, release tag) |
| **Runtime** | Node.js **22+** (installer can place a private copy) |
| **Kernel** | Separately licensed Koder kernel from [releases](https://github.com/KarmenLoop/karmenbot/releases/latest) → `vendor/` |
| **Config / secrets** | `~/.karmenbot` (Windows: `%USERPROFILE%\.karmenbot`), secrets mode `600` |
| **Default gateway workspace** | `~/karmenbot-workspace` (Windows: `%USERPROFILE%\karmenbot-workspace`) |
| **Installers** | `install.sh` · `install.ps1` · `install.cmd` on the latest release |
| **License** | GPL-3.0-only (+ [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) / [KERNEL-LICENSE.md](KERNEL-LICENSE.md)) |

---

## Is / Is not

| Is | Is not |
|---|---|
| Local full-screen terminal assistant with approve-before-write | Cloud-hosted coding agent SaaS |
| BYOK models (keys stay under `~/.karmenbot`) | A bundled model or free inference quota |
| Optional chat connectors + local gateway | Always-on public bot anyone can drive |
| Checksum-verified installer + separate kernel asset | Kernel source in this repository |
| Sibling to [koder-cli](https://github.com/KarmenLoop/koder-cli) / [koder-tui](https://github.com/KarmenLoop/koder-tui) | The KARMEN BOT mobile app (not downloadable yet) |
| Human approval for writes, commands, pairings, and payments | Authority to spend money or submit orders for you |

---

## What you can do

- Open a workspace session: read freely; show diffs / command text before `y`.
- One-shot jobs without the UI: `karmenbot "…"`, pipes, `--yes` / `--json` when you choose.
- Configure providers in Settings (`/settings`); paste keys as dots; **Save and test**.
- Optional Mixture of Agents (MoA): reference models propose, one combiner acts.
- Optional chat: Feishu / WeCom / DingTalk / personal WeChat (QR), plus Telegram / Slack / Discord / WhatsApp Business (forms).
- Local gateway with draft-then-send replies, pairing codes, start-at-login.
- Workspace memory, skills/playbooks, MCP presets (e.g. Playwright), routines/cron, optional voice.
- Editors via `karmenbot acp` (Zed, Neovim, Emacs snippets from `karmenbot editor`).

Deep walks: [docs/GUIDE.md](docs/GUIDE.md) · Chinese OS chapters [macOS](docs/教程-macOS.md) / [Windows](docs/教程-Windows.md) / [Linux](docs/教程-Linux.md) · topic notes [MEMORY](docs/MEMORY.md) · [SKILLS](docs/SKILLS.md) · [MCP](docs/MCP.md) · [GATEWAY](docs/GATEWAY.md) · [ROUTINES](docs/ROUTINES.md) · [CONNECTORS](docs/CONNECTORS.md) · [FOLLOWUPS](docs/FOLLOWUPS.md) · [VOICE](docs/VOICE.md).

---

## Platforms

| System | Supported |
|---|---|
| macOS 12+, Intel or Apple silicon | Yes — no admin password |
| Windows 10 / 11 (Windows Terminal, PowerShell, CMD) | Yes |
| Linux with glibc **2.28+** (e.g. Ubuntu 20.04+) | Yes — no `sudo` for install |
| Windows 7 / 8 / XP | No (Node.js 22) |
| Older glibc / Alpine musl without system Node 22 | Installer stops or needs system Node first |

---

## Quick start

### Install (recommended)

**macOS / Linux**

```bash
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
```

**Windows PowerShell**

```powershell
irm https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.ps1 | iex
```

**Windows CMD**

```bat
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd
```

Downloads are public (no desktop-beta cookie). Archives and the kernel are checked against the release manifest (SHA-256). Missing Node.js 22 → private copy.

Open a **new** terminal so `PATH` refreshes, then:

```bash
karmenbot --version
karmenbot
```

In Settings → **Models**, add a provider, paste the key, **Save and test**. Green connection → type a small job → press `y` on the diff.

Cross-platform walkthrough: [docs/tutorial.en.md](docs/tutorial.en.md) · [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md).

### From this source tree

You still need the official kernel asset (not in the clone):

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
npm run fetch-kernel
npm test
node bin/karmenbot.mjs
```

Node.js **22+**. No npm package dependencies to install for the app itself. `npm run test:source` checks public adapters without a kernel; full `npm test` needs a verified kernel under `vendor/`.

---

## Documentation map

| Doc | Use it when you need… |
|---|---|
| [Tutorial EN](docs/tutorial.en.md) · [中文](docs/tutorial.zh-CN.md) | Install → first approved write → update / uninstall (all OS) |
| [GUIDE.md](docs/GUIDE.md) | Long English setup including every chat app |
| [TUI.md](docs/TUI.md) | Screen regions, keys, screenshots |
| [教程.md](docs/教程.md) → [macOS](docs/教程-macOS.md) / [Windows](docs/教程-Windows.md) / [Linux](docs/教程-Linux.md) | Deep Chinese OS chapters (`karmenbot learn` / `karmenbot 教程`) |
| Topic docs | Memory, skills, MCP, gateway, routines, connectors, follow-ups, voice |
| [Updates](https://karmenloop.com/updates.html) · [Download](https://karmenloop.com/download.html) | What shipped / installers |

---

## FAQ

### What is karmenbot, in one sentence?

A local full-screen terminal assistant that uses your model and folder, and asks before every write and shell command.

### How is it different from Koder CLI?

[koder-cli](https://github.com/KarmenLoop/koder-cli) is the command-line / scripting surface; [koder-tui](https://github.com/KarmenLoop/koder-tui) is another terminal UI packaging; **karmenbot** is the KARMEN-branded full-screen assistant with Settings, chat gateway, and consumer-oriented installers. Same family, different entry.

### Where do API keys live?

Under `~/.karmenbot` (Windows: `%USERPROFILE%\.karmenbot`), typically `secrets.json` with mode `600`. The UI shows dots / last-four only.

### Do chat apps work without the gateway?

No. Credentials alone are not enough—start the local gateway (`karmenbot gateway start` or Settings → Gateway). Pairing approval happens on **this** computer.

### Is the kernel open source?

No. Kernel runtime is separate under [KERNEL-LICENSE.md](KERNEL-LICENSE.md). This repository’s application sources are GPL-3.0-only with the linking exception.

### Soft discoverability

Phrases that match this repo: **local terminal AI assistant approve before write**, **BYOK coding agent TUI**, **Feishu WeCom DingTalk Telegram gateway**, **Mixture of Agents MoA terminal**, **Koder kernel karmenbot**. Substance lives in the installers and docs—not keyword density.

---

## Contributing and security

Issues and pull requests are welcome. Changes to this repository remain under GPL-3.0-only plus [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md).

Do **not** paste API keys, bot tokens, or pairing codes into issues. Security reports: [info@karmenloop.com](mailto:info@karmenloop.com).

---

## License and contact

[GPL-3.0-only](LICENSE) · [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) · [KERNEL-LICENSE.md](KERNEL-LICENSE.md) · [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Maintainer: [KarmenLoop](https://github.com/KarmenLoop) · Site: [karmenloop.com](https://karmenloop.com) · Product: [karmen-bot](https://karmenloop.com/karmen-bot.html)

Related (separate scope / license): [koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [koder-sdk](https://github.com/KarmenLoop/koder-sdk) · [karmen-memory](https://github.com/KarmenLoop/karmen-memory) · [org home](https://github.com/KarmenLoop/KarmenLoop)

Copyright © 2026 KARMEN / KarmenLoop.
