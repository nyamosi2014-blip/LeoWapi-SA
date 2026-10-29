import { format12h, localNow, toMinutes, type LocalNow } from "./time";

/**
 * Opening hours engine, ported from the prototype's hrsNow()/hrsLines().
 * A range whose close is at or before its open runs past midnight
 * (["22:00", "04:00"] on Saturday is open until 4 AM on Sunday).
 */
export type Range = [open: string, close: string];
/** Keyed by day of week, 0 = Sunday. */
export type WeeklyHours = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, Range[]>>;

export type HoursStatus =
  | { state: "open"; label: string; closesAt: string }
  | { state: "later"; label: string; opensAt: string }
  | { state: "closed"; label: string; nextDay: number; opensAt: string }
  | { state: "unknown"; label: string };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const overnight = ([o, c]: Range) => toMinutes(c) <= toMinutes(o);

export function hoursStatus(hours: WeeklyHours | null | undefined, now: LocalNow = localNow()): HoursStatus {
  if (!hours || !Object.values(hours).some((r) => r && r.length)) {
    return { state: "unknown", label: "Hours not added yet" };
  }
  const { day, minutes } = now;
  const at = (d: number) => hours[d as keyof WeeklyHours] ?? [];

  // Yesterday's overnight ranges still running after midnight.
  for (const r of at((day + 6) % 7)) {
    if (overnight(r) && minutes < toMinutes(r[1])) {
      return { state: "open", label: `Open now · until ${format12h(r[1])}`, closesAt: r[1] };
    }
  }

  let later: Range | null = null;
  for (const r of at(day)) {
    const o = toMinutes(r[0]);
    const c = toMinutes(r[1]);
    if (minutes >= o && (overnight(r) || minutes < c)) {
      return { state: "open", label: `Open now · until ${format12h(r[1])}`, closesAt: r[1] };
    }
    if (minutes < o && (!later || o < toMinutes(later[0]))) later = r;
  }
  if (later) return { state: "later", label: `Opens tonight · ${format12h(later[0])}`, opensAt: later[0] };

  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    const first = at(d)[0];
    if (first) {
      return { state: "closed", label: `Closed tonight · opens ${DAY[d]} ${format12h(first[0])}`, nextDay: d, opensAt: first[0] };
    }
  }
  return { state: "unknown", label: "Hours not added yet" };
}

/** Grouped lines for the venue page: "Fri, Sat · 9:00 PM – 4:00 AM". Monday first, as in the prototype. */
export function hoursLines(hours: WeeklyHours | null | undefined): string[] {
  if (!hours) return [];
  const groups = new Map<string, string[]>();
  for (const d of [1, 2, 3, 4, 5, 6, 0] as const) {
    const ranges = hours[d];
    if (!ranges?.length) continue;
    const key = ranges.map(([o, c]) => `${format12h(o)} – ${format12h(c)}`).join(" & ");
    groups.set(key, [...(groups.get(key) ?? []), DAY[d]]);
  }
  return [...groups].map(([times, days]) => `${days.join(", ")} · ${times}`);
}

/** Would a visit at this day/time fall inside opening hours? Used to warn on requests. */
export function isOpenAt(hours: WeeklyHours | null | undefined, day: number, minutes: number): boolean | null {
  if (!hours || !Object.values(hours).some((r) => r && r.length)) return null;
  return hoursStatus(hours, { date: "", day, minutes }).state === "open";
}
