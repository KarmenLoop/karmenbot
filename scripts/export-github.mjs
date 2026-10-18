#!/usr/bin/env node
// Writes the open-source part of karmenbot into a clean folder, ready to become
// the GitHub repository. The Koder kernel (vendor/) stays out, and the export is
// refused if any kernel source line, credential or local path slipped into it.
// Nothing is committed or pushed.
//   node scripts/export-github.mjs [--out ../karmenbot-github]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = process.argv.indexOf("--out");
const out = path.resolve(index > 0 ? process.argv[index + 1] : path.join(pkg, "..", "karmenbot-github"));

export const OPEN = ["bin", "src", "docs", "test", "install", "scripts", "package.json", "README.md", "LICENSE", "LICENSE-EXCEPTION.md", "KERNEL-LICENSE.md", "THIRD_PARTY_NOTICES.md", "site.json"];
// Internal-only: the kernel sync tool names private source locations.
const PRIVATE = new Set(["scripts/sync-kernel.mjs"]);
const GITIGNORE = "vendor/\ndist/\nnode_modules/\n.DS_Store\n";

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

// Fingerprints of the kernel: every run of three consecutive code lines, and
// every long line. Finding one in the export means kernel code was copied;
// single short idioms (`new AbortController()`) are not counted.
const codeLines = (text) => text.split("\n").map((line) => line.trim()).filter((line) => line.length >= 4);
const runs = (lines) => lines.slice(0, -2).map((_, i) => lines.slice(i, i + 3).join("\n"));

// Overlaps reviewed by hand: reading the kernel's event stream is written the
// same way in the kernel's own printer. Exact text only; anything new is refused.
const REVIEWED = new Set([
  "return;\nif (event.type === \"message\") {\nconst message = event.message;",
  "if (event.type === \"message\") {\nconst message = event.message;\nif (message.role === \"assistant\") {",
]);

export function kernelPrints(root) {
  const prints = { runs: new Set(), long: new Set() };
  const vendor = path.join(root, "vendor");
  if (!fs.existsSync(vendor)) return prints;
  for (const file of walk(vendor)) {
    const lines = codeLines(fs.readFileSync(file, "utf8"));
    for (const run of runs(lines)) if (!REVIEWED.has(run)) prints.runs.add(run);
    for (const line of lines) if (line.length >= 80) prints.long.add(line);
  }
  return prints;
}

const SECRET = /(sk-[A-Za-z0-9]{20,}|xox[bpa]-[0-9A-Za-z-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16})/;
const LOCAL_PATH = /\/Users\/(?!me\b)[A-Za-z0-9._-]+\/|[A-Z]:\\Users\\(?!you\b|a\b|O'Neil\b)[A-Za-z0-9._-]+\\/;

export function audit(root, kernel = kernelPrints(pkg)) {
  const problems = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (rel === "vendor" || rel.startsWith("vendor/")) problems.push(`${rel}: kernel file`);
    if (PRIVATE.has(rel)) problems.push(`${rel}: internal tool`);
    const text = fs.readFileSync(file, "utf8");
    const copied = runs(codeLines(text)).filter((run) => kernel.runs.has(run)).length;
    if (copied) problems.push(`${rel}: ${copied} run(s) of kernel source lines`);
    text.split("\n").forEach((line, i) => {
      if (kernel.long.has(line.trim())) problems.push(`${rel}:${i + 1}: kernel source line`);
      if (SECRET.test(line)) problems.push(`${rel}:${i + 1}: looks like a credential`);
      if (LOCAL_PATH.test(line)) problems.push(`${rel}:${i + 1}: local user path`);
    });
  }
  return problems;
}

export function exportTo(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const item of OPEN) {
    fs.cpSync(path.join(pkg, item), path.join(target, item), {
      recursive: true,
      filter: (src) => !PRIVATE.has(path.relative(pkg, src).split(path.sep).join("/")) && path.basename(src) !== ".DS_Store",
    });
  }
  fs.writeFileSync(path.join(target, ".gitignore"), GITIGNORE);
  return audit(target);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = exportTo(out);
  if (problems.length) {
    fs.rmSync(out, { recursive: true, force: true });
    console.error(`export refused, nothing written:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`open-source tree written to ${out} (${walk(out).length} files, no kernel). Not committed, not pushed.`);
}
