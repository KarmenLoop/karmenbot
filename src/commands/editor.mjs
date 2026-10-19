const SNIPPETS = {
  zed: {
    file: "~/.config/zed/settings.json",
    win: "%APPDATA%\\Zed\\settings.json",
    note: "Add this to settings.json. In Zed's Agent panel, pick Karmen.",
    code: `{
  "agent_servers": {
    "Karmen": {
      "type": "custom",
      "command": "COMMAND",
      "args": ["acp"]
    }
  }
}`,
  },
  nvim: {
    file: "~/.config/nvim/lua/plugins/codecompanion.lua",
    win: "%LOCALAPPDATA%\\nvim\\lua\\plugins\\codecompanion.lua",
    note: "Requires CodeCompanion.nvim. :CodeCompanionChat then uses Karmen.",
    code: `require("codecompanion").setup({
  adapters = { acp = { karmen = function()
    return { name = "karmen", formatted_name = "Karmen", type = "acp",
      commands = { default = { "COMMAND", "acp" } } }
  end } },
  interactions = { chat = { adapter = "karmen" } },
})`,
  },
  emacs: {
    file: "~/.emacs.d/init.el",
    win: "%APPDATA%\\.emacs.d\\init.el",
    note: "Requires agent-shell from MELPA. M-x agent-shell, then pick Karmen.",
    code: `(add-to-list 'agent-shell-agent-configs
  (agent-shell-make-agent-config :identifier 'karmen :mode-line-name "Karmen"
    :client-maker (lambda (buffer) (acp-make-client :command "COMMAND" :command-params '("acp")))))`,
  },
};

const ALIASES = { neovim: "nvim", vim: "nvim", codecompanion: "nvim", "agent-shell": "emacs" };

export async function run(ctx) {
  const wanted = ALIASES[ctx.args[0]] || ctx.args[0];
  const names = wanted ? [wanted] : Object.keys(SNIPPETS);
  if (names.some((name) => !SNIPPETS[name])) {
    ctx.stderr.write("karmenbot editor zed|nvim|emacs\n");
    return 2;
  }
  const windows = (ctx.opts.os || ctx.io.platform || process.platform) === "win32" || ctx.opts.os === "windows";
  const command = windows ? "karmenbot.cmd" : "karmenbot";
  for (const name of names) {
    const item = SNIPPETS[name];
    ctx.stdout.write(`# ${name} · ${windows ? item.win : item.file}\n${item.note}\n\n${item.code.replaceAll("COMMAND", command)}\n\n`);
  }
  return 0;
}
