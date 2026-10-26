import { chunkText } from "./text.mjs";
import {
  formatFollowupOutbound,
  selectDueFollowups,
  updateFollowup,
} from "./followups.mjs";

/**
 * Process due follow-ups.
 * Quiet-hours / rate-limit skips stay **pending** so a later tick can deliver.
 * `send` is async (platform, chatId, text) => void — inject in tests.
 */
export async function tickFollowups({
  env = process.env,
  now = Date.now(),
  send,
  dryRun = false,
} = {}) {
  if (typeof send !== "function") throw new Error("send function required");
  const { due, skipped, cfg } = selectDueFollowups(env, now);
  const results = [];

  for (const row of skipped) {
    results.push({ id: row.id, status: "deferred", reason: row.reason });
  }

  for (const item of due) {
    const text = formatFollowupOutbound(item, cfg);
    if (dryRun) {
      results.push({ id: item.id, status: "dry-run", text });
      continue;
    }
    try {
      for (const part of chunkText(text, 3500)) {
        await send(item.platform, item.chatId, part);
      }
      updateFollowup(item.id, { status: "sent", sentAt: now, skipReason: null }, env);
      results.push({
        id: item.id,
        status: "sent",
        draft: item.requireConfirm !== false || cfg.draftThenSend !== false,
      });
    } catch (error) {
      results.push({ id: item.id, status: "error", reason: error?.message || String(error) });
    }
  }
  return { results, cfg };
}
