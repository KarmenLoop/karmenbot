// The full Chinese tutorial, one edition per system: commands, keys, paths and
// fixes differ between macOS, Windows and Linux. `karmenbot 教程` picks the
// edition for this computer; scripts/build-tutorial.mjs writes all three to docs/.
export const SYSTEMS = {
  mac: { name: "macOS", file: "教程-macOS.md" },
  win: { name: "Windows", file: "教程-Windows.md" },
  linux: { name: "Linux（含 Ubuntu）", file: "教程-Linux.md" },
};

export function currentSystem(platform = process.platform) {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "win";
  return "linux";
}

export function normalizeSystem(value) {
  const text = String(value || "").toLowerCase();
  if (["mac", "macos", "darwin", "osx", "苹果"].includes(text)) return "mac";
  if (["win", "windows", "win10", "win11", "微软"].includes(text)) return "win";
  if (["linux", "ubuntu", "debian", "fedora", "arch"].includes(text)) return "linux";
  return null;
}

// Facts that differ per system, used throughout the chapters.
function facts(os) {
  return {
    mac: {
      terminal: "「终端」：按 `⌘ 空格` 打开聚焦搜索，输入“终端”，回车",
      paste: "`⌘V`",
      config: "~/.karmenbot",
      workspace: "~/karmenbot-workspace",
      select: "按住 `Option` 再拖动鼠标",
      wordKeys: "`Option+←` / `Option+→`",
      pipe: "cat 错误日志.txt | karmenbot \"这些报错是什么原因，怎么修？\"",
      folder: "karmenbot -w ~/Documents/报告 \"把这些周报合并成一份月报\"",
    },
    win: {
      terminal: "「终端」：右键点开始按钮，选“终端”（Windows 11）或“Windows PowerShell”（Windows 10）",
      paste: "`Ctrl+V`，或在窗口里点鼠标右键",
      config: "%USERPROFILE%\\.karmenbot（也就是 C:\\Users\\你的用户名\\.karmenbot）",
      workspace: "%USERPROFILE%\\karmenbot-workspace",
      select: "按住 `Shift` 再拖动鼠标",
      wordKeys: "`Ctrl+←` / `Ctrl+→`",
      pipe: "Get-Content 错误日志.txt | karmenbot \"这些报错是什么原因，怎么修？\"      # PowerShell\ntype 错误日志.txt | karmenbot \"这些报错是什么原因，怎么修？\"             # CMD",
      folder: "karmenbot -w \"$HOME\\Documents\\报告\" \"把这些周报合并成一份月报\"            # PowerShell\nkarmenbot -w \"%USERPROFILE%\\Documents\\报告\" \"把这些周报合并成一份月报\"   # CMD",
    },
    linux: {
      terminal: "「终端」：按 `Ctrl+Alt+T`（Ubuntu），或在应用列表里找“终端”",
      paste: "`Ctrl+Shift+V`",
      config: "~/.karmenbot",
      workspace: "~/karmenbot-workspace",
      select: "按住 `Shift` 再拖动鼠标",
      wordKeys: "`Ctrl+←` / `Ctrl+→`",
      pipe: "cat 错误日志.txt | karmenbot \"这些报错是什么原因，怎么修？\"",
      folder: "karmenbot -w ~/Documents/报告 \"把这些周报合并成一份月报\"",
    },
  }[os];
}

const pick = (os, values) => values[os] ?? values.unix ?? "";

