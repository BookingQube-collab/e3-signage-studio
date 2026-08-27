function uiTime(value: string): string {
  return (value || "00:00").slice(0, 5);
}

function partsInZone(ms: number, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map["year"]),
    month: Number(map["month"]),
    day: Number(map["day"]),
    hour: Number(map["hour"]),
    minute: Number(map["minute"]),
    second: Number(map["second"]),
  };
}

/** Interpret a wall-clock date/time in `timeZone` as a UTC millisecond instant. */
export function wallTimeToUtcMs(date: string, time: string, timeZone: string): number {
  if (typeof date !== "string" || typeof time !== "string") return Number.NaN;
  const tz = timeZone || "Asia/Qatar";
  try {
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute, second] = `${uiTime(time)}:00`.split(":").map(Number);
    const desired = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0);
    if (!Number.isFinite(desired)) return Number.NaN;
    let utc = desired;
    for (let i = 0; i < 4; i++) {
      const parts = partsInZone(utc, tz);
      const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      const delta = asIfUtc - desired;
      if (delta === 0) break;
      utc -= delta;
    }
    return Number.isFinite(utc) ? utc : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

export function wallTimeToIso(date: string, time: string, timeZone: string): string {
  try {
    return new Date(wallTimeToUtcMs(date, time, timeZone)).toISOString();
  } catch {
    return `${date}T${uiTime(time)}:00.000Z`;
  }
}
