# 界面与用法

karmenbot 的主界面在终端里全屏运行。下面按实际画面说明它长什么样、怎么往下做。截图来自本程序的界面，不是示意图。

官网 [karmenloop.com](https://karmenloop.com) · 邮箱 [info@karmenloop.com](mailto:info@karmenloop.com)

## 1. 安装

| 系统 | 命令 |
|---|---|
| macOS、Linux | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.sh \| sh` |
| Windows PowerShell | `irm https://karmenloop.com/downloads/karmenbot/install.ps1 \| iex` |
| Windows CMD | `curl -fsSL https://karmenloop.com/downloads/karmenbot/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd` |

[下载页](https://karmenloop.com/download.html) · [更新页](https://karmenloop.com/updates.html)

macOS 打开「终端」（`⌘ 空格`，输入「终端」）。Linux 按 `Ctrl+Alt+T`。Windows 10 / 11 打开 PowerShell 或 CMD。把对应那一行粘贴进去，回车。

装完会进入设置中心。若提示新开一个终端，关掉当前窗口再开一个，输入：

```bash
karmenbot --version
```

看到版本号后，输入 `karmenbot` 进入界面。各系统的路径、开机自启和卸载，分别写在 [macOS](教程-macOS.md)、[Windows](教程-Windows.md)、[Linux](教程-Linux.md)。

## 2. 开屏

![开屏：折光体与 KARMEN](media/01-splash.png)

进入时先出现折光体和 KARMEN。开屏按真实步骤走完：准备界面、读取配置、连接模型、恢复会话、就绪。开屏期间按下的键会保留，进入输入框。

## 3. 对话

![对话与写入确认](media/02-confirm.png)

画面分三块：

- **左侧**：会话、工作区、模型、模式、多模型会商、用量、已写入的文件。窗口变窄时侧栏收起。
- **中间**：对话。开头一句是「你好，我是 Karmen —— 一块会干活的玻璃。」
- **底部**：输入框。写完按回车。

读文件直接进行。要写文件时，中间弹出修改前后的差异，底部写着按 `y` 接受、按 `n` 或 `Esc` 拒绝。要跑命令时，同样先展示命令全文。你没有接受，磁盘上的文件不变，命令不执行。

示例：

```text
把这份会议纪要收成三条结论，写进结论.md
```

差异里的路径和正文核对过后，按 `y`。

侧栏里的「自动确认」默认关闭。只在你明确打开之后，文件和命令才不再逐条询问。

## 4. 设置中心

![设置中心](media/03-settings.png)

第一次还没有模型时，设置中心自动打开。之后在输入框写 `/设置` 回车，或在终端运行 `karmenbot settings`。

方向键移动，回车进入，`Esc` 返回。这一页和确认弹窗打开时，可以用鼠标点选。退出界面后，终端恢复原来的鼠标和光标。

建议第一次按这个顺序：

1. **模型。** 回车进入，输入厂商名字过滤，例如 `deepseek`。选中后粘贴密钥。密钥显示为圆点。选「保存并测试」，测试通过再返回。换好的模型立刻用于当前会话。
2. **多模型会商。** 勾选参与的模型，指定负责汇总的那一个，打开开关。若干模型先分别给出看法，再由汇总的模型动手。
3. **聊天软件。** 飞书、企业微信、钉钉、个人微信走扫码。Telegram、Slack、Discord、WhatsApp 按页面上的字段填写。
4. **后台。** 启动后，聊天消息才会送到这台电脑。开机自启在同一页。配对请求在这一页批准；撤回和删除需要连按两次。
5. **教程。** 先选 macOS、Windows 或 Linux，再点章节。三套教程的命令和按键各不相同。
6. **官网与更新。** 打开 [karmenloop.com](https://karmenloop.com)、打开更新页，或检查当前版本是否与官网记录一致。

![添加模型](media/04-model.png)

![个人微信扫码](media/05-weixin.png)

## 5. 界面命令

在输入框以 `/` 开头。`Tab` 补全。

| 输入 | 作用 |
|---|---|
| `/设置` | 设置中心 |
| `/官网` | 官网介绍与更新检查 |
| `/help` | 命令和按键 |
| `/learn` | 短教程 |
| `/moa on` / `/moa off` | 多模型会商 |
| `/model` | 查看或切换模型 |
| `/lang zh` / `/lang en` | 界面语言，选择会保存 |
| `/new` | 新会话 |
| `/banner` | 重播开屏 |
| `/exit` | 退出 |

问「这个工具是谁开发的」时，回答来自官网：KARMEN / Koder 出品，只为你一个人服务；付款、承诺和提交订单之前先交给你确认；手机版尚未提供下载。并给出官网 [karmenloop.com](https://karmenloop.com) 与邮箱 [info@karmenloop.com](mailto:info@karmenloop.com)。

## 6. 不开界面

当前目录下直接办一件事：

```bash
karmenbot "把这份纪要收成三条结论"
```

确认规则与全屏界面相同。`karmenbot doctor` 检查运行环境、内核、模型和已接入的聊天软件，并打印官网与更新页。

## 7. 内核

内核**不公开**，源码不在本仓库。程序安装时从 [官网下载地址](https://karmenloop.com/downloads/karmenbot) 取得内核并校验后放入 `vendor/`。许可是 `KERNEL-LICENSE.md`。

本仓库其余文件使用 GPL-3.0-only，全文见仓库根目录的 `LICENSE`。