function install(os) {
  const f = facts(os);
  const box = (system, node, profile) => `\`\`\`text
✓ 1  检查系统      ${system}
✓ 2  准备 Node.js   ${node}
✓ 3  获取发布信息   karmenbot 0.1.0
✓ 4  下载安装包     204 KB · SHA-256 已校验
✓ 5  安装           启动命令就位
✓ 6  加入 PATH      ${profile}
\`\`\``;
  return pick(os, {
    mac: `
## 你的 Mac 能不能装

macOS 12 及以上都可以，Intel 和 Apple 芯片都支持，不需要管理员密码。

## 第 1 步：打开终端

${f.terminal}。

## 第 2 步：粘贴这一行，回车

\`\`\`bash
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
\`\`\`

粘贴用 ${f.paste}。

## 第 3 步：看它表演

屏幕上先出现一个大大的折光体和 KARMEN 字样，然后是安装框，一项一项转圈、打勾：

${box("macOS 15 · arm64", "系统自带 v22.x，或自动下载一份私用的", "~/.zshrc")}

装完会直接打开设置中心（下一章），用鼠标点就能配好。里面有一项「官网与更新」，也可以随时输入 \`karmenbot 官网\`：它按官网介绍这是谁做的，并到官网查有没有新版本。官网是 https://karmenloop.com ，更新页是 https://karmenloop.com/updates.html 。

## 第 4 步：确认装好了

如果提示“新开一个终端”，按 \`⌘N\` 开个新窗口，输入 \`karmenbot --version\`，看到版本号就成功了。

## 小状况

- **提示 command not found: karmenbot**：新开一个终端窗口；还不行就运行 \`export PATH="$HOME/.local/bin:$PATH"\`。
- **下载 Node.js 很慢**：先运行 \`export KARMENBOT_NODE_MIRROR=https://npmmirror.com/mirrors/node\`，再粘贴安装命令。
- **想装到别处**：设置 \`KARMENBOT_HOME\`（程序和配置）和 \`KARMENBOT_BIN_DIR\`（启动命令）。

> 安装脚本下载的每个文件都会核对 SHA-256 指纹，对不上就当场停下、什么都不装。宁可罢工，也不装来路不明的东西。
`,
    linux: `
## 你的 Linux 能不能装

| 系统 | 能不能装 |
|------|----------|
| Ubuntu 20.04 及以上、Debian 10+、Fedora、Arch、openSUSE | 可以 |
| 树莓派等 ARM（64 位、32 位 ARMv7） | 可以 |
| 太老的发行版（glibc 低于 2.28，比如 Ubuntu 18.04） | 不行，脚本会直接说明 |
| Alpine 等 musl 系统 | 先用包管理器装好 Node.js 22，再运行安装命令 |

不需要 root，也不用 sudo。

## 第 1 步：打开终端

${f.terminal}。

## 第 2 步：粘贴这一行，回车

\`\`\`bash
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
\`\`\`

粘贴用 ${f.paste}（终端里 \`Ctrl+V\` 不管用，这是 Linux 终端的老规矩）。

没有 curl？Ubuntu / Debian 先运行 \`sudo apt install curl\`，Fedora 运行 \`sudo dnf install curl\`；或者直接用 wget：

\`\`\`bash
wget -qO- https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.sh | sh
\`\`\`

## 第 3 步：看它表演

先是大大的折光体和 KARMEN 字样，然后安装框逐项打勾：

${box("Ubuntu 24.04 LTS · x64", "系统自带 v22.x，或自动下载一份私用的", "~/.bashrc")}

装完会直接打开设置中心（下一章）。里面有一项「官网与更新」，也可以随时输入 \`karmenbot 官网\`：它按官网介绍这是谁做的，并到官网查有没有新版本。官网是 https://karmenloop.com ，更新页是 https://karmenloop.com/updates.html 。

## 第 4 步：确认装好了

新开一个终端（\`Ctrl+Shift+T\` 开新标签页），输入 \`karmenbot --version\`。

## 小状况

- **提示 command not found**：新开终端；还不行就运行 \`export PATH="$HOME/.local/bin:$PATH"\`。用 fish 的朋友运行 \`fish_add_path ~/.local/bin\`。
- **下载 Node.js 很慢**：\`export KARMENBOT_NODE_MIRROR=https://npmmirror.com/mirrors/node\` 之后再装。
- **中文显示成问号**：运行 \`locale\` 看一眼；Ubuntu 可以 \`sudo apt install language-pack-zh-hans\` 后重新登录。

> 每个下载的文件都会核对 SHA-256，对不上就停，绝不将就。
`,
    win: `
## 你的 Windows 能不能装

| 系统 | 能不能装 |
|------|----------|
| Windows 11 | 可以（推荐，自带 Windows 终端，显示效果最好） |
| Windows 10（1803 及以上） | 可以 |
| Windows 7 / 8 / XP | 不行，见本章末尾 |

不需要管理员权限，也不会改你的系统设置。

## 方法一：PowerShell（推荐）

1. 打开${f.terminal}。
2. 复制下面这一行，粘贴到窗口里（${f.paste}），回车：

\`\`\`powershell
irm https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.ps1 | iex
\`\`\`

## 方法二：CMD（命令提示符）

1. 按 \`Win+R\`，输入 \`cmd\`，回车。
2. 粘贴下面这一行（CMD 里点鼠标右键就是粘贴），回车：

\`\`\`bat
curl -fsSL https://github.com/KarmenLoop/karmenbot/releases/latest/download/install.cmd -o %TEMP%\\karmenbot-install.cmd && %TEMP%\\karmenbot-install.cmd
\`\`\`

它会叫上 PowerShell 帮忙，只这一次，不改执行策略。

## 安装时你会看到

先是大大的折光体和 KARMEN 字样，然后安装框逐项打勾：

${box("Windows 11 (build 26100) · x64", "系统自带 v22.x，或自动下载一份私用的", "用户 PATH")}

装完会直接打开设置中心（下一章），**用鼠标点就能配好**。里面有一项「官网与更新」，也可以随时输入 \`karmenbot 官网\`：它按官网介绍这是谁做的，并到官网查有没有新版本。官网是 https://karmenloop.com ，更新页是 https://karmenloop.com/updates.html 。

## 装完之后

**关掉这个窗口，再开一个新的**（新窗口才认得新命令），输入 \`karmenbot\` 回车。

## 小状况

- **提示“无法将 karmenbot 识别为命令”**：关掉所有终端窗口再开；还不行就注销一次 Windows。
- **提示“禁止运行脚本”**：改用方法二（CMD），它只在这一次放行，不改系统设置。
- **中文是乱码或方块**：用 Windows 终端（Windows 11 自带；Windows 10 可在应用商店免费安装“Windows Terminal”）。老式黑窗口里先运行 \`chcp 65001\`。
- **下载 Node.js 很慢**：PowerShell 里先运行 \`$env:KARMENBOT_NODE_MIRROR="https://npmmirror.com/mirrors/node"\`，再粘贴安装命令。

## Windows 7 / 8 / XP 为什么不行

Karmen 跑在 Node.js 22 上，而 Node.js 22 只支持 Windows 10 及以上；XP 连现在网站用的加密连接都不支持，安装包根本下不下来。不是我们小气，是这些老系统已经退休十多年了。

**变通办法**：把 Karmen 装在一台新一点的电脑上并接入飞书或微信，老电脑上的你照样能在聊天里使唤它。
`,
  });
}

