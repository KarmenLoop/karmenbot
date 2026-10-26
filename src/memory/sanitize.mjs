// Never inject secrets. Strip common credential patterns from memory text.

const SECRET_LINE = /(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization\s*:|bearer\s+[a-z0-9._\-]+|sk-[a-z0-9]{10,}|xox[baprs]-[a-z0-9-]+|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
const PAIRING = /\bpair(?:ing)?\s*code\s*[:=]?\s*[a-z0-9]{6,}/i;

export function looksLikeSecret(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  // For single-line / short blobs, any match counts.
  if (!value.includes("\n")) {
    return SECRET_LINE.test(value) || PAIRING.test(value);
  }
  // Multi-line: only if every non-empty line is secret-like (or majority?).
  // Prefer line filtering via sanitizeMemoryText; here treat as secret if any line matches
  // and there is no other safe content — used by assertSafeToStore on store paths.
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  return lines.every((line) => SECRET_LINE.test(line) || PAIRING.test(line));
}

export function sanitizeMemoryText(text) {
  const value = String(text || "");
  if (!value) return "";
  return value
    .split("\n")
    .map((line) => (SECRET_LINE.test(line) || PAIRING.test(line) ? "" : line))
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

export function assertSafeToStore(text, en = false) {
  const value = String(text || "");
  // Refuse if any line looks like a secret (do not store mixed blobs either).
  if (value.split("\n").some((line) => SECRET_LINE.test(line) || PAIRING.test(line))) {
    const message = en
      ? "Refusing to store text that looks like an API key, token, or secret."
      : "内容看起来像 API 密钥/令牌，已拒绝写入记忆。";
    const error = new Error(message);
    error.code = "MEMORY_SECRET";
    throw error;
  }
}
