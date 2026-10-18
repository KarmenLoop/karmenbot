# karmenbot 全屏界面（TUI）

karmenbot 的正文是一个全屏终端界面。打开终端，输入 `karmenbot` 回车，就是它。

官网：[https://karmenloop.com](https://karmenloop.com)  
官方邮箱：[info@karmenloop.com](mailto:info@karmenloop.com)  
仓库：[https://github.com/KarmenLoop/karmenbot](https://github.com/KarmenLoop/karmenbot)

## 下载

安装脚本会同时取开源程序和闭源内核，校验 SHA-256 后再装。一行命令：

| 系统 | 命令 |
|---|---|
| macOS、Linux | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.sh \| sh` |
| Windows PowerShell（Windows 10 / 11） | `irm https://karmenloop.com/downloads/karmenbot/install.ps1 \| iex` |
| Windows CMD | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd` |

也可以从官网页面进入：

- 下载页：[https://karmenloop.com/download.html](https://karmenloop.com/download.html)
- 更新页：[https://karmenloop.com/updates.html](https://karmenloop.com/updates.html)
- 产品页：[https://karmenloop.com/karmen-bot.html](https://karmenloop.com/karmen-bot.html)

系统要求：macOS 12 及以上（Intel 与 Apple 芯片），Windows 10 / 11，glibc 2.28 及以上的 Linux。没有 Node.js 22 时，安装脚本会自备一份，不改你系统里原来的 Node。Windows 7、Windows 8 和 XP 不能装。

装完会打开设置中心。新开一个终端后，`karmenbot --version` 能打出版本号即表示命令已在 PATH 里。

## 打开之后看见什么

先是折光体标志和「KARMEN」字样，安装框式的开屏会按真实步骤走完：准备界面、读取配置、连接模型、恢复会话、就绪。开屏期间按的键不会丢。

然后是对话页：

- 上方是标题和当前模型。
- 左侧是会话、工作区、模型、模式、MoA、用量和已经写入的文件。窗口窄时侧栏让位给正文；太小的窗口会请你拉大。
- 中间是对话。第一句是：「你好，我是 Karmen —— 一块会干活的玻璃。」
- 底部是输入框。要办的事直接写在这里，回车发送。

读文件它自己做。要写文件或跑命令时，会先弹出修改对比或命令正文，你按 `y` 接受、`n` 或 `Esc` 拒绝。没有你的确认，文件不会被改，命令不会被执行。

## 只用键盘，或用鼠标

方向键移动，回车确认，`Esc` 返回。设置中心和确认弹窗打开时，可以用鼠标点选；这时鼠标用来点按钮，想复制屏幕上的字，先关掉弹窗。退出界面后，鼠标协议会关掉，终端恢复原样，光标重新出现。

第一次运行、还没有模型时，会直接进入设置中心。之后随时：

- 界面里输入 `/设置` 回车
- 或在终端运行 `karmenbot settings`

设置中心里可以完成这些事，不需要记命令：

1. 选模型厂商，粘贴密钥（输入时以掩码显示），保存并测试。换模型后当前会话立刻改用新模型。
2. 配多模型会商（MoA）：几个模型先出主意，一个模型汇总后再动手。
3. 接入聊天平台。飞书、企业微信、钉钉、个人微信可以扫码；Telegram、Slack、Discord、WhatsApp 按表单填写。
4. 启动后台网关、开机自启、批准配对码。删除和撤回需要连按两次。
5. 按你的系统阅读教程：macOS、Windows、Linux 各一套，命令和按键互不相同。
6. 打开官网、打开更新页、检查有没有新版本。

## 界面里的命令

在输入框以 `/` 开头。`Tab` 补全，方向键在列表里移动。

| 输入 | 作用 |
|---|---|
| `/设置` | 设置中心 |
| `/官网` | 按官网介绍出品方，并检查更新 |
| `/help` | 命令和按键 |
| `/learn` | 短教程 |
| `/moa on` | 打开多模型会商 |
| `/model` | 查看或切换模型 |
| `/lang zh` 或 `/lang en` | 界面语言，选择会保存 |
| `/new` | 新会话 |
| `/banner` | 重播开屏 |
| `/exit` | 退出 |

问「这个工具是谁开发的」或 “who made this” 时，界面、单次任务和已接入的聊天软件都会按官网介绍 KARMEN / Koder，并给出官网与官方邮箱，不另编一家公司。

## 不开界面的时候

`karmenbot "把这份纪要收成三条结论"` 在当前目录直接办事，适合脚本和管道。确认规则相同：不加 `--yes` 时，写文件和跑命令仍要你点头。

`karmenbot doctor` 检查 Node、内核、模型、聊天平台，并打印官网和更新页。`karmenbot 官网` 打印介绍并对照官网的版本记录。

## 协议

本仓库的界面、设置中心、安装脚本、教程和测试，使用 **GNU GPL 第 3 版、仅第 3 版**（`GPL-3.0-only`），与 OpenHuman 相同。全文见 `LICENSE`。

Koder 内核不开源。它随安装包进入 `vendor/`，许可是 `KERNEL-LICENSE.md`：可以免费随 karmenbot 使用，包括商用；不能单独分发、修改或逆向。`LICENSE-EXCEPTION.md` 是 GPL 第 7 条附加许可，允许把本仓库与这份闭源内核组合发布，组合后需要公开的源码不包括内核。

问题与合作请写官方邮箱 [info@karmenloop.com](mailto:info@karmenloop.com)，或看官网 [https://karmenloop.com](https://karmenloop.com)。