function settings(os) {
  const f = facts(os);
  return `
第一次运行 \`karmenbot\` 会自动打开**设置中心**；以后随时在输入框里输入 \`/设置\`（或 \`/settings\`）回车，或者在终端里运行 \`karmenbot settings\`。

## 怎么操作：键盘、鼠标都行

| 想做什么 | 键盘 | 鼠标 |
|----------|------|------|
| 选中某一项 | \`↑\` \`↓\` | 移到那一行 |
| 确定 / 打开 / 打勾 | \`回车\` 或 \`空格\` | 左键点一下 |
| 返回上一层 | \`Esc\` | 点顶部的“‹ 返回” |
| 翻页 | \`PgUp\` \`PgDn\` | 滚轮 |
| 在输入框里填字 | 选中输入框直接打字，粘贴用 ${f.paste} | 点输入框 |

${pick(os, {
  win: "> 鼠标在 Windows 终端（Windows 11 自带）里最好用；如果在老式黑窗口里点不动，用键盘也能完成全部操作。\n",
  mac: "> 系统自带的「终端」和 iTerm2 都支持鼠标点选。\n",
  linux: "> GNOME 终端、Konsole 等主流终端都支持鼠标点选。\n",
})}
## 三步配好

**① 模型（必须）**：点「模型」→「+ 添加模型」→ 在厂商列表里点一个（直接打字可以筛选，比如输入 deep 就只剩 DeepSeek）→ 模型名一般不用改 → 在「密钥」框里粘贴 API Key（屏幕上只显示圆点，这是在帮你保密）→ 点「保存并测试」。看到绿色的“连接正常”就成了。

拿不准选哪家？在国内推荐 DeepSeek、通义千问、Kimi、智谱；有海外账号可以选 ChatGPT、Claude、Gemini；电脑上自己跑了模型就选「本地兼容接口」，不用密钥。密钥去对应厂商官网的控制台创建，复制回来即可。

**② 聊天平台（可选）**：点「聊天平台」→ 点你用的那个 → 飞书、企业微信、钉钉、个人微信点「扫码一键接入」，屏幕上出现二维码，用手机扫一下、确认，完事。其他平台点「手动填写」，按提示把令牌粘进去。

**③ 后台网关（可选）**：点「后台网关」→「启动」，Karmen 就在后台待命；打开「开机自动运行」，以后开机就在。有人找它要配对时，配对请求也会出现在这一页，点「批准」即可。

其余几项：「多模型会商 MoA」勾选参考模型、点选聚合模型；「语言与显示」切换中文 / English、自动确认和侧栏；「教程」就是你正在看的这份。全部弄好后点「完成，开始使用」。

## 更喜欢一问一答？

运行 \`karmenbot setup\`，它会一步一步问你，输入编号回车即可，效果一样。

## 选模型时常见的小状况

1. 测试失败，提示 401：密钥复制少了一截，重新粘贴。
2. 提示 402 / 403：账户没余额或没开通这个模型，去厂商控制台看一眼。
3. 超时：公司网络拦了这个地址，换个网络试试。
`;
}

