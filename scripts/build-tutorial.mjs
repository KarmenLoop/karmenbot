#!/usr/bin/env node
// Writes one tutorial per system to docs/ from the same chapters `karmenbot 教程`
// shows, so the documents and the terminal never disagree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEMS, fullMarkdown, indexMarkdown } from "../src/tutorial/chapters.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(pkg, "docs");
fs.mkdirSync(docs, { recursive: true });
const files = { "教程.md": indexMarkdown(), ...Object.fromEntries(Object.entries(SYSTEMS).map(([os, system]) => [system.file, fullMarkdown(os)])) };
for (const [name, text] of Object.entries(files)) {
  fs.writeFileSync(path.join(docs, name), `${text.trim()}\n`);
  console.log(`wrote docs/${name}`);
}
