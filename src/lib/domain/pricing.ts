import { market } from "@/config/market";
import { formatRandRange, type Cents } from "./money";

/**
 * Price model ported from the prototype: every price says where it came from,
 * and an expected-spend figure always shows the assumptions behind it.
 */
export type PriceKind = "entry" | "cover" | "minimum_spend" | "drink" | "table" | "vip";
export type PriceSource = "verified" | "venue" | "estimate" | "customer_report";

export type PriceItem = {
  kind: PriceKind;
  lo: Cents | null;
  hi: Cents | null;
  /** "From R1 500" rather than a fixed amount. */
  from?: boolean;
  source: PriceSource;
  /** YYYY-MM-DD the price was last confirmed. */
  confirmedOn?: string | null;
  /** YYYY-MM-DD after which the price is shown as "not recently confirmed". */
  expiresOn?: string | null;
};

export const PRICE_LABEL: Record<PriceKind, string> = {
  entry: "Entry",
  cover: "Cover charge",
  minimum_spend: "Minimum spend",
  drink: "Average drink",
  table: "Table (whole group)",
  vip: "VIP",
};

export const SOURCE_LABEL: Record<PriceSource, string> = {
  verified: "Confirmed by LeoWapi",
  venue: "From the venue",
  estimate: "Estimate",
  customer_report: "Reported by a customer",
};

export function isStale(item: PriceItem, today: string): boolean {
  return item.lo == null || (!!item.expiresOn && item.expiresOn < today);
}

/** What a price cell says, e.g. "Free", "From R1 500", "R80–R120", "Price not recently confirmed". */
export function priceText(item: PriceItem, today: string): string {
  if (isStale(item, today)) return "Price not recently confirmed";
  const lo = item.lo as Cents;
  const hi = item.hi ?? lo;
  if (lo === 0 && hi === 0) return "Free";
  return (item.from ? "From " : "") + formatRandRange(lo, hi);
}

export type SpendEstimate = {
  lo: Cents;
  hi: Cents;
  perPerson: true;
  assumptions: string[];
  /** Always an estimate: it is derived, never published by the venue as a total. */
  label: "Estimate";
};

/**
 * Expected spend per person = entry + about 2–3 drinks (the prototype's basis).
 * Returns null when entry or drink price is missing or out of date, so we never
 * show a total built on unconfirmed numbers.
 */
export function spendEstimate(items: PriceItem[], today: string): SpendEstimate | null {
  const entry = items.find((i) => i.kind === "entry") ?? items.find((i) => i.kind === "cover");
  const drink = items.find((i) => i.kind === "drink");
  if (!entry || !drink || isStale(entry, today) || isStale(drink, today)) return null;
  const eLo = entry.lo as Cents;
  const eHi = entry.hi ?? eLo;
  const dLo = drink.lo as Cents;
  const dHi = drink.hi ?? dLo;
  const assumptions = [
    `${PRICE_LABEL[entry.kind]}: ${formatRandRange(eLo, eHi)} (${SOURCE_LABEL[entry.source].toLowerCase()})`,
    `About 2–3 drinks at ${formatRandRange(dLo, dHi)} each (${SOURCE_LABEL[drink.source].toLowerCase()})`,
    "Excludes food, tips and transport",
  ];
  const min = items.find((i) => i.kind === "minimum_spend" && !isStale(i, today));
  if (min) assumptions.push(`Minimum spend applies: ${priceText(min, today)}`);
  return { lo: eLo + 2 * dLo, hi: eHi + 3 * dHi, perPerson: true, assumptions, label: "Estimate" };
}

/** Group total from a per-person estimate. Assumptions travel with the number. */
export function groupEstimate(est: SpendEstimate, people: number) {
  return {
    lo: est.lo * people,
    hi: est.hi * people,
    people,
    assumptions: [...est.assumptions, `${people} people, each spending the per-person estimate`],
    label: "Estimate" as const,
  };
}

/** Budget band for a per-person estimate, using the midpoint (as the prototype did). */
export function budgetBand(est: SpendEstimate | null): string | null {
  if (!est) return null;
  const mid = (est.lo + est.hi) / 200;
  const band = market.budgetBands.find((b) => mid >= b.min && (b.max == null || mid < b.max));
  return band?.id ?? null;
}
