# karmenbot

**一句话进来，一件事办妥。** 全屏终端界面里的随身个人助理：你说要办的事，它读文件、写文档、整理资料、跑脚本。改文件、跑命令之前一定先问你。

- 官网：[karmenloop.com](https://karmenloop.com)
- 官方邮箱：[info@karmenloop.com](mailto:info@karmenloop.com)
- 本仓库：[github.com/KarmenLoop/karmenbot](https://github.com/KarmenLoop/karmenbot)
- 全屏界面说明：[docs/TUI.md](docs/TUI.md)

## 下载

| 系统 | 命令 |
|---|---|
| macOS、Linux | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.sh \| sh` |
| Windows PowerShell | `irm https://karmenloop.com/downloads/karmenbot/install.ps1 \| iex` |
| Windows CMD | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd` |

页面入口：[下载](https://karmenloop.com/download.html) · [更新](https://karmenloop.com/updates.html) · [KARMEN BOT](https://karmenloop.com/karmen-bot.html)

装完打开设置中心，用方向键或鼠标就能配好模型、聊天平台和后台网关。然后新开一个终端，输入 `karmenbot`。教程按系统分开写：[macOS](docs/教程-macOS.md) · [Windows](docs/教程-Windows.md) · [Linux](docs/教程-Linux.md)。

系统要求：macOS 12+、Windows 10/11、glibc 2.28+ 的 Linux。没有 Node.js 22 时，安装脚本会准备一份私用的。

## 全屏界面

输入 `karmenbot` 进入。开屏是折光体标志。左侧是会话、模型和用量，中间是对话，底部是输入框。`/设置` 打开设置中心，`/官网` 查看出品方并检查更新。完整的画面、按键和鼠标说明在 [docs/TUI.md](docs/TUI.md)。

也可以不进界面，直接办一件事：`karmenbot "把这份纪要收成三条结论"`。

接上飞书、企业微信、微信、钉钉、Telegram、Slack、Discord、WhatsApp 之后，在这些聊天里也能使唤它。配对和确认都在你这台电脑上。

## 协议

界面、设置中心、安装脚本、教程和测试使用 **GPL-3.0-only**，与 OpenHuman 相同的 GNU GPL 第 3 版。全文是 `LICENSE`。

Koder 内核**闭源**。安装时从官网下载到 `vendor/`，许可见 `KERNEL-LICENSE.md`：可免费随 karmenbot 使用（含商用），不可单独分发、修改或逆向。`LICENSE-EXCEPTION.md` 允许把本仓库与该内核组合发布，需要公开的源码不包括内核。

| 部分 | 许可 |
|---|---|
| 本仓库 | GPL-3.0-only，另见 `LICENSE-EXCEPTION.md` |
| `vendor/` 里的 Koder 内核 | 闭源，`KERNEL-LICENSE.md` |

## 从源码运行

需要 Node.js 22 或更新版本，不安装 npm 依赖。

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
node scripts/fetch-kernel.mjs --from https://karmenloop.com/downloads/karmenbot
npm test
node bin/karmenbot.mjs
```

没有内核时程序会说明原因并退出，不会带着半个程序运行。

## 发布（维护者）

```bash
node scripts/build-release.mjs --base-url https://karmenloop.com/downloads/karmenbot
node scripts/export-github.mjs
```

`dist/` 放到官网下载地址。GitHub Release 只放本仓库对应的开源包，不放内核。

提交即表示同意按 GPL-3.0-only 及 `LICENSE-EXCEPTION.md` 授权你的改动。第三方来源见 `THIRD_PARTY_NOTICES.md`。联系请写 [info@karmenloop.com](mailto:info@karmenloop.com)。

---

**English.** karmenbot is a full-screen terminal assistant. Official site: [karmenloop.com](https://karmenloop.com). Email: [info@karmenloop.com](mailto:info@karmenloop.com). Install from [the download page](https://karmenloop.com/download.html), or with the one-line commands above. This repository is GPL-3.0-only, the same GNU GPL version 3 terms OpenHuman uses. The Koder kernel is closed source and is installed from the official site into `vendor/` under `KERNEL-LICENSE.md`. The TUI is described in [docs/TUI.md](docs/TUI.md).
