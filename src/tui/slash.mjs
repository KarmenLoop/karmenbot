export const COMMANDS = [
  { name: "settings", aliases: ["设置", "设置中心", "配置"] },
  { name: "setup", aliases: ["向导", "初始化"] },
  { name: "connect", aliases: ["接入"], args: "<platform>" },
  { name: "memory", aliases: ["记忆"], args: "show|add|search" },
  { name: "about", aliases: ["官网", "关于", "更新"] },
  { name: "help", aliases: ["帮助", "?"] },
  { name: "learn", aliases: ["教程", "教学"] },
  { name: "lang", aliases: ["语言"], args: "zh|en" },
  { name: "mode", aliases: ["模式"], args: "<mode>" },
  { name: "moa", aliases: ["多模型"], args: "on|off" },
  { name: "yes", aliases: ["自动"] },
  { name: "new", aliases: ["新会话"] },
  { name: "clear", aliases: ["清屏"] },
  { name: "model", aliases: ["模型"] },
  { name: "sidebar", aliases: ["侧栏"] },
  { name: "banner", aliases: ["开屏"] },
  { name: "exit", aliases: ["quit", "退出"] },
];

export function parseSlash(text) {
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(String(text).trim());
  if (!match) return null;
  const word = match[1];
  const lowered = word.toLowerCase();
  const command = COMMANDS.find((item) => item.name === lowered || item.aliases.includes(word) || item.aliases.includes(lowered));
  return { word, name: command?.name || null, arg: match[2].trim() };
}

// Palette entries for what has been typed so far ("/mo" → mode, model).
export function matchSlash(text) {
  const match = /^\/(\S*)$/.exec(String(text));
  if (!match) return [];
  const typed = match[1].toLowerCase();
  return COMMANDS.filter((item) => item.name.startsWith(typed) || item.aliases.some((alias) => alias.startsWith(match[1])));
}
