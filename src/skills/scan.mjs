// Static safety scan for skill packs. Warn or block before install/run.

const BLOCK = [
  { id: "curl-pipe", re: /curl\s+[^\n|]*\|\s*(?:ba)?sh/i, message: "curl|bash (or sh) download-and-run" },
  { id: "wget-pipe", re: /wget\s+[^\n|]*\|\s*(?:ba)?sh/i, message: "wget|bash download-and-run" },
  { id: "hardcoded-secret", re: /(api[_-]?key|client[_-]?secret|authorization)\s*[:=]\s*['\"]?[a-z0-9_\-]{12,}/i, message: "hardcoded API key / secret" },
  { id: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: "embedded private key" },
  { id: "secrets-write", re: /secrets\.json|saveSecret\s*\(|KARMENBOT.*SECRET/i, message: "attempts to touch secrets store" },
  { id: "force-yes", re: /--yes\b|opts\.yes\s*=\s*true/i, message: "skill tries to force --yes / auto-approve" },
];

const WARN = [
  { id: "network-fetch", re: /\b(curl|wget|fetch\s*\(|http\.request|https\.request)\b/i, message: "network access (needs permissions.network)" },
  { id: "shell", re: /\b(child_process|execSync|spawnSync|exec\s*\(|spawn\s*\()\b/i, message: "shell/process spawn (needs permissions.shell)" },
  { id: "write", re: /\b(writeFileSync|appendFileSync|rmSync|unlinkSync|mkdirSync)\b/i, message: "filesystem write (needs permissions.write)" },
];

function scanText(text, source) {
  const findings = [];
  const body = String(text || "");
  for (const rule of BLOCK) {
    if (rule.re.test(body)) findings.push({ severity: "block", id: rule.id, message: rule.message, source });
  }
  for (const rule of WARN) {
    if (rule.re.test(body)) findings.push({ severity: "warn", id: rule.id, message: rule.message, source });
  }
  return findings;
}

/**
 * Scan skill sources. Returns { ok, blocked, warnings, findings }.
 * Undeclared network/shell/write warnings upgrade to block when permission missing.
 */
export function scanSkill({ manifest, markdown = "", scripts = [] } = {}) {
  const permissions = normalizePermissions(manifest?.permissions);
  const findings = [];
  findings.push(...scanText(markdown, "SKILL.md"));
  findings.push(...scanText(JSON.stringify(manifest || {}), "skill.json"));
  for (const script of scripts) {
    findings.push(...scanText(script.content || "", script.path || "script"));
  }

  const upgraded = findings.map((item) => {
    if (item.severity !== "warn") return item;
    if (item.id === "network-fetch" && !permissions.network) {
      return { ...item, severity: "block", message: `${item.message}; declare permissions.network` };
    }
    if (item.id === "shell" && !permissions.shell) {
      return { ...item, severity: "block", message: `${item.message}; declare permissions.shell` };
    }
    if (item.id === "write" && !permissions.write) {
      return { ...item, severity: "block", message: `${item.message}; declare permissions.write` };
    }
    return item;
  });

  const blocked = upgraded.filter((item) => item.severity === "block");
  const warnings = upgraded.filter((item) => item.severity === "warn");
  return {
    ok: blocked.length === 0,
    blocked,
    warnings,
    findings: upgraded,
    permissions,
  };
}

export function normalizePermissions(raw = {}) {
  return {
    network: raw?.network === true,
    shell: raw?.shell === true,
    write: raw?.write === true,
  };
}
