# Screen and walkthrough

karmenbot’s main screen is a full-screen terminal. The pictures below are frames from the program.

Site: [karmenloop.com](https://karmenloop.com) · Email: [info@karmenloop.com](mailto:info@karmenloop.com)

## 1. Install

| System | Command |
|---|---|
| macOS, Linux | `curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh \| sh` |
| Windows PowerShell | `irm https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.ps1 \| iex` |
| Windows CMD | `curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd` |

[Download](https://karmenloop.com/download.html) · [Updates](https://karmenloop.com/updates.html)

On macOS, open Terminal (`⌘ Space`, type Terminal). On Linux, press `Ctrl+Alt+T`. On Windows 10 / 11, open PowerShell or CMD. Paste the matching line and press Enter.

Settings open when install finishes. If the installer asks for a new terminal, close the window, open another, and run:

```bash
karmenbot --version
```

A version number means the command is on `PATH`. Then run `karmenbot`.

Paths, login startup, and uninstall differ by system. On macOS the command lives in `~/.local/bin` and settings live in `~/.karmenbot`. On Linux the same paths are used. On Windows 10 and 11 the install is under `%USERPROFILE%\.karmenbot` and the command is on your user PATH. Inside the program, `karmenbot learn` prints the chapter for the system you are on.

## 2. Opening

![Opening: glass ring and KARMEN](media/01-splash.png)

The glass ring and the word KARMEN appear first. The steps on screen are real: prepare the screen, read settings, connect the model, restore the session, ready. Keys pressed during the opening are kept and land in the input line.

## 3. Conversation

![Conversation and a write waiting for confirmation](media/02-confirm.png)

Three regions:

- **Left:** session, workspace, model, mode, multi-model review, usage, files already written. A narrow window drops this column.
- **Center:** the conversation. The first line introduces Karmen in the language selected in settings.
- **Bottom:** the input line. Enter sends.

Reading proceeds on its own. A file write opens a diff. A command shows the full line. `y` accepts. `n` or `Esc` rejects. Until you accept, the file on disk stays as it was and the command does not run.

Example:

```text
Turn these meeting notes into three conclusions and write them to conclusions.md
```

Check the path and the text in the diff, then press `y`.

Auto-accept is off. File writes and commands stay one-by-one until you turn it on.

## 4. Settings

![Settings](media/03-settings.png)

Settings open on their own when no model is configured. Later, type `/settings` and press Enter, or run `karmenbot settings`.

Arrow keys move. Enter opens. `Esc` goes back. While this screen or a confirm dialog is open, the mouse can click. After you leave, the terminal’s mouse and cursor return.

First time, in this order:

1. **Models.** Enter, type a provider name to filter, for example `deepseek`. Paste the key. It shows as dots. Choose save and test. The model in the current session switches as soon as the test passes.
2. **Several models.** Tick the ones that give a reading, pick the one that combines them, turn the switch on.
3. **Chat apps.** Feishu, WeCom, DingTalk, and personal WeChat use a QR code. Telegram, Slack, Discord, and WhatsApp use the fields on the page.
4. **Background.** Chat messages reach this computer only after it is started. Start-at-login is on the same page. Approve a pairing request here. Revoke and delete take two presses.
5. **Tutorial.** Pick macOS, Windows, or Linux, then a chapter. Commands and keys differ.
6. **Site and updates.** Open [karmenloop.com](https://karmenloop.com), open the updates page, or compare this copy with the version listed on the site.

![Add a model](media/04-model.png)

![WeChat QR](media/05-weixin.png)

## 5. Commands in the screen

Start a line with `/`. `Tab` completes.

| Type | Effect |
|---|---|
| `/settings` | Settings |
| `/about` | Site introduction and update check |
| `/help` | Commands and keys |
| `/learn` | Short tutorial |
| `/moa on` / `/moa off` | Several models on one job |
| `/model` | Show or switch the model |
| `/lang zh` / `/lang en` | Screen language; the choice is saved |
| `/new` | New session |
| `/banner` | Play the opening again |
| `/exit` | Quit |

“Who made this” is answered from the official site: made by KARMEN / Koder, for one person; payment, promises, and orders wait for you; the phone app is not available for download. The answer includes [karmenloop.com](https://karmenloop.com) and [info@karmenloop.com](mailto:info@karmenloop.com).

## 6. Without the screen

```bash
karmenbot "Turn these notes into three conclusions"
```

Confirmation is the same as in the full screen. `karmenbot doctor` checks Node, the kernel, models, and connected chat apps, and prints the site and the updates page.

## 7. Kernel

The kernel is **not public**. Its source is not in this repository. Install downloads it from the [official download address](https://github.com/KarmenLoop/karmenbot/releases/latest/download), checks it, and places it in `vendor/`. The terms are `KERNEL-LICENSE.md`.

Everything else in this repository is GPL-3.0-only. The text is `LICENSE` at the repository root.
