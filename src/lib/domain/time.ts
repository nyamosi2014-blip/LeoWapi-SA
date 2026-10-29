import { market } from "@/config/market";

/** Wall-clock parts in the market's time zone (Africa/Johannesburg, no DST). */
export type LocalNow = {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** minutes since local midnight */
  minutes: number;
};

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: market.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localNow(at: Date = new Date()): LocalNow {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    day: WEEKDAY[p.weekday],
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** "21:30" → 1290 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "21:30" → "9:30 PM" */
export function format12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Calendar date arithmetic on YYYY-MM-DD strings (time-zone free). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD date. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
