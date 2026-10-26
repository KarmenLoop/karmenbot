const ZH = `karmenbot {version}

用法
  karmenbot                       打开全屏界面（折光体开屏、对话、确认弹窗）
  karmenbot run "任务"             不开界面，直接办事（脚本、管道、CI 也能用）
  karmenbot ask "问题"             只读：不改文件、不跑命令
  karmenbot review                 看 git diff，写出审查，不改文件
  karmenbot fix --command "npm test"   检查失败就改，最多三次
  karmenbot test <文件> --command "npm test"   按仓库现有风格补测试
  karmenbot flow 步骤.json          按 JSON 依次 ask / run / shell
  karmenbot ci init                写入 GitHub Actions 审查工作流
  karmenbot memory show|search|add|remove|clear|forget
  karmenbot memory profile|journal|status|propose   全局画像 / 日记 / 状态
  karmenbot skill list|show|install|run|scan|on|off
  karmenbot editor zed|nvim|emacs  打印编辑器接入片段（配合 karmenbot acp）
  karmenbot model presets|set|context|list|add|use|test
  karmenbot settings               设置中心（也可以输入 karmenbot 设置）：方向键或鼠标点选，配好模型、平台、网关
  karmenbot update                 官网信息与检查更新（界面里输入 /官网）
  karmenbot setup                  一问一答式配置（输入编号回车），效果和设置中心一样
  karmenbot 教程 [--os mac|win|linux]   全中文教程，自动按你的系统讲：从安装讲到毕业

模型
  karmenbot model list|add|use <id>|remove <id>|test [id]
  karmenbot moa [status|setup|on|off]         多模型协作：参考模型出主意，聚合模型汇总执行

聊天平台（飞书、企业微信、微信、钉钉、Telegram、Slack、Discord、WhatsApp）
  karmenbot connect [平台]          按向导接入；不写平台则列出全部
  karmenbot connect mcp|playwright  接入 MCP / Playwright 浏览器
  karmenbot mcp list|add|remove|test|doctor|presets
  karmenbot gateway run|start|stop|status|logs   前台运行 / 后台常驻 / 停止 / 状态 / 日志
  karmenbot pair list|approve <配对码>|revoke <账号>   管理谁能和 Karmen 说话

其他
  karmenbot doctor                 体检：运行环境、内核、模型、平台
  karmenbot uninstall [--all]      卸载（--all 连同配置和密钥）
  karmenbot version

常用参数
  -w, --workspace <目录>   工作区（默认当前目录）     -m, --mode <模式>   standard|code|plan|report…
  -y, --yes                自动确认文件修改和命令       --moa / --no-moa    临时开关 MoA
  --lang zh|en             界面语言                     --model-file <json> 临时指定模型
  --json                   karmenbot "任务" 输出逐行 JSON

配置保存在 ~/.karmenbot（KARMENBOT_HOME 可改），密钥文件权限 600。`;

const EN = `karmenbot {version}

Usage
  karmenbot                       open the full-screen interface
  karmenbot run "task"            do the work without the screen
  karmenbot ask "question"        read only: no edits, no commands
  karmenbot review                 review the git diff and write nothing
  karmenbot fix --command "npm test"
  karmenbot test <file> --command "npm test"
  karmenbot flow steps.json        ask / run / shell steps
  karmenbot ci init                GitHub Actions review workflow
  karmenbot memory show|search|add|remove|clear|forget
  karmenbot memory profile|journal|status|propose   global profile / journal / status
  karmenbot skill list|show|install|run|scan|on|off
  karmenbot editor zed|nvim|emacs  editor snippets for karmenbot acp
  karmenbot model presets|set|context|list|add|use|test
  karmenbot settings              settings centre: arrows or mouse for models, chat apps, gateway
  karmenbot update                official site and update check
  karmenbot setup                 the same as questions and answers
  karmenbot learn [--os mac|win|linux]   the full tutorial (Chinese), for your system

Models
  karmenbot model list|add|use <id>|remove <id>|test [id]
  karmenbot moa [status|setup|on|off]         Mixture of Agents: references advise, the aggregator acts

Chat platforms (Feishu, WeCom, WeChat, DingTalk, Telegram, Slack, Discord, WhatsApp)
  karmenbot connect [platform]    guided setup; without a platform, lists them
  karmenbot connect mcp|playwright  MCP / Playwright browser tools
  karmenbot mcp list|add|remove|test|doctor|presets
  karmenbot gateway run|start|stop|status|logs
  karmenbot pair list|approve <code>|revoke <account>   who may talk to Karmen

Other
  karmenbot doctor                check runtime, kernel, models, platforms
  karmenbot uninstall [--all]     remove (with --all also config and keys)
  karmenbot version

Options
  -w, --workspace <dir>    workspace (default: current directory)   -m, --mode <mode>
  -y, --yes                auto-approve edits and commands            --moa / --no-moa
  --lang zh|en             interface language                         --model-file <json>
  --json                   line-delimited JSON for karmenbot "task"

Settings live in ~/.karmenbot (override with KARMENBOT_HOME); the key file is mode 600.`;

export async function run(ctx) {
  ctx.stdout.write(`${(ctx.t.lang === "en" ? EN : ZH).replace("{version}", ctx.version)}\n`);
  return 0;
}
