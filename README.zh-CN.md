# karmenbot

[English](README.md) · [中文](README.zh-CN.md) · **v0.1.1**

[![Release](https://img.shields.io/github/v/release/KarmenLoop/karmenbot)](https://github.com/KarmenLoop/karmenbot/releases/latest)
[![Node 22+](https://img.shields.io/badge/node-22%2B-brightgreen)](https://nodejs.org/)
[![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-blue)](LICENSE)
[![Status: 本机终端](https://img.shields.io/badge/status-本机终端-64748b)](#是--不是)

**本机全屏终端助手：进入工作目录、接上自己的模型、用一句话交代任务——改文件和跑命令前先看差异或原文，你点头才执行。**

karmenbot 是 [Koder](https://github.com/KarmenLoop/koder-cli) 产品族里的 KARMEN 全屏终端。读写发生在你打开的目录；可选通过本机后台网关接入聊天应用。执行智能体任务的 **Koder 内核** 作为**独立发行资产**提供，不在本仓库源码树中。

由 [KarmenLoop](https://github.com/KarmenLoop) / [KARMENLOOP](https://karmenloop.com) 维护。当前发行：**[v0.1.1](https://github.com/KarmenLoop/karmenbot/releases/tag/v0.1.1)**。仓库许可：**GPL-3.0-only**，附 [内核链接例外](LICENSE-EXCEPTION.md)。

![启动画面](docs/media/01-splash.png)

[下载 v0.1.1](https://github.com/KarmenLoop/karmenbot/releases/tag/v0.1.1) · [英文教程](docs/tutorial.en.md) · [中文教程](docs/tutorial.zh-CN.md) · [设置指南](docs/GUIDE.md) · [界面说明](docs/TUI.md) · [产品页](https://karmenloop.com/karmen-bot.html)

---

## 为什么需要它

本机上的改码与整理文件，仍然需要清晰的批准边界：模型可以提议，落盘与执行由人决定。云端「代理」容易把边界抹掉；手机机器人也替代不了你看得见的工作目录。

karmenbot 把闭环留在本机：

- 你的文件夹、你的模型密钥、你的 `y` / `n`；
- 可选聊天可达，但不给陌生人自动通行；
- 安装包与内核按发行清单做 SHA-256 校验。

它**不**替代 Koder CLI/TUI 的脚本 API，不代你付款下单，也不提供尚未开放下载的手机应用。

---

## 一览

| | |
|---|---|
| **你运行的是** | macOS / Windows / Linux 上的全屏终端 UI + `karmenbot` 命令 |
| **版本** | **0.1.1**（`package.json`、发行标签） |
| **运行时** | Node.js **22+**（安装程序可放入私用副本） |
| **内核** | 独立许可的 Koder 内核，来自 [releases](https://github.com/KarmenLoop/karmenbot/releases/latest) → `vendor/` |
| **配置 / 密钥** | `~/.karmenbot`（Windows：`%USERPROFILE%\.karmenbot`），密钥文件权限 `600` |
| **网关默认目录** | `~/karmenbot-workspace`（Windows：`%USERPROFILE%\karmenbot-workspace`） |
| **安装入口** | 最新发行上的 `install.sh` · `install.ps1` · `install.cmd` |
| **许可** | GPL-3.0-only（+ [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) / [KERNEL-LICENSE.md](KERNEL-LICENSE.md)） |

---

## 是 / 不是

| 是 | 不是 |
|---|---|
| 本机全屏终端助手，写前先批准 | 云端托管编程代理 SaaS |
| 自带密钥（BYOK），密钥留在本机 | 捆绑模型或免费推理额度 |
| 可选聊天连接 + 本机网关 | 任何人都能驱动的公网机器人 |
| 校验过的安装程序 + 独立内核资产 | 本仓库内的内核源码 |
| 与 [koder-cli](https://github.com/KarmenLoop/koder-cli) / [koder-tui](https://github.com/KarmenLoop/koder-tui) 同族 | 尚未提供下载的 KARMEN BOT 手机应用 |
| 写入、命令、配对、付款均需人确认 | 替你花钱或提交订单的权限 |

---

## 能做什么

- 全屏会话：可读可看；写入与命令先展示再 `y`。
- 一行命令办事：`karmenbot "…"`、管道、按需 `--yes` / `--json`。
- 设置中心配模型（`/settings`）；密钥显示为圆点；**保存并测试**。
- 可选多模型会商（MoA）：参考模型出主意，聚合模型动手。
- 可选聊天：飞书 / 企微 / 钉钉 / 个人微信（扫码），以及 Telegram / Slack / Discord / WhatsApp Business（填表）。
- 本机网关：默认草稿后发送、配对码、开机自启。
- 目录笔记、技能包、MCP 预设（如 Playwright）、定时例程、可选语音。
- 编辑器接入：`karmenbot acp`（Zed / Neovim / Emacs 片段见 `karmenbot editor`）。

深入阅读：[docs/GUIDE.md](docs/GUIDE.md) · 中文分系统 [macOS](docs/教程-macOS.md) / [Windows](docs/教程-Windows.md) / [Linux](docs/教程-Linux.md) · 专题 [MEMORY](docs/MEMORY.md) · [SKILLS](docs/SKILLS.md) · [MCP](docs/MCP.md) · [GATEWAY](docs/GATEWAY.md) · [ROUTINES](docs/ROUTINES.md) · [CONNECTORS](docs/CONNECTORS.md) · [FOLLOWUPS](docs/FOLLOWUPS.md) · [VOICE](docs/VOICE.md)。

---

## 支持平台

| 系统 | 是否支持 |
|---|---|
| macOS 12+（Intel / Apple Silicon） | 是 — 无需管理员密码 |
| Windows 10 / 11（Windows 终端、PowerShell、CMD） | 是 |
| glibc **2.28+** 的 Linux（如 Ubuntu 20.04+） | 是 — 安装无需 `sudo` |
| Windows 7 / 8 / XP | 否（Node.js 22） |
| 过旧 glibc / 无系统 Node 22 的 musl | 安装程序会停，或需先装系统 Node |

---

## 快速开始

### 安装（推荐）

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

下载公开可用。归档与内核按发行清单校验。缺少 Node.js 22 时安装私用副本。

**新开**终端以刷新 `PATH`，然后：

```bash
karmenbot --version
karmenbot
```

设置 → **Models**，添加提供方并粘贴密钥，**Save and test**。连接成功后提交小任务，看差异，按 `y`。

跨平台教程：[docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md) · [docs/tutorial.en.md](docs/tutorial.en.md)。分系统长文见 [教程.md](docs/教程.md)。

### 从本仓库源码运行

仍需从官方发行取得内核（克隆不含内核）：

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
npm run fetch-kernel
npm test
node bin/karmenbot.mjs
```

需要 Node.js **22+**，应用本身无需安装 npm 依赖。`npm run test:source` 不依赖内核；完整 `npm test` 需要 `vendor/` 内经核验的内核。

---

## 文档索引

| 文档 | 用途 |
|---|---|
| [中文教程](docs/tutorial.zh-CN.md) · [English](docs/tutorial.en.md) | 安装 → 首次批准写入 → 更新 / 卸载（全平台） |
| [GUIDE.md](docs/GUIDE.md) | 英文长设置指南（含各聊天应用） |
| [TUI.md](docs/TUI.md) | 界面分区、按键、截图 |
| [教程.md](docs/教程.md) → [macOS](docs/教程-macOS.md) / [Windows](docs/教程-Windows.md) / [Linux](docs/教程-Linux.md) | 中文分系统详解（`karmenbot learn` / `karmenbot 教程`） |
| 专题文档 | 记忆、技能、MCP、网关、例程、连接器、跟进、语音 |
| [更新](https://karmenloop.com/updates.html) · [下载](https://karmenloop.com/download.html) | 已发布变化 / 安装入口 |

---

## 常见问题

### 一句话说明 karmenbot？

本机全屏终端助手：用你的模型和目录办事，每次写入与命令都先问你。

### 和 Koder CLI 有何不同？

[koder-cli](https://github.com/KarmenLoop/koder-cli) 偏命令行 / 脚本；[koder-tui](https://github.com/KarmenLoop/koder-tui) 是另一套终端界面包装；**karmenbot** 是带设置中心、聊天网关与面向个人安装程序的 KARMEN 全屏助手。同族，入口不同。

### 密钥存在哪里？

`~/.karmenbot`（Windows：`%USERPROFILE%\.karmenbot`），通常为 `secrets.json`，权限 `600`。界面只显示圆点或末四位。

### 不启动网关，聊天能用吗？

不能。仅有凭证不够，需启动本机网关。配对批准发生在**这台电脑**上。

### 内核开源吗？

不开源。运行时按 [KERNEL-LICENSE.md](KERNEL-LICENSE.md) 单独分发。本仓库应用源码为 GPL-3.0-only，并附链接例外。

### 软可发现性

与本仓相关的检索说法：**本机终端 AI 助手 写前确认**、**自带密钥 编程代理 TUI**、**飞书 企微 钉钉 Telegram 网关**、**多模型会商 MoA 终端**、**Koder 内核 karmenbot**。内容以安装与文档为准，不为堆关键词。

---

## 贡献与安全

欢迎 Issue 与 PR。对本仓库的修改仍适用 GPL-3.0-only 与 [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md)。

请勿在 Issue 中粘贴 API 密钥、机器人令牌或配对码。安全问题请发 [info@karmenloop.com](mailto:info@karmenloop.com)。

---

## 许可与联系

[GPL-3.0-only](LICENSE) · [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) · [KERNEL-LICENSE.md](KERNEL-LICENSE.md) · [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

维护：[KarmenLoop](https://github.com/KarmenLoop) · 官网：[karmenloop.com](https://karmenloop.com) · 产品：[karmen-bot](https://karmenloop.com/karmen-bot.html)

相关（范围 / 许可各自独立）：[koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [koder-sdk](https://github.com/KarmenLoop/koder-sdk) · [karmen-memory](https://github.com/KarmenLoop/karmen-memory) · [组织主页](https://github.com/KarmenLoop/KarmenLoop)

Copyright © 2026 KARMEN / KarmenLoop.
