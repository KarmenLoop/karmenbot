# karmenbot 教程（简体中文）

[English](tutorial.en.md) · [中文](tutorial.zh-CN.md) · 返回 [README](../README.zh-CN.md)

本教程从空终端走到**一次已批准的落盘写入**，并说明更新与卸载。各系统按键与路径在对应小节标出。更长的英文聊天接入见 [GUIDE.md](GUIDE.md)；界面与截图见 [TUI.md](TUI.md)。**分系统中文详解保留并推荐精读：** [教程-macOS.md](教程-macOS.md) · [教程-Windows.md](教程-Windows.md) · [教程-Linux.md](教程-Linux.md)（终端内：`karmenbot learn` / `karmenbot 教程`）。

**对应版本：** v0.1.1 · **官网：** [karmenloop.com](https://karmenloop.com)

---

## 1. 怎样算「能用」

以下都满足即可停下：

1. `karmenbot --version` 打出版本号。
2. 设置中心里模型测试为绿色。
3. 提交过一次任务，看到差异或命令，按了 `y`，并在磁盘上看到结果。
4. *（可选）* 聊天已接入、网关在跑，且**你自己的账号**能收到回复。

只用终端时，不必接聊天。

---

## 2. 检查系统

| 系统 | 能否安装 |
|---|---|
| macOS 12+（Intel / Apple Silicon） | 能 — 无需管理员密码 |
| Windows 10 / 11 | 能 — 推荐 Windows 终端 |
| Windows 7 / 8 / XP | 不能 — Node.js 22 |
| glibc 2.28+ 的 Linux | 能 — 安装无需 `sudo` |
| 过旧 glibc | 安装程序会停 |
| Alpine / musl | 先用系统包管理器装 Node.js 22，再跑安装程序 |

---

## 3. 安装

### 打开终端

| 系统 | 做法 |
|---|---|
| **macOS** | `⌘ 空格` → 输入「终端」→ 回车 |
| **Windows 11** | 右键开始 → 终端 |
| **Windows 10** | 右键开始 → Windows PowerShell |
| **Linux** | `Ctrl+Alt+T` 或发行版自带终端 |

### 粘贴一行

**macOS / Linux**（粘贴：macOS `⌘V`，Linux 常见 `Ctrl+Shift+V`）：

```bash
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
```

**Windows PowerShell**：

```powershell
irm https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.ps1 | iex
```

**Windows CMD**：

```bat
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd
```

观察清单：系统 → Node.js 22 → 发行信息 → **SHA-256** 校验下载 → 安装 → PATH。校验失败会停下且不写入。

入口：[下载页](https://karmenloop.com/download.html) · [更新](https://karmenloop.com/updates.html)

### 确认命令可用

**新开**一个终端窗口，再执行：

```bash
karmenbot --version
```

| 若找不到命令 | 尝试 |
|---|---|
| macOS / Linux | `export PATH="$HOME/.local/bin:$PATH"`，并检查 shell 配置里的 `# karmenbot PATH` |
| Windows | 关掉所有控制台再开；安装程序写入用户 PATH 的 `%USERPROFILE%\.karmenbot\bin`。仍不行可注销一次 |
| Node 下载慢 | 安装前：`export KARMENBOT_NODE_MIRROR=https://npmmirror.com/mirrors/node`（PowerShell 用 `$env:KARMENBOT_NODE_MIRROR=...`） |

自定义路径：`KARMENBOT_HOME`、`KARMENBOT_BIN_DIR`。

---

## 4. 设置与第一个模型

未配置模型时首次 `karmenbot` 会打开**设置中心**。之后：输入框 `/settings` 或 `/设置`，或 `karmenbot settings`。

| 操作 | 键盘 | 鼠标 |
|---|---|---|
| 移动 | `↑` `↓` | 移到该行 |
| 打开 / 勾选 / 确认 | 回车或空格 | 左键 |
| 返回 | `Esc` | 顶部返回 |
| 翻页 | `PgUp` `PgDn` | 滚轮 |

**Windows：** 鼠标在 Windows 终端里最好用；老式黑窗口请用键盘——所有步骤都可用键盘完成。

### 添加模型（必须）

1. 主页 → **模型** → **+ 添加模型**。
2. 输入关键字筛选厂商（如 `deep`）。
3. 模型 id 一般可保留；粘贴密钥（显示为圆点）。
4. 第一个模型保持「设为默认」。
5. **保存并测试** → 绿色表示厂商有响应。

密钥在 `~/.karmenbot/secrets.json`（Windows：`%USERPROFILE%\.karmenbot\secrets.json`），权限 `600`。`karmenbot doctor` 可查看状态。

| 测试失败 | 处理 |
|---|---|
| 401 | 密钥不完整或已吊销 |
| 402 / 403 | 余额或未开通该模型 |
| 超时 | 网络拦截，换网络再测 |

更喜欢问答式：`karmenbot setup`。

---

## 5. 第一次任务（必做路径）

```bash
cd ~/Documents          # Windows PowerShell: cd $HOME\Documents
karmenbot
```

输入具体任务，例如：

```text
把这些会议纪要整理成三条结论，写入 conclusions.md
```

- 读文件不问；写文件出差异；跑命令出示原文。
- 同意：`y`；拒绝：`n` / `Esc`。
- 选择题：方向键 + 回车，或鼠标点选。

按 `y` 后用其他程序打开文件，即完成必做安装验收。

在看过一次真实任务前，不要开 `/yes` 或 `--yes`。即便自动确认，选择题与登录仍会停下。

不开界面：

```bash
karmenbot "把这些纪要整理成三条结论"
```

提示 `[y/N]`，只回车表示否。

### 常用斜杠命令

`/设置` · `/help` · `/learn` · `/model` · `/moa on|off` · `/yes` · `/new` · `/exit` · `/lang zh|en`

按键差异：

| | macOS | Windows / Linux |
|---|---|---|
| 按词跳转 | `Option+←/→` | `Ctrl+←/→` |
| 界面占用鼠标时复制 | 按住 `Option` 拖选 | Windows 终端按住 `Shift` 拖选 |
| 退出 | `/exit` 或空闲连按两次 `Ctrl+C` | 同左 |

---

## 6. 可选：MoA、聊天、网关

### 多模型会商

至少两个已配置模型。设置 → **多模型会商**：勾选参考模型、点选聚合模型、每用户回合一次、开启并保存。开关：`/moa on` · `karmenbot moa on`。临时一次：`karmenbot --moa "…"`。每个参考模型都是单独计费调用。

### 聊天应用

只用终端可整节跳过。凭证与**正在运行的网关**缺一不可。

设置 → **聊天平台**，或 `karmenbot connect`：

- **扫码：** 飞书 / Lark、企业微信、钉钉、个人微信。
- **填表：** Telegram、Slack、Discord、WhatsApp **商业** Cloud API（个人号不支持）。

配对：非扫码认主的应用会回 8 位码。在网关页批准，或 `karmenbot pair approve 配对码`（1 小时有效）。批准权在本机。

聊天里：整句同意/拒绝词才算数；5 分钟无回复视为拒绝；群里需 @。写入发差异预览；文件落在**网关工作目录**，不是当前 shell 目录。

### 后台网关

设置 → **后台网关** → 启动；或 `karmenbot gateway start|stop|status|logs`。

| 系统 | 开机自启 |
|---|---|
| macOS | launchd 登录项；整夜在线需关睡眠 |
| Windows | 当前用户启动项；登录时可能闪一下控制台 |
| Linux | systemd 用户服务；注销后需曾执行 `loginctl enable-linger "$USER"` |

默认目录：`~/karmenbot-workspace` · Windows `%USERPROFILE%\karmenbot-workspace`。换目录：`karmenbot gateway start -w 路径`。

网关回复默认**先草稿再发送**。详见 [GATEWAY.md](GATEWAY.md)。

---

## 7. 记忆、技能、MCP、例程（可选）

```bash
karmenbot memory add "回答尽量简短"
karmenbot skill install examples/skills/daily-brief
karmenbot connect playwright
karmenbot routine add …
```

技能里的 shell / 写入仍会询问。见 [MEMORY.md](MEMORY.md) · [SKILLS.md](SKILLS.md) · [MCP.md](MCP.md) · [ROUTINES.md](ROUTINES.md) · [CONNECTORS.md](CONNECTORS.md) · [FOLLOWUPS.md](FOLLOWUPS.md) · [VOICE.md](VOICE.md)。

---

## 8. 更新与卸载

- **更新：** 按系统重跑同一条安装命令，或在应用内「官网与更新」对照下载地址的 `latest.json`（不发送密钥或文件）。亦可看 [更新页](https://karmenloop.com/updates.html)。
- **卸载：** `karmenbot uninstall`（保留配置）· `karmenbot uninstall --all`（连配置与密钥）。Unix 可删掉 shell rc 里的 PATH 注释块；Windows 会移除用户 PATH 条目。

---

## 9. 源码运行（开发者）

```bash
git clone https://github.com/KarmenLoop/karmenbot.git
cd karmenbot
npm run fetch-kernel
npm test
node bin/karmenbot.mjs
```

需要 Node.js 22+。内核下载失败属于安装失败；仅 `npm run test:source` 通过不能代替可用安装。

---

## 10. 相关文档与产品

- 分系统长文：[教程.md](教程.md)
- 英文长指南：[GUIDE.md](GUIDE.md) · 界面：[TUI.md](TUI.md)
- 同族：[koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [koder-sdk](https://github.com/KarmenLoop/koder-sdk)
- 联系：[info@karmenloop.com](mailto:info@karmenloop.com)