function tui(os) {
  const f = facts(os);
  return `
输入 \`karmenbot\` 回车。先是开屏：大号折光体缓缓呼吸，下面的框里五项逐个打勾。等不及就按任意键跳过——你按的键不会丢。

## 界面上都是什么

- **最上面一行**：KARMEN 标志、当前文件夹、正在用的模型、工作模式。
- **中间大块**：对话记录。你说的话有一条浅色底，Karmen 的回答前面有个 ◆。
- **右边侧栏**（窗口够宽才有）：会话信息、用量、写过哪些文件、用过哪些工具，底下的小折光体干活时会呼吸。
- **下面的框**：输入框。Karmen 干活时框会泛起流光。
- **最底一行**：状态、用量和按键提示。

## 交代一件事

在输入框里直接写，例如“帮我看看「合同」文件夹里的租赁合同，把付款时间整理成待办清单”，回车发送。换行不发送用 \`Ctrl+J\`。中文输入法照常用。

## 它要改文件或跑命令时

屏幕中间弹出确认框：绿色 + 号是新增的行，红色 - 号是删掉的行；跑命令时会写出命令原文。

- 同意：按 \`y\`，或用鼠标点「接受」/「允许」。
- 不同意：按 \`n\` 或 \`Esc\`，或点「拒绝」。
- 它问选择题时：用 \`↑\` \`↓\` 选、回车确认，或者直接用鼠标点选项。

> 按 n 不会惹它生气，它只会说“没有写入”，然后想别的办法。

## 斜杠命令

输入 \`/\` 弹出命令面板，\`Tab\` 补全、回车执行：

| 命令 | 作用 |
|------|------|
| /设置 | 打开设置中心（键盘鼠标就能配完一切） |
| /help | 全部命令和按键 |
| /learn | 五分钟快速上手 |
| /model | 看当前模型；/model 2 切换到第 2 个 |
| /moa on、/moa off | 开关多模型会商 |
| /mode | 切换工作模式 |
| /yes | 开关自动确认（只管文件和命令） |
| /new | 开始新会话 |
| /exit | 退出 |

## 按键小抄（${SYSTEMS[os].name}）

- 按词跳光标：${f.wordKeys}；行首行尾：\`Ctrl+A\` / \`Ctrl+E\`。
- 翻看历史：\`PgUp\` / \`PgDn\`。
- 叫停正在干的活：\`Esc\` 或 \`Ctrl+C\`；退出：空闲时连按两次 \`Ctrl+C\`。
- 设置中心和弹窗打开时鼠标用来点选；想复制屏幕上的字，${f.select}。
`;
}

