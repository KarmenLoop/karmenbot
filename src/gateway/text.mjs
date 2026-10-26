// Outbound chunking and approval words for chat platforms.

// Split at a newline, else a space, else hard; a fenced code block cut in two
// is closed and reopened so each chunk renders on its own. Multi-part
// messages end with (i/n).
export function chunkText(text, limit) {
  const body = String(text ?? "").trim();
  if (!body) return [];
  if (body.length <= limit) return [body];
  const room = limit - 10;
  const parts = [];
  let rest = body;
  let reopen = "";
  while (rest.length) {
    const head = reopen ? `${reopen}\n` : "";
    const budget = Math.max(1, room - head.length - 4);
    if (rest.length <= budget + 4) {
      parts.push(head + rest);
      break;
    }
    const window = rest.slice(0, budget);
    let cut = window.lastIndexOf("\n");
    if (cut < budget * 0.5) cut = window.lastIndexOf(" ");
    if (cut < budget * 0.3) cut = budget;
    let piece = head + rest.slice(0, cut);
    rest = rest.slice(cut).replace(/^[\n ]/, "");
    const fences = piece.match(/^\s*```.*$/gm) || [];
    if (fences.length % 2 === 1) {
      reopen = fences[fences.length - 1].trim();
      piece += "\n```";
    } else {
      reopen = "";
    }
    parts.push(piece);
  }
  return parts.length > 1 ? parts.map((part, index) => `${part}\n(${index + 1}/${parts.length})`) : parts;
}

const APPROVE = new Set(["y", "yes", "ok", "okay", "approve", "confirm", "allow", "/approve", "/yes", "是", "好", "好的", "批准", "确认", "同意", "可以", "允许", "👍"]);
const DENY = new Set(["n", "no", "deny", "reject", "cancel", "/deny", "/no", "否", "不", "不行", "拒绝", "取消", "不要", "👎"]);

// "approve" | "deny" | null — only the exact word counts, so a long message
// that happens to contain "ok" is never taken as consent.
export function readVerdict(text) {
  const word = String(text ?? "").trim().toLowerCase().replace(/[。.!！]+$/, "");
  if (APPROVE.has(word)) return "approve";
  if (DENY.has(word)) return "deny";
  return null;
}

export function readChoice(text, count) {
  const value = Number(String(text ?? "").trim());
  return Number.isInteger(value) && value >= 1 && value <= count ? value - 1 : null;
}

const SEND = new Set(["send", "/send", "发送", "发出", "发出去", "发吧"]);

/** Draft-then-send confirm: approve words plus send/发送. */
export function readSendVerdict(text) {
  const word = String(text ?? "").trim().toLowerCase().replace(/[。.!！]+$/, "");
  if (SEND.has(word)) return "approve";
  return readVerdict(text);
}

// Longer Chinese prefixes first so 「修改」 is not eaten by 「改」.
const REPLACE_ZH_RE = /^(?:修改|编辑|改)\s*[:：]?\s*([\s\S]+)$/;
// English needs a space or colon after edit so "editor …" is never an edit.
const REPLACE_EN_RE = /^(?:\/edit|edit)\s*[:：]\s*([\s\S]+)$/i;
const REPLACE_EN_SPACE_RE = /^(?:\/edit|edit)\s+([\s\S]+)$/i;
const APPEND_RE = /^(?:\+|追加)\s+([\s\S]+)$/;

/**
 * Draft card reply: send | deny | replace | append.
 * Returns { action, body? } or null when the reply is not a draft action.
 */
export function readDraftAction(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  let match = raw.match(APPEND_RE);
  if (match) {
    const body = match[1].trim();
    return body ? { action: "append", body } : null;
  }

  match = raw.match(REPLACE_ZH_RE) || raw.match(REPLACE_EN_RE) || raw.match(REPLACE_EN_SPACE_RE);
  if (match) {
    const body = match[1].trim();
    return body ? { action: "replace", body } : null;
  }

  const verdict = readSendVerdict(raw);
  if (verdict === "approve") return { action: "send" };
  if (verdict === "deny") return { action: "deny" };
  return null;
}
