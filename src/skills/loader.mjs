import fs from "node:fs";
import path from "node:path";
import { karmenHome, loadConfig, saveConfig } from "../home.mjs";
import { scanSkill, normalizePermissions } from "./scan.mjs";

export function globalSkillsDir(env = process.env) {
  return path.join(karmenHome(env), "skills");
}

export function workspaceSkillsDir(workspace) {
  return path.join(path.resolve(workspace || "."), ".karmenbot", "skills");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listSkillRoots(env, workspace) {
  return [
    { root: globalSkillsDir(env), scope: "global" },
    { root: workspaceSkillsDir(workspace), scope: "workspace" },
  ];
}

function loadOne(dir, scope) {
  const manifestPath = path.join(dir, "skill.json");
  const mdPath = path.join(dir, "SKILL.md");
  const manifest = readJson(manifestPath);
  if (!manifest || typeof manifest !== "object") return null;
  const id = String(manifest.id || path.basename(dir)).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(id)) return null;
  const markdown = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
  const scriptsDir = path.join(dir, "scripts");
  const scripts = [];
  if (fs.existsSync(scriptsDir)) {
    for (const name of fs.readdirSync(scriptsDir)) {
      const full = path.join(scriptsDir, name);
      if (!fs.statSync(full).isFile()) continue;
      if (!/\.(mjs|js|sh|py|ts)$/i.test(name)) continue;
      scripts.push({ path: `scripts/${name}`, content: fs.readFileSync(full, "utf8") });
    }
  }
  const permissions = normalizePermissions(manifest.permissions);
  const scan = scanSkill({ manifest, markdown, scripts });
  return {
    id,
    name: String(manifest.name || id),
    version: String(manifest.version || "0.0.0"),
    description: String(manifest.description || "").slice(0, 500),
    triggers: Array.isArray(manifest.triggers) ? manifest.triggers.map(String) : [],
    permissions,
    dir,
    scope,
    markdown,
    scripts,
    manifest,
    scan,
  };
}

export function discoverSkills({ env = process.env, workspace = process.cwd() } = {}) {
  const found = new Map();
  for (const { root, scope } of listSkillRoots(env, workspace)) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const skill = loadOne(dir, scope);
      if (!skill) continue;
      // Workspace overrides global when same id.
      found.set(skill.id, skill);
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function skillsConfig(env = process.env) {
  const raw = loadConfig(env).skills || {};
  return {
    disabled: Array.isArray(raw.disabled) ? raw.disabled.map(String) : [],
  };
}

export function isSkillEnabled(id, env = process.env) {
  return !skillsConfig(env).disabled.includes(id);
}

export function setSkillEnabled(id, enabled, env = process.env) {
  const conf = skillsConfig(env);
  const disabled = new Set(conf.disabled);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  saveConfig({ skills: { disabled: [...disabled] } }, env);
  return isSkillEnabled(id, env);
}

export function getSkill(id, opts) {
  return discoverSkills(opts).find((skill) => skill.id === id) || null;
}

export function enabledSkillSummaries(opts) {
  return discoverSkills(opts)
    .filter((skill) => isSkillEnabled(skill.id, opts.env) && skill.scan.ok)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description || skill.markdown.split("\n").find((line) => line.trim() && !line.startsWith("#")) || "",
      triggers: skill.triggers,
      permissions: skill.permissions,
    }));
}

/**
 * Install by copying a local directory into ~/.karmenbot/skills/<id>.
 * URL installs are limited to confirmed local paths in Wave3 (no silent download).
 */
export function installSkillFromPath(sourcePath, { env = process.env, force = false } = {}) {
  const src = path.resolve(sourcePath);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    throw Object.assign(new Error(`skill path not found: ${src}`), { code: "SKILL_NOT_FOUND" });
  }
  const skill = loadOne(src, "incoming");
  if (!skill) throw Object.assign(new Error("invalid skill.json"), { code: "SKILL_INVALID" });
  if (!skill.scan.ok) {
    const error = new Error(`skill blocked by scanner: ${skill.scan.blocked.map((item) => item.message).join("; ")}`);
    error.code = "SKILL_BLOCKED";
    error.findings = skill.scan.findings;
    throw error;
  }
  const dest = path.join(globalSkillsDir(env), skill.id);
  if (fs.existsSync(dest) && !force) {
    throw Object.assign(new Error(`skill already installed: ${skill.id} (pass force to replace)`), { code: "SKILL_EXISTS" });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return loadOne(dest, "global");
}

export function uninstallSkill(id, env = process.env) {
  const dest = path.join(globalSkillsDir(env), id);
  if (!fs.existsSync(dest)) return false;
  fs.rmSync(dest, { recursive: true, force: true });
  setSkillEnabled(id, true, env); // drop from disabled list
  return true;
}