function oneshot(os) {
  const f = facts(os);
  return `
## 直接交代

\`\`\`text
karmenbot "统计一下当前文件夹里每种文件有多少个"
\`\`\`

需要改文件时会在终端里问你 \`[y/N]\`，回车默认是“不”。

## 指定在哪个文件夹干活

\`\`\`text
${f.folder}
\`\`\`

## 把别的程序的输出交给它

\`\`\`text
${f.pipe}
\`\`\`

## 放进脚本里自动跑

- \`--yes\`：文件修改和命令自动同意（选择题和登录仍然会停下）。
- \`--json\`：每一步输出一行 JSON，方便别的程序读。
- 没有终端又没加 \`--yes\` 时，所有修改和命令一律拒绝——宁可少做，不可乱做。
${pick(os, {
  win: "- 想用“任务计划程序”定时跑：程序填 `karmenbot.cmd` 的完整路径（在 %USERPROFILE%\\.karmenbot\\bin 里），参数填 `--yes \"要办的事\"`。\n",
  mac: "- 想定时跑：可以用 `crontab -e` 加一行，例如每天 9 点：`0 9 * * * ~/.local/bin/karmenbot --yes \"整理下载文件夹\"`。\n",
  linux: "- 想定时跑：`crontab -e` 加一行，例如每天 9 点：`0 9 * * * ~/.local/bin/karmenbot --yes \"整理下载文件夹\"`。\n",
})}
> 定时任务里用 \`--yes\` 之前，先手动跑一遍，看看它都想干嘛。
`;
}

function moa() {
  return `
## 这是什么

MoA（Mixture of Agents）就是“开个小会”：几个**参考模型**先各自出主意（只动嘴、不动手），再由一个**聚合模型**取长补短，亲自动手干活。适合重要、复杂、容易翻车的事。

## 在设置中心里配（最省事）

前提是已经配了**至少两个**模型。点「多模型会商 MoA」：

1. 在「参考模型」里**勾选**两个左右（空格或鼠标点击打勾），选不同厂商的意见更多元。
2. 在「聚合模型」里**点选**一个你最信任的。
3. 「多久开一次会」选“每个用户回合一次”（省钱，推荐）。
4. 打开「开启 MoA」，点「保存」。

## 用命令配

\`karmenbot moa setup\`：参考模型输入编号、多个用逗号隔开（例如 \`1,2\`），聚合模型输入一个编号，频率回车选默认。

## 开和关

- 界面里：\`/moa on\`、\`/moa off\`；命令行：\`karmenbot moa on\`、\`karmenbot moa off\`。
- 临时用一次：\`karmenbot --moa "这件事帮我仔细想想"\`。

开会时状态栏会显示“MoA 参考 1/2”。

> 账单提醒：开会是要付会议费的。日常小事一个模型就够了，大事再请专家团。
`;
}

