# karmenbot

[English](README.md) | 简体中文

karmenbot 是 KARMEN 的全屏终端助手。进入工作目录、连接自己的模型，再描述任务；修改文件和执行命令前，可以先查看差异或完整命令并作出决定。

本仓库源码采用 [GPL-3.0-only](LICENSE)，附下述链接例外。Koder 内核为专有组件，作为独立发行资产提供，不包含在本仓库源码中。

![karmenbot 启动画面](docs/media/01-splash.png)

## 适合做什么

在当前目录阅读代码、审阅差异、修改文件或运行命令。可以让数个已配置模型分别提出意见，再由其中一个汇总并执行。消息应用连接可选，由本机后台进程维持。[设置指南（英文）](docs/GUIDE.md)介绍安装、模型和第一个保存的文件。

这个终端应用与尚未提供下载的 KARMEN BOT 手机应用分别维护。付款、下单和承诺仍需用户决定。

## 功能

- 全屏会话、对话与输入区，可用方向键或鼠标；`/settings` 打开设置。
- `karmenbot ask` 只读，`run` 可以修改但仍等待 `y`；`review` 审阅差异，`fix` 重新运行检查，`test` 按项目风格补充测试。
- `memory` 保存当前目录笔记，`flow` 运行 JSON 步骤列表，`ci init` 添加 PR 审阅工作流。
- Zed、Neovim、Emacs 可通过 `karmenbot acp` 接入；`editor` 打印配置片段。
- 写入前显示差异，执行前显示命令；`y` 同意，`n` 或 `Esc` 退回。
- 模型由用户配置。密钥保存在 `~/.karmenbot`，文件权限为 600，界面遮蔽显示。
- 多模型协作默认关闭，启用后由一个模型汇总其他意见并执行。
- 可选连接包括飞书、企业微信、钉钉、个人微信，以及 Telegram、Slack、Discord、WhatsApp Business。陌生人的首次联系需在本机批准。
- 后台进程可在关闭窗口后继续维持消息连接；开机启动为可选开关。
- 应用内可查看官网、更新页和版本；版本检查不发送密钥或文件。

## 支持平台

macOS 12+（Intel、Apple Silicon）；Windows 10/11（Windows Terminal、PowerShell、CMD）；glibc 2.28+ 的 Linux，包括 Ubuntu 20.04+。macOS/Linux 安装不需管理员密码。Windows XP、7、8 不支持 Node.js 22，不能安装本版。

## 安装与首次使用

macOS/Linux：

```bash
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
```

Windows PowerShell：

```powershell
irm https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.ps1 | iex
```

Windows CMD：

```bat
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd
```

下载公开可用，不需要桌面测试邀请 Cookie。安装程序按发行清单检查应用与内核归档；缺少 Node.js 22 时安装独立运行副本。

安装完成后打开设置。另开终端以加载新 `PATH`，执行：

```bash
karmenbot --version
karmenbot
```

进入 **Models**，添加提供方和密钥，选择 **Save and test**。设置成功后提交一个小任务，检查差异，再按 `y`。完整中文步骤见[macOS 教程](docs/教程-macOS.md)、[Windows 教程](docs/教程-Windows.md)、[Linux 教程](docs/教程-Linux.md)；`karmenbot learn` 会打印当前系统的中文章节。

## 授权范围内的源码运行

源码副本仍需从官方发行页取得独立内核，克隆不会包含它：

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
npm run fetch-kernel
npm test
node bin/karmenbot.mjs
```

需要 Node.js 22+，无需安装 npm 依赖。`npm run test:source` 只检查公开协议适配器与导出边界；完整 `npm test` 还要求 `vendor/` 内有经核验的内核。内核下载失败属于安装失败，源码检查通过不能代替安装可用。

## 文档与反馈

| 入口 | 内容 |
| --- | --- |
| [中文教程](docs/教程.md) | 按步骤学习使用 |
| [英文设置指南](docs/GUIDE.md) | 安装、模型、文件保存和消息应用设置 |
| [界面参考（英文）](docs/TUI.md) | 按键、截图与界面说明 |
| [更新](https://karmenloop.com/updates.html) | 已发布变化 |
| [产品页](https://karmenloop.com/karmen-bot.html) | 官网产品介绍 |

欢迎提交问题与 PR。请勿上传 API 密钥、机器人令牌或配对码；安全问题通过 [info@karmenloop.com](mailto:info@karmenloop.com) 联系。

## 许可

Copyright © 2026 KARMEN。本仓库文件按 [GNU GPL v3.0 only](LICENSE) 分发，附 [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) 所列内核链接例外。

独立内核适用 [KERNEL-LICENSE.md](KERNEL-LICENSE.md)：可与 karmenbot 一起使用，包括商业使用；不能单独分发、修改或逆向工程。它不属于 GPL 源码。内核开发源码保持私有。

第三方归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本页为产品说明，不增加或替代原始法律文件的条款。

[GitHub](https://github.com/KarmenLoop/karmenbot) · [邮箱](mailto:info@karmenloop.com) · [官网](https://karmenloop.com)
