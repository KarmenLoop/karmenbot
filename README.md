# karmenbot

KARMEN in the terminal. You state the work. It reads files, writes documents, organizes material, and runs commands. Before anything is written or executed, the screen shows the exact change and waits.

- Site: [karmenloop.com](https://karmenloop.com)
- Email: [info@karmenloop.com](mailto:info@karmenloop.com)
- Brand, install, model, first job, and chat apps: [docs/GUIDE.md](docs/GUIDE.md)
- Screen reference: [docs/TUI.md](docs/TUI.md)

![Splash](docs/media/01-splash.png)

## Download

| System | Command |
|---|---|
| macOS, Linux | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.sh \| sh` |
| Windows PowerShell | `irm https://karmenloop.com/downloads/karmenbot/install.ps1 \| iex` |
| Windows CMD | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd` |

[Download](https://karmenloop.com/download.html) · [Updates](https://karmenloop.com/updates.html) · [Product](https://karmenloop.com/karmen-bot.html)

macOS 12 or later, Windows 10 / 11, Linux with glibc 2.28 or later. If Node.js 22 is missing, the installer brings its own. Windows 7, Windows 8, and XP are not supported.

After install, the settings screen opens. Open a new terminal and run `karmenbot`.

## Brand

KARMEN is the brand on [karmenloop.com](https://karmenloop.com). Koder is the desktop editor and its terminal. KARMEN BOT, on the site, is for one person: it acts with your permission, and payment, promises, and orders wait for you. The phone app is not available for download. karmenbot is the full-screen terminal in that family. The kernel is not in this repository.

## Product

karmenbot runs on this computer. The workspace is the current directory. Settings live in `~/.karmenbot`. The key file is mode 600.

1. **Full-screen terminal.** A glass-ring opening, then a session column, the conversation, and an input line. Keyboard and mouse both work.
2. **Work in a folder.** Reading proceeds on its own. A file write shows the diff first. A command shows the exact line first. `y` accepts. `n` or `Esc` rejects.
3. **Several models on one job.** They give separate readings. One model then combines them and acts.
4. **Chat apps you already use.** Feishu, WeCom, WeChat, DingTalk, Telegram, Slack, Discord, WhatsApp. The first contact waits for approval on this computer.

The phone app is not available for download. Payment, promises, and submitted orders wait for you.

## Use it

```bash
karmenbot
```

With no model yet, settings open on their own. Move to Models, press Enter, pick a provider, paste the key, then save and test. The key is shown as dots.

Back in the conversation, write the job:

```text
Turn these meeting notes into three conclusions and write them to conclusions.md
```

When the diff appears, press `y`. The file is written then.

| In the screen | In the terminal | Result |
|---|---|---|
| `/settings` | `karmenbot settings` | Models, chat apps, background, tutorial, site |
| `/about` | `karmenbot update` | Who makes it, the site, the email, and an update check |
| `/learn` | `karmenbot learn` | The tutorial for this system |
| `/moa on` | `karmenbot moa on` | Several models on one job |

One job without the screen: `karmenbot "Turn these notes into three conclusions"`.

The hand-holding path, from install through a saved file and every chat app, is [docs/GUIDE.md](docs/GUIDE.md). Screens and keys: [docs/TUI.md](docs/TUI.md).

## Kernel

The Koder kernel is **not public**. This repository does not contain it. The installer downloads it from the official site into `vendor/`. Terms are in `KERNEL-LICENSE.md`: use with karmenbot is allowed; separate distribution, modification, and reverse engineering are not.

The screen, installer, tutorials, and tests in this repository are GPL-3.0-only. The full text is `LICENSE`. `LICENSE-EXCEPTION.md` covers shipping this repository together with that kernel.

From source, fetch the kernel, then start:

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
node scripts/fetch-kernel.mjs --from https://karmenloop.com/downloads/karmenbot
node bin/karmenbot.mjs
```

Contact: [info@karmenloop.com](mailto:info@karmenloop.com) · [karmenloop.com](https://karmenloop.com)