function connect() {
  return `
最省事的办法：在设置中心点「聊天平台」，点你用的那个。也可以运行 \`karmenbot connect\` 一问一答。接好后在「后台网关」点「启动」（或运行 \`karmenbot gateway start\`）。

## 飞书 / 企业微信 / 钉钉（扫码一键接入）

点「扫码一键接入」，屏幕上出现二维码，用对应的手机 App 扫一扫，按手机上的提示确认创建机器人。飞书扫码的那个人会自动成为主人。

手动方式（点「手动填写」）：
- 飞书：开放平台建“企业自建应用”，添加机器人，事件订阅选“使用长连接接收事件”并订阅“接收消息”，开通发消息权限，发布版本；填 App ID、App Secret。
- 企业微信：管理后台 → 智能机器人 → API 模式选“长连接”；填 Bot ID、Secret。
- 钉钉：开放平台建应用 → 添加机器人 → 消息接收模式选“Stream 模式”；填 Client ID、Client Secret。

## 个人微信（扫码登录）

点「扫码一键接入」，用**微信扫一扫**，在手机上点确认。扫码的微信号自动成为主人。二维码几分钟会过期，过期了会自动换一个。

## Telegram / Slack / Discord / WhatsApp（填表）

- **Telegram**：找 \`@BotFather\` 发 \`/newbot\`，把令牌（像 \`123456:ABC...\`）粘进「Bot 令牌」。
- **Slack**：按页面提示用应用清单建应用，粘贴 App Token（\`xapp-\`）和 Bot Token（\`xoxb-\`）。
- **Discord**：开发者后台建应用 → Bot → 复制令牌并打开 MESSAGE CONTENT INTENT；保存后页面会给出邀请链接。
- **WhatsApp**：走 Meta Business Cloud API，需要企业号码、访问令牌和公网 HTTPS 回调地址；个人号暂不支持。

## 第一次在聊天里找它：配对

除了扫码自动认主的情况，第一次发消息会收到一个 8 位配对码。在设置中心「后台网关」页点「批准」，或运行 \`karmenbot pair approve 配对码\`。配对码 1 小时有效，陌生人拿到也没用——批准权在你电脑上。

## 在聊天里批准和拒绝

它想改文件会发来差异预览，想跑命令会把命令原文发来。回复 \`批准\`、\`是\`、\`好\`、\`y\` 表示同意；回复 \`拒绝\`、\`否\`、\`n\` 表示不同意。只认**整句就是这一个词**，所以“好的我再想想”不算同意。5 分钟不回复就当你拒绝了。

在群里要 **@ 它**才搭理。聊天里还能发 \`/new\`、\`/stop\`、\`/status\`、\`/help\`。
`;
}

function gateway(os) {
  const f = facts(os);
  return `
| 想做什么 | 设置中心 | 命令 |
|----------|----------|------|
| 后台运行 | 「后台网关」→「启动」 | karmenbot gateway start |
| 停下来 | 「停止」 | karmenbot gateway stop |
| 看状态 | 页面顶部就有 | karmenbot gateway status |
| 看日志 | — | karmenbot gateway logs |
| 开机自动运行 | 打开「开机自动运行」 | karmenbot gateway install |

${pick(os, {
  mac: "开机自动运行在 macOS 上是一个登录项（launchd），登录后自动在后台启动，不会弹窗口。\n\n想让它整夜在线：「系统设置」→「电池」（或「能量」）里打开“防止自动进入睡眠”。",
  win: "开机自动运行在 Windows 上是当前用户的启动项，不需要管理员权限；登录时可能有一个小黑窗一闪而过，那是它在后台就位。\n\n想让它整夜在线：「设置」→「系统」→「电源」里把“睡眠”改成“从不”。",
  linux: "开机自动运行在 Linux 上是一个 systemd 用户服务。想在你退出登录后它也继续跑，运行一次 `loginctl enable-linger $USER`。\n\n想让它整夜在线：在系统设置的电源里关闭自动挂起。",
})}

聊天里让它做的事，默认在 \`${f.workspace}\` 这个文件夹里进行，不会去翻你别的文件夹。想换地方：\`karmenbot gateway start -w 你的文件夹\`。
`;
}

