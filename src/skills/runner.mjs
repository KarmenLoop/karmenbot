import { spawn } from "node:child_process";
import fs from "node:fs";
import { loadConfig } from "../home.mjs";
import path from "node:path";
import { getSkill, isSkillEnabled } from "./loader.mjs";
import { scanSkill } from "./scan.mjs";


export function shouldAutoRunScripts(config = {}) {
  return Boolean(config?.skills?.autoRunScripts);
}

/**
 * Parse SKILL.md into ordered steps.
 * Supports:
 *   ## Steps
 *   1. text...
 *   - text...
 *   ```shell
 *   echo hi
 *   ```
 */
export function parseSteps(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const steps = [];
  let inSteps = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^##\s+steps\b/i.test(line)) {
      inSteps = true;
      i += 1;
      continue;
    }
    if (inSteps && /^##\s+/.test(line)) break;
    if (!inSteps) {
      i += 1;
      continue;
    }
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = (fence[1] || "").toLowerCase();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      const code = body.join("\n").trim();
      if (!code) continue;
      if (lang === "shell" || lang === "bash" || lang === "sh") {
        steps.push({ type: "shell", command: code, label: code.split("\n")[0].slice(0, 80) });
      } else if (lang === "write" || lang === "file") {
        const [header, ...rest] = body;
        const match = /^(?:path|file)\s*:\s*(.+)$/i.exec(String(header || "").trim());
        steps.push({
          type: "write",
          path: match ? match[1].trim() : String(header || "out.txt").trim(),
          content: (match ? rest : body).join("\n"),
          label: `write ${match ? match[1].trim() : header}`,
        });
      } else {
        steps.push({ type: "note", text: code, label: `code(${lang || "text"})` });
      }
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const text = (numbered || bullet)?.[1]?.trim();
    if (text) steps.push({ type: "note", text, label: text.slice(0, 80) });
    i += 1;
  }
  return steps;
}

async function runShell(command, { cwd, env, timeoutMs = 60_000 }) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\ntimeout`, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

/**
 * Execute a skill. Shell/write steps always go through decide().
 * Skills must NOT carry --yes; callers that pass yes still cannot skip
 * permissioned steps without an accepting decide (we ignore yes for skills).
 */
export async function runSkill(id, {
  workspace = process.cwd(),
  env = process.env,
  decide,
  onEvent = () => {},
  yes = false, // intentionally ignored for skill shell/write
} = {}) {
  void yes;
  const skill = getSkill(id, { env, workspace });
  if (!skill) throw Object.assign(new Error(`unknown skill: ${id}`), { code: "SKILL_UNKNOWN" });
  if (!isSkillEnabled(id, env)) throw Object.assign(new Error(`skill disabled: ${id}`), { code: "SKILL_DISABLED" });

  const scan = scanSkill({ manifest: skill.manifest, markdown: skill.markdown, scripts: skill.scripts });
  if (!scan.ok) {
    const error = new Error(`skill blocked: ${scan.blocked.map((item) => item.message).join("; ")}`);
    error.code = "SKILL_BLOCKED";
    error.findings = scan.findings;
    throw error;
  }

  const steps = parseSteps(skill.markdown);
  if (!steps.length) {
    return { ok: true, skill: skill.id, steps: [], results: [], note: "no steps section; nothing to run" };
  }

  const results = [];
  for (const [index, step] of steps.entries()) {
    onEvent({ type: "skill.step", index, step });
    if (step.type === "note") {
      results.push({ index, type: "note", ok: true, text: step.text });
      continue;
    }

    if (step.type === "shell") {
      if (!skill.permissions.shell) {
        results.push({ index, type: "shell", ok: false, denied: true, reason: "permissions.shell not declared" });
        return { ok: false, skill: skill.id, steps, results };
      }
      const pause = { kind: "approval", command: step.command, skill: skill.id, path: workspace };
      const decision = typeof decide === "function" ? await decide(pause) : { accept: false };
      onEvent({ type: "decision", pause, decision });
      if (!decision?.accept || decision.cancel) {
        results.push({ index, type: "shell", ok: false, denied: true });
        return { ok: false, skill: skill.id, steps, results };
      }
      const outcome = await runShell(step.command, { cwd: workspace, env: {} });
      results.push({ index, type: "shell", ...outcome });
      if (!outcome.ok) return { ok: false, skill: skill.id, steps, results };
      continue;
    }

    if (step.type === "write") {
      if (!skill.permissions.write) {
        results.push({ index, type: "write", ok: false, denied: true, reason: "permissions.write not declared" });
        return { ok: false, skill: skill.id, steps, results };
      }
      const target = path.resolve(workspace, step.path);
      // Stay inside workspace.
      if (!target.startsWith(path.resolve(workspace) + path.sep) && target !== path.resolve(workspace)) {
        results.push({ index, type: "write", ok: false, denied: true, reason: "path escapes workspace" });
        return { ok: false, skill: skill.id, steps, results };
      }
      let before = "";
      try {
        before = fs.readFileSync(target, "utf8");
      } catch { /* new file */ }
      const pause = { kind: "change", path: target, before, after: step.content, skill: skill.id };
      const decision = typeof decide === "function" ? await decide(pause) : { accept: false };
      onEvent({ type: "decision", pause, decision });
      if (!decision?.accept || decision.cancel) {
        results.push({ index, type: "write", ok: false, denied: true });
        return { ok: false, skill: skill.id, steps, results };
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, step.content, "utf8");
      results.push({ index, type: "write", ok: true, path: target });
      continue;
    }

    results.push({ index, type: step.type, ok: false, reason: "unsupported step" });
    return { ok: false, skill: skill.id, steps, results };
  }

  // Optional: run scripts/ after markdown steps when config.skills.autoRunScripts
  // is true AND permissions.shell is declared. Each script still goes through decide().
  const auto = shouldAutoRunScripts(loadConfig(env));
  if (auto && skill.permissions?.shell && Array.isArray(skill.scripts) && skill.scripts.length) {
    for (const script of skill.scripts) {
      const rel = typeof script === "string" ? script : script.path;
      if (!rel || !String(rel).startsWith("scripts/")) continue;
      const full = path.join(skill.dir, rel);
      const cmd = `bash ${JSON.stringify(full)}`;
      const pause = { kind: "approval", command: cmd, skill: skill.id, path: workspace, autoRunScript: true };
      const decision = typeof decide === "function" ? await decide(pause) : { accept: false };
      onEvent({ type: "decision", pause, decision });
      if (!decision?.accept || decision.cancel) {
        results.push({ type: "script", ok: false, denied: true, script: rel });
        return { ok: false, skill: skill.id, steps, results };
      }
      const outcome = await runShell(cmd, { cwd: workspace, env: {} });
      results.push({ type: "script", script: rel, ...outcome });
      if (!outcome.ok) return { ok: false, skill: skill.id, steps, results };
    }
  }

  return { ok: true, skill: skill.id, steps, results };
}
