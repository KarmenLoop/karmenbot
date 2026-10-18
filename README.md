# karmenbot

在终端里打开的 KARMEN。你说出要办的事，它读文件、写文档、整理资料、跑命令。写入和执行之前，屏幕上先给出内容，等你确认。

- 官网：[karmenloop.com](https://karmenloop.com)
- 邮箱：[info@karmenloop.com](mailto:info@karmenloop.com)
- 界面与用法：[docs/TUI.md](docs/TUI.md)
- 分系统教程：[macOS](docs/教程-macOS.md) · [Windows](docs/教程-Windows.md) · [Linux](docs/教程-Linux.md)

![开屏](docs/media/01-splash.png)

## 下载

| 系统 | 命令 |
|---|---|
| macOS、Linux | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.sh \| sh` |
| Windows PowerShell | `irm https://karmenloop.com/downloads/karmenbot/install.ps1 \| iex` |
| Windows CMD | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd` |

[下载页](https://karmenloop.com/download.html) · [更新页](https://karmenloop.com/updates.html) · [产品页](https://karmenloop.com/karmen-bot.html)

macOS 12 及以上，Windows 10 / 11，glibc 2.28 及以上的 Linux。本机没有 Node.js 22 时，安装程序自带一份。Windows 7、Windows 8、XP 不支持。

装完进入设置中心。新开一个终端，输入 `karmenbot`。

## 产品

karmenbot 跑在你这台电脑上。工作区是当前目录，配置在 `~/.karmenbot`，密钥文件权限为 600。

它做四件事：

1. **全屏界面。** 折光体开屏，左侧是会话、模型、模式和用量，中间是对话，底部是输入框。方向键和鼠标都能操作。
2. **在文件夹里办事。** 读文件直接进行。写文件前展示修改前后的差异，跑命令前展示将要执行的命令。`y` 接受，`n` 或 `Esc` 拒绝。
3. **多个模型一起看同一件事。** 若干模型先分别给出看法，再由一个模型汇总后动手。
4. **接到你已经在用的聊天软件。** 飞书、企业微信、个人微信、钉钉、Telegram、Slack、Discord、WhatsApp。第一次联系需要你在这台电脑上批准。

手机版尚未提供下载。付款、承诺和提交订单之前，先交给你确认。

## 开始用

```bash
karmenbot
```

第一次没有模型时，设置中心会自己打开。方向键移到「模型」，回车，选厂商，粘贴密钥，保存并测试。密钥在输入框里显示为圆点。

回到对话后，直接写要办的事，例如：

```text
把这份会议纪要收成三条结论，写进结论.md
```

差异出现后按 `y`，文件才写入。

常用入口：

| 在界面里 | 在终端里 | 结果 |
|---|---|---|
| `/设置` | `karmenbot settings` | 模型、聊天软件、后台、教程、官网 |
| `/官网` | `karmenbot 官网` | 出品方、官网、邮箱，并检查更新 |
| `/learn` | `karmenbot 教程` | 按当前系统给出的教程 |
| `/moa on` | `karmenbot moa on` | 打开多模型会商 |

不开界面、办一件事：`karmenbot "把这份纪要收成三条结论"`。

完整的画面说明、按键和截图在 [docs/TUI.md](docs/TUI.md)。

## 内核

Koder 内核**不公开**。本仓库没有内核源码。安装时从官网下载到 `vendor/`，许可写在 `KERNEL-LICENSE.md`：可随 karmenbot 使用，不单独分发，不修改，不逆向。

本仓库的界面、安装程序、教程和测试使用 GPL-3.0-only，全文是 `LICENSE`。与内核一起发行的附加条款是 `LICENSE-EXCEPTION.md`。

从源码运行时，先取内核再启动：

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
node scripts/fetch-kernel.mjs --from https://karmenloop.com/downloads/karmenbot
node bin/karmenbot.mjs
```

联系：[info@karmenloop.com](mailto:info@karmenloop.com) · [karmenloop.com](https://karmenloop.com)