function safety(os) {
  const f = facts(os);
  return `
- **钥匙放哪**：模型密钥和平台凭证都在 \`${f.config}\` 里的 secrets.json，${pick(os, { win: "只在你自己的用户目录里", unix: "权限只有你自己能读写" })}；界面和日志里只显示末四位。
- **它能看什么**：在界面里，它在你打开 karmenbot 的那个文件夹里工作；在聊天里，默认只在 \`${f.workspace}\` 里。
- **它能改什么**：每一次写文件、每一条命令都要你确认，除非你主动开了 \`/yes\` 或 \`--yes\`。
- **账号密码**：永远不会在聊天或终端里问你要。
- **模型输出**：回复里夹带的终端控制字符会被过滤掉，不能借机改你的屏幕。
- **配对**：只有你批准过的账号才能和它说话，随时可以撤销。
- **数据去哪**：对话内容只发给你自己配置的模型厂商和你接入的聊天平台，除此之外 Karmen 不上传任何东西。
`;
}

function faq(os) {
  return `
**问：提示“目前无法连接到 API”。**
答：查三样——网络、密钥、余额。设置中心「模型」里点「测试默认模型」，或运行 \`karmenbot model test\`：401 是密钥不对，402/403 多半是余额或权限，超时是网络。

**问：输入 karmenbot 提示找不到命令。**
答：${pick(os, {
    mac: "新开一个终端窗口；还不行运行 `export PATH=\"$HOME/.local/bin:$PATH\"`，并检查 ~/.zshrc 里有没有 “# karmenbot PATH” 那一行。",
    linux: "新开一个终端；还不行运行 `export PATH=\"$HOME/.local/bin:$PATH\"`，并检查 ~/.bashrc（或 ~/.profile）里有没有 “# karmenbot PATH” 那一行。",
    win: "关掉所有终端窗口再开一个新的；还不行就注销一次 Windows。",
  })}

**问：界面乱码、方块字、颜色发灰。**
答：${pick(os, {
    mac: "系统自带「终端」和 iTerm2 都没问题；如果改过终端字体，换回默认等宽字体。实在不行加 `--no-color`。",
    linux: "确认系统语言环境是 UTF-8（运行 `locale` 查看）；换 GNOME 终端或 Konsole。实在不行加 `--no-color`。",
    win: "用 Windows 终端打开（Windows 11 自带；Windows 10 可在应用商店免费安装）；老式黑窗口里先运行 `chcp 65001`。",
  })}

**问：鼠标点不动。**
答：${pick(os, {
    win: "老式黑窗口对鼠标支持有限，换 Windows 终端；或者直接用键盘：`↑` `↓` 选、回车确认、`Esc` 返回，所有设置都能完成。",
    unix: "个别终端默认把鼠标留给自己用，换一个主流终端，或者直接用键盘：`↑` `↓` 选、回车确认、`Esc` 返回。",
  })}

**问：二维码扫不出来。**
答：把终端窗口放大一些、字体别太小；或者用二维码下面那行链接，在手机上直接打开。

**问：聊天里发消息它不理我。**
答：看看设置中心「后台网关」是不是“运行中”；群里记得 @ 它；第一次找它要先配对。

**问：想彻底卸载。**
答：\`karmenbot uninstall\` 删除程序、保留配置；\`karmenbot uninstall --all\` 连配置和密钥一起删。${pick(os, {
    win: "Windows 上还会顺手把它从你的用户 PATH 里移除。",
    mac: "然后可以把 ~/.zshrc 里 “# karmenbot PATH” 那两行删掉。",
    linux: "然后可以把 ~/.bashrc 里 “# karmenbot PATH” 那两行删掉。",
  })}

**问：它会不会把我电脑搞坏？**
答：它每次动手前都会问你，你不点头它什么都不改。真要搞坏，那得是你连按了好几次 y——所以看清楚再按。
`;
}

