// Portable schedule helpers for routines.
// Supports classic 5-field cron (min hour dom month dow) plus:
//   @hourly @daily @weekly @monthly
//   @every <n>m|h|d   (interval from last run / createdAt)

const NAMES = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
};

function parseField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(",")) {
    const stepMatch = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!stepMatch) throw new Error(`bad cron field: ${field}`);
    const [, range, stepRaw] = stepMatch;
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad cron step: ${field}`);
    let start;
    let end;
    if (range === "*") {
      start = min;
      end = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      start = a;
      end = b;
    } else {
      start = end = Number(range);
    }
    if (![start, end].every((n) => Number.isInteger(n) && n >= min && n <= max) || start > end) {
      throw new Error(`cron field out of range: ${field}`);
    }
    for (let n = start; n <= end; n += step) out.add(n);
  }
  return out;
}

export function normalizeSchedule(schedule) {
  const raw = String(schedule || "").trim().toLowerCase();
  if (!raw) throw new Error("schedule required");
  const every = /^@every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/.exec(raw);
  if (every) {
    const n = Number(every[1]);
    if (!Number.isInteger(n) || n < 1) throw new Error("bad @every interval");
    const unit = every[2][0];
    const ms = unit === "m" ? n * 60_000 : unit === "h" ? n * 3_600_000 : n * 86_400_000;
    return { kind: "every", everyMs: ms, label: `@every ${n}${unit}` };
  }
  const cronText = NAMES[raw] || String(schedule).trim();
  const parts = cronText.split(/\s+/);
  if (parts.length !== 5) throw new Error("cron must have 5 fields (min hour dom month dow)");
  const [minute, hour, dom, month, dow] = parts;
  return {
    kind: "cron",
    label: cronText,
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(month, 1, 12),
    dow: parseField(dow, 0, 6),
  };
}

function matchesCron(date, parsed) {
  return parsed.minute.has(date.getMinutes())
    && parsed.hour.has(date.getHours())
    && parsed.dom.has(date.getDate())
    && parsed.month.has(date.getMonth() + 1)
    && parsed.dow.has(date.getDay());
}

/** Next fire time strictly after `from` (Date or ms). Searches minute by minute up to ~400 days. */
export function nextRunAfter(schedule, from = Date.now()) {
  const parsed = typeof schedule === "string" ? normalizeSchedule(schedule) : schedule;
  const start = new Date(typeof from === "number" ? from : from.getTime());
  if (parsed.kind === "every") {
    return start.getTime() + parsed.everyMs;
  }
  const cursor = new Date(start.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = cursor.getTime() + 400 * 86_400_000;
  while (cursor.getTime() < limit) {
    if (matchesCron(cursor, parsed)) return cursor.getTime();
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  throw new Error("no next run within search window");
}

export function isDue(routine, now = Date.now()) {
  if (routine.enabled === false) return false;
  if (routine.nextRunAt == null) return true;
  return Number(routine.nextRunAt) <= now;
}
