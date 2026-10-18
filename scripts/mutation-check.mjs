#!/usr/bin/env node
// Plants one defect at a time in a throwaway copy and checks that the named
// test file goes red. A mutation that survives means a test is missing.
//   node scripts/mutation-check.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MUTATIONS = [
  ["G1 a sentence containing ok counts as approval", "src/gateway/text.mjs", "if (APPROVE.has(word)) return \"approve\";", "if (APPROVE.has(word) || /\\bok\\b/.test(word)) return \"approve\";", "test/gateway.test.mjs"],
  ["G2 anyone in the chat may approve", "src/gateway/core.mjs", "if (msg.userId !== chat.pending.userId) return;", "", "test/gateway.test.mjs"],
  ["G3 unpaired senders are served", "src/gateway/core.mjs", "if (!pairing.isApproved(platform, msg.userId)) {", "if (false) {", "test/gateway.test.mjs"],
  ["G4 group chatter without a mention is answered", "src/gateway/core.mjs", "if (msg.isGroup && groupPolicy === \"mention\" && !msg.mentioned) return;", "", "test/gateway.test.mjs"],
  ["M1 advisors receive the tools", "src/moa.mjs", "messages: prompt, tools: [], signal: combined", "messages: prompt, tools: [{ name: \"shell\" }], signal: combined", "test/moa-cli.test.mjs"],
  ["M2 advisors are asked on every step", "src/moa.mjs", "if (fanout === \"user_turn\" && cached?.key === key) advice = cached.advice;", "if (false) advice = cached.advice;", "test/moa-cli.test.mjs"],
  ["F1 sparse chunk check (Feishu out-of-order parts)", "src/gateway/platforms/feishu.mjs", "new Array(sum).fill(null)", "new Array(sum)", "test/platforms.test.mjs"],
  ["W1 WeCom never answers on the message req_id", "src/gateway/platforms/wecom.mjs", "const passive = unanswered.get(chatId);", "const passive = null;", "test/platforms.test.mjs"],
  ["I1 installer skips the archive checksum", "install/install.sh", "[ -n \"$WANT\" ] && [ \"$WANT\" = \"$(sha256 \"$TMP/$FILE\")\" ] || fail", "true || fail", "test/install.test.mjs"],
  ["T1 model output escapes reach the terminal", "src/tui/transcript.mjs", "streaming.text += sanitize(event.text);", "streaming.text += event.text;", "test/tui.test.mjs"],
  ["T2 the key that skips the intro is swallowed", "src/tui/app.mjs", "if (state.splash) maybeEndSplash(true);", "if (state.splash) {\n      maybeEndSplash(true);\n      return;\n    }", "test/tui.test.mjs"],
  ["D1 docs/教程-*.md drift from the terminal tutorial", "src/tutorial/chapters.mjs", "毕业了！剩下的就是把事情交给 Karmen", "毕业了！剩下的事情交给 Karmen", "test/tutorial.test.mjs"],
  ["O1 Windows users get the macOS tutorial", "src/tutorial/chapters.mjs", "if (platform === \"win32\") return \"win\";", "if (platform === \"win32\") return \"mac\";", "test/tutorial.test.mjs"],
  ["O2 uninstall breaks on a quote in the user name", "src/commands/uninstall.mjs", "dir.replace(/'/g, \"''\")", "dir", "test/tutorial.test.mjs"],
  ["S1 a pasted key is drawn in plain text", "src/tui/settings.mjs", "let shown = item.secret ? \"•\".repeat(Math.min([...item.value].length, room - 1)) : item.value;", "let shown = item.value;", "test/settings.test.mjs"],
  ["S2 one press deletes or revokes", "src/tui/settings.mjs", "if (item.confirm && armed !== id) {", "if (false) {", "test/settings.test.mjs"],
  ["S3 clicking a field jumps past it", "src/tui/settings.mjs", "if (built.items[hit.item].kind !== \"field\") activate(page, built, hit.item);", "activate(page, built, hit.item);", "test/settings.test.mjs"],
  ["S4 mouse reporting is left on after quitting", "src/tui/paint.mjs", "out.write(\"\\x1b[0m\\x1b[?1006l\\x1b[?1000l\\x1b[?2004l", "out.write(\"\\x1b[0m\\x1b[?2004l", "test/settings.test.mjs"],
  ["S5 the Accept button rejects", "src/tui/views.mjs", "decision: { accept: true } },", "decision: { accept: false } },", "test/settings.test.mjs"],
  ["S6 a model saved in settings waits for a restart", "src/tui/app.mjs", "if (kind === \"model\" || kind === \"moa\") reloadModel()", "if (false) reloadModel()", "test/settings.test.mjs"],
  ["K1 installer skips the kernel checksum", "install/install.sh", "[ -n \"$KWANT\" ] && [ \"$KWANT\" = \"$(sha256 \"$TMP/$KFILE\")\" ] || fail", "true || fail", "test/install.test.mjs"],
  ["K2 the open-source archive carries the kernel", "scripts/build-release.mjs", "const APP_FILES = [\"bin\", \"src\",", "const APP_FILES = [\"bin\", \"src\", \"vendor\",", "test/install.test.mjs"],
  ["K3 the GitHub export lets vendor/ through", "scripts/export-github.mjs", "export const OPEN = [\"bin\", \"src\",", "export const OPEN = [\"bin\", \"src\", \"vendor\",", "test/open-source.test.mjs"],
  ["K4 the export audit misses copied kernel code", "scripts/export-github.mjs", "if (copied) problems.push", "if (false) problems.push", "test/open-source.test.mjs"],
  ["K6 the export audit misses a copied long kernel line", "scripts/export-github.mjs", "if (kernel.long.has(line.trim()))", "if (false)", "test/open-source.test.mjs"],
  ["K5 fetch-kernel skips the checksum", "scripts/fetch-kernel.mjs", "if (sha(archive) !== kernel.sha256) fail(", "if (false) fail(", "test/open-source.test.mjs"],
  ["L1 installer runs under bash but not dash", "install/install.sh", "spin() {", "spin() { frames=(1 2 3);", "test/install.test.mjs"],
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-mutation-"));
let survived = 0;
try {
  for (const [name, file, from, to, testFile] of MUTATIONS) {
    const dir = path.join(root, "karmenbot-cli");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(pkg, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}evidence`) && !src.includes(`${path.sep}dist`) });
    const target = path.join(dir, file);
    const text = fs.readFileSync(target, "utf8");
    if (!text.includes(from)) {
      console.log(`${name}: NOT APPLIED (pattern missing)`);
      survived += 1;
      continue;
    }
    fs.writeFileSync(target, text.replace(from, to));
    const run = spawnSync(process.execPath, ["--test", "--test-timeout=30000", testFile], { cwd: dir, encoding: "utf8", timeout: 180_000 });
    const failed = [...run.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]).filter((title) => !title.startsWith("test/"));
    const caught = run.status !== 0;
    if (!caught) survived += 1;
    console.log(`${caught ? "CAUGHT  " : "SURVIVED"} ${name}`);
    for (const title of failed) console.log(`           ✗ ${title}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(survived ? `${survived} mutation(s) survived` : "every mutation was caught");
process.exit(survived ? 1 : 0);