function cheatsheet(os) {
  return `
| 想做什么 | 输入 |
|----------|------|
| 打开界面 | karmenbot |
| 打开设置中心 | /设置（界面里）或 karmenbot settings |
| 直接办一件事 | karmenbot "要办的事" |
| 看这份教程 | karmenbot 教程 |
| 看别的系统的教程 | karmenbot 教程 --os ${os === "win" ? "mac" : "win"} |
| 一问一答配置 | karmenbot setup |
| 测试模型连接 | karmenbot model test |
| 接入聊天平台 | karmenbot connect 飞书 |
| 后台运行网关 | karmenbot gateway start |
| 批准配对 | karmenbot pair approve 配对码 |
| 体检 | karmenbot doctor |
| 卸载 | karmenbot uninstall |

> 到这里，安装、设置、确认和接入都走过一遍。其余按键见界面里的 \`/help\`。
`;
}

const BUILDERS = [
  { id: "hello", title: () => "认识 Karmen", body: () => `
## 它是谁

Karmen 是 KARMEN 在终端里的全屏界面。你用中文写出要办的事，它在这台电脑上读文件、写文档、整理资料、改代码、跑脚本，然后把结果放在屏幕上。

三种用法：**全屏界面**（输入 \`karmenbot\`）、**一行命令**（\`karmenbot "要办的事"\`）、**已接入的聊天软件**（飞书、企业微信、微信、钉钉、Telegram、Slack、Discord、WhatsApp）。

## 它的三条规矩

1. **读可以，写要问**：看文件它自己来；改文件、跑命令一定先给你看清楚，你点头才动手。
2. **不碰密码**：需要登录时只会说“请你自己登录”，绝不收集账号密码。
3. **只听主人的**：陌生人找它只会拿到配对码，你批准了才算数。

> 一句话总结：它很勤快，但很有分寸。
` },
  { id: "install", title: (os) => `安装（${SYSTEMS[os].name}）`, body: install },
  { id: "settings", title: () => "设置中心：键盘鼠标就能配完", body: settings },
  { id: "tui", title: () => "第一次对话：全屏界面", body: tui },
  { id: "oneshot", title: () => "不开界面：一行命令办事", body: oneshot },
  { id: "moa", title: () => "多模型会商：MoA", body: moa },
  { id: "connect", title: () => "把 Karmen 装进手机：聊天平台", body: connect },
  { id: "gateway", title: () => "让它一直在线：后台网关", body: gateway },
  { id: "safety", title: () => "安全与隐私", body: safety },
  { id: "faq", title: () => "疑难杂症", body: faq },
  { id: "cheatsheet", title: () => "命令速查表", body: cheatsheet },
];

export function chaptersFor(os = currentSystem()) {
  return BUILDERS.map((chapter) => ({ id: chapter.id, title: chapter.title(os), body: chapter.body(os) }));
}

export const CHAPTERS = chaptersFor();

export function chapterMarkdown(chapter, index) {
  return `# 第 ${index + 1} 章 · ${chapter.title}\n${chapter.body}`;
}

export function fullMarkdown(os = currentSystem()) {
  const chapters = chaptersFor(os);
  const toc = chapters.map((chapter, i) => `${i + 1}. ${chapter.title}`).join("\n");
  return `# Karmen 使用教程 · ${SYSTEMS[os].name} 版\n\n> 一句话进来，一件事办妥。这份教程专门按 ${SYSTEMS[os].name} 讲，每一步怎么按、怎么选都写清楚了。\n\n## 目录\n\n${toc}\n\n${chapters.map(chapterMarkdown).join("\n")}`;
}

export function indexMarkdown() {
  return `# Karmen 使用教程\n\n每个系统的命令、按键和路径都不一样，请看你的那一份：\n\n${Object.values(SYSTEMS).map((system) => `- [${system.name}](./${system.file})`).join("\n")}\n\n在终端里也能看：\`karmenbot 教程\`（自动按你的系统讲），或 \`karmenbot 教程 --os win\` / \`--os mac\` / \`--os linux\`。\n`;
}
