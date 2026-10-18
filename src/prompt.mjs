import readline from "node:readline";

// Line prompts for the setup wizards. Answers can be scripted (tests, CI)
// by passing `answers`: each question consumes the next string.
export function createPrompter({ input = process.stdin, output = process.stdout, answers = null } = {}) {
  const queue = answers ? [...answers] : null;
  let rl = null;
  const line = () => {
    rl ??= readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    return rl;
  };

  async function ask(question, { fallback = "" } = {}) {
    if (queue) {
      output.write(question);
      const answer = queue.length ? queue.shift() : "";
      output.write(`${answer}\n`);
      return answer.trim() || fallback;
    }
    const answer = await new Promise((resolve) => line().question(question, resolve));
    return answer.trim() || fallback;
  }

  // No echo: the key never appears on screen or in scrollback.
  async function secret(question) {
    if (queue) {
      output.write(`${question}\n`);
      return (queue.shift() || "").trim();
    }
    if (!input.isTTY) return ask(question);
    rl?.close();
    rl = null;
    output.write(question);
    input.setRawMode(true);
    input.resume();
    return new Promise((resolve) => {
      let value = "";
      const done = (result) => {
        input.off("data", onData);
        input.setRawMode(false);
        input.pause();
        output.write("\n");
        resolve(result.trim());
      };
      const onData = (chunk) => {
        for (const ch of chunk.toString("utf8")) {
          if (ch === "\r" || ch === "\n") return done(value);
          if (ch === "\x03") return done("");
          if (ch === "\x7f" || ch === "\b") value = [...value].slice(0, -1).join("");
          else if (ch >= " ") value += ch;
        }
      };
      input.on("data", onData);
    });
  }

  async function choose(question, items, { fallback = 0, allowEmpty = false } = {}) {
    items.forEach((item, index) => output.write(`  ${String(index + 1).padStart(2)}. ${item}\n`));
    for (;;) {
      const answer = await ask(question);
      if (!answer && allowEmpty) return -1;
      if (!answer) return fallback;
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && index >= 0 && index < items.length) return index;
      if (queue) return -1;
    }
  }

  async function chooseMany(question, items) {
    items.forEach((item, index) => output.write(`  ${String(index + 1).padStart(2)}. ${item}\n`));
    const answer = await ask(question);
    return [...new Set(answer.split(/[,，\s]+/).map((part) => Number(part) - 1).filter((index) => Number.isInteger(index) && index >= 0 && index < items.length))];
  }

  async function confirm(question, fallback = true) {
    const answer = (await ask(question)).toLowerCase();
    if (!answer) return fallback;
    return ["y", "yes", "是", "好", "1"].includes(answer);
  }

  return {
    ask,
    secret,
    choose,
    chooseMany,
    confirm,
    print: (text = "") => output.write(`${text}\n`),
    close: () => rl?.close(),
  };
}
