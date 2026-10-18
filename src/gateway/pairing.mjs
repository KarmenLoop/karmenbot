import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { karmenHome } from "../home.mjs";

// Who may talk to Karmen, per platform. After Hermes' gateway/pairing.py (MIT):
// unknown senders get a one-time code; the owner approves it on this computer.
//   ~/.karmenbot/pairing/<platform>.json  { approved: {userId: {name, at}}, pending: [{code, userId, name, at}] }
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_TTL_MS = 60 * 60 * 1000;
const MAX_PENDING = 3;
const REQUEST_GAP_MS = 10 * 60 * 1000;

function file(env, platform) {
  return path.join(karmenHome(env), "pairing", `${platform}.json`);
}

function read(env, platform) {
  try {
    const value = JSON.parse(fs.readFileSync(file(env, platform), "utf8"));
    return { approved: value.approved || {}, pending: Array.isArray(value.pending) ? value.pending : [] };
  } catch {
    return { approved: {}, pending: [] };
  }
}

function write(env, platform, value) {
  const target = file(env, platform);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, target);
}

export function newCode() {
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function createPairing({ env = process.env, now = Date.now } = {}) {
  const fresh = (state) => {
    state.pending = state.pending.filter((item) => now() - item.at < CODE_TTL_MS);
    return state;
  };
  return {
    isApproved(platform, userId) {
      return Boolean(read(env, platform).approved[userId]);
    },
    approve(platform, userId, name = "") {
      const state = read(env, platform);
      state.approved[userId] = { name, at: now() };
      state.pending = state.pending.filter((item) => item.userId !== userId);
      write(env, platform, state);
    },
    // Returns { code, fresh } or null when this sender must wait (rate limit / too many pending).
    request(platform, userId, name = "") {
      const state = fresh(read(env, platform));
      const existing = state.pending.find((item) => item.userId === userId);
      if (existing) {
        if (now() - (existing.notified || existing.at) < REQUEST_GAP_MS) return { code: existing.code, fresh: false };
        existing.notified = now();
        write(env, platform, state);
        return { code: existing.code, fresh: true };
      }
      if (state.pending.length >= MAX_PENDING) return null;
      const code = newCode();
      state.pending.push({ code, userId, name, at: now(), notified: now() });
      write(env, platform, state);
      return { code, fresh: true };
    },
    // Approve by code across all platforms; returns { platform, userId, name } or null.
    approveCode(code, platforms) {
      const wanted = String(code || "").trim().toUpperCase();
      for (const platform of platforms) {
        const state = fresh(read(env, platform));
        const match = state.pending.find((item) => item.code === wanted);
        if (!match) continue;
        state.approved[match.userId] = { name: match.name, at: now() };
        state.pending = state.pending.filter((item) => item !== match);
        write(env, platform, state);
        return { platform, userId: match.userId, name: match.name };
      }
      return null;
    },
    revoke(platform, userId) {
      const state = read(env, platform);
      if (!state.approved[userId]) return false;
      delete state.approved[userId];
      write(env, platform, state);
      return true;
    },
    list(platforms) {
      return platforms.map((platform) => ({ platform, ...fresh(read(env, platform)) }));
    },
  };
}
