import { isDue } from "./cron.mjs";
import { listRoutines } from "./store.mjs";
import { executeRoutine } from "./execute.mjs";

/**
 * Run every enabled, due routine that passes the unattended safety gate.
 * Intended for user crontab / launchd / systemd: `karmenbot routine tick`
 */
export async function tickRoutines(ctx, { now = Date.now() } = {}) {
  const results = [];
  for (const routine of listRoutines(ctx.env)) {
    if (routine.enabled === false) {
      results.push({ id: routine.id, skipped: true, reason: "paused" });
      continue;
    }
    if (!isDue(routine, now)) {
      results.push({ id: routine.id, skipped: true, reason: "not due" });
      continue;
    }
    const outcome = await executeRoutine(ctx, routine, { force: false, now });
    results.push({ id: routine.id, ...outcome });
  }
  return results;
}
