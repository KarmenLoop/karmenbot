# karmenbot

Full-screen terminal work, on the computer in front of you.

From [KARMEN](https://karmenloop.com). You say what the job is. It reads the folder, shows you the change, and waits. Nothing hits disk, and no command runs, until you say yes.

[Download](https://karmenloop.com/download.html) · [License](#license) · [Platforms](#platforms) · [Docs](#docs) · [Contact](#contact)

[Get it](#quick-start) · [Quick start](#quick-start) · [Docs](#docs) · [Contributing](#contributing)

**License.** The code in this repository is [GPL-3.0-only](LICENSE). The Koder kernel is closed. It is not in this repo, and it is not an open-source license. See [License](#license) below.

![Opening screen](docs/media/01-splash.png)

## What it is

karmenbot is KARMEN’s terminal. One person, one machine, the folder you opened. Day to day you just talk to it. For a bigger job it can ask a few models to look first, then one of them does the work. If you want the same thing from Feishu, WeCom, WeChat, DingTalk, Telegram, Slack, Discord, or WhatsApp, you connect that app and leave a small background process running on this computer.

The phone app is not up for download. Payment, a promise, or an order still waits for you. That is the same rule as on the site.

The walkthrough, from a blank terminal to a file you can open, is [docs/GUIDE.md](docs/GUIDE.md).

## What it does

- **The screen.** A glass-ring open, then the session, the conversation, and a line to type on. Arrows or the mouse. `/settings` is the whole setup.
- **The folder.** It can read on its own. A write shows the diff. A command shows the exact line. `y` accepts, `n` or `Esc` sends it back.
- **A model you bring.** Pick the provider, paste the key, test it. The key stays in `~/.karmenbot`, mode 600. Dots on screen, not the key.
- **A few models on one job.** They each take a look. One of them combines that and actually does the work. Off unless you turn it on.
- **Chat apps, if you want them.** Scan a code for Feishu, WeCom, DingTalk, and personal WeChat. A short form for Telegram, Slack, Discord, and WhatsApp Business. First contact from anyone else needs your approval on this computer.
- **A background process.** Start it when chat should keep working after you close the window. Start-at-login is a switch, not a separate installer.
- **The site, from inside the app.** [karmenloop.com](https://karmenloop.com), the updates page, and a version check. The check does not send your key or your files.

## Platforms

macOS 12 or later, Intel or Apple silicon. Windows 10 and 11, in Windows Terminal, PowerShell, or CMD. Linux with glibc 2.28 or later, including Ubuntu 20.04 and newer. No admin password on macOS or Linux.

Windows 7, Windows 8, and XP cannot install it. Node.js 22 does not run there.

## Quick start

### Install

macOS and Linux:

```bash
curl -fsSL https://karmenloop.com/downloads/karmenbot/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://karmenloop.com/downloads/karmenbot/install.ps1 | iex
```

Windows CMD:

```bat
curl -fsSL https://karmenloop.com/downloads/karmenbot/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd
```

If Node.js 22 is not there, the installer brings a private copy.

When it finishes, Settings opens. Open a new terminal window so `PATH` is current, then:

```bash
karmenbot --version
karmenbot
```

In Settings, open **Models**, add a provider, paste the key, and choose **Save and test**. Green means you are done with setup. Type a job. When the diff shows up, press `y`.

Every click is written out in [docs/GUIDE.md](docs/GUIDE.md), including each chat app if you want one.

### From source

For people changing this repo. You still need the kernel from the official site. It is not in the clone.

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
node scripts/fetch-kernel.mjs --from https://karmenloop.com/downloads/karmenbot
npm test
node bin/karmenbot.mjs
```

Node.js 22 or newer. No npm packages to install.

## Docs

| | |
|---|---|
| [Hand-holding guide](docs/GUIDE.md) | Install, the model, the first saved file, then each chat app |
| [The screen](docs/TUI.md) | What you are looking at, keys, screenshots |
| [macOS](docs/教程-macOS.md) · [Windows](docs/教程-Windows.md) · [Linux](docs/教程-Linux.md) | The same path, in Chinese, with that system’s keys |
| [Updates](https://karmenloop.com/updates.html) | What shipped |
| [Product](https://karmenloop.com/karmen-bot.html) | KARMEN BOT on the site |

Inside the app, `karmenbot learn` prints the Chinese chapters for the system you are on.

## Contributing

Issues and pull requests are welcome. A change to this repository is under GPL-3.0-only, plus the kernel exception in [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md).

Please don’t paste API keys, bot tokens, or pairing codes into an issue. Mail [info@karmenloop.com](mailto:info@karmenloop.com) if it is a security report.

The kernel is not accepted as a pull request here. It is closed, and it ships from the site.

## License

Copyright © 2026 KARMEN. The files in this repository are under the GNU General Public License v3.0 only. The text is [LICENSE](LICENSE).

[LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) lets you ship this code together with the closed Koder kernel. The kernel’s own terms are [KERNEL-LICENSE.md](KERNEL-LICENSE.md): fine to use with karmenbot, including commercially; not fine to ship on its own, modify, or reverse engineer. The kernel is not licensed under GPL, and it is not in this repository.

Other attributions are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). That file is the list. This readme does not add to it.

## Contact

[GitHub](https://github.com/KarmenLoop/karmenbot) · [info@karmenloop.com](mailto:info@karmenloop.com) · [karmenloop.com](https://karmenloop.com)
