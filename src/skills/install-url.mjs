import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { installSkillFromPath } from "./loader.mjs";

/**
 * Download a skill pack from https (zip or git tarball), scan, then install.
 * Only http(s) URLs; no git://. Temp dir cleaned after copy.
 */
export async function installSkillFromUrl(url, {
  env = process.env,
  force = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const href = String(url || "").trim();
  if (!/^https:\/\//i.test(href)) {
    throw Object.assign(new Error("only https:// URLs are allowed for skill install"), { code: "SKILL_URL_SCHEME" });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-"));
  try {
    const res = await fetchImpl(href, { redirect: "follow" });
    if (!res.ok) throw Object.assign(new Error(`download failed: HTTP ${res.status}`), { code: "SKILL_URL_HTTP" });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) throw Object.assign(new Error("download too large (>25MB)"), { code: "SKILL_URL_SIZE" });

    const lower = href.toLowerCase();
    let root;
    if (lower.includes(".tar.gz") || lower.includes("tarball") || lower.endsWith(".tgz")) {
      const archive = path.join(tmp, "pack.tgz");
      fs.writeFileSync(archive, buf);
      const extract = path.join(tmp, "extract");
      fs.mkdirSync(extract);
      const r = spawnSync("tar", ["-xzf", archive, "-C", extract], { encoding: "utf8" });
      if (r.status) throw Object.assign(new Error(r.stderr || "tar extract failed"), { code: "SKILL_URL_EXTRACT" });
      root = findSkillRoot(extract);
    } else {
      // zip (github archive/zipball or raw zip)
      const archive = path.join(tmp, "pack.zip");
      fs.writeFileSync(archive, buf);
      const extract = path.join(tmp, "extract");
      fs.mkdirSync(extract);
      const r = spawnSync("unzip", ["-q", archive, "-d", extract], { encoding: "utf8" });
      if (r.status) {
        const detail = (r.stderr || r.stdout || "unzip failed").trim();
        throw Object.assign(new Error(`unzip failed: ${detail}`), { code: "SKILL_URL_EXTRACT" });
      }
      root = findSkillRoot(extract);
    }
    if (!root) throw Object.assign(new Error("no skill.json found in archive"), { code: "SKILL_URL_NOSKILL" });
    return installSkillFromPath(root, { env, force });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function findSkillRoot(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (fs.existsSync(path.join(cur, "skill.json"))) return cur;
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
        stack.push(path.join(cur, entry.name));
      }
    }
  }
  return null;
}
