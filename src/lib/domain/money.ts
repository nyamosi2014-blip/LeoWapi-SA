import { market } from "@/config/market";

/** Money is stored as whole cents (integers) to avoid floating-point errors. */
export type Cents = number;

const whole = new Intl.NumberFormat(market.locale, {
  style: "currency",
  currency: market.currency.code,
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** "R 1 200" (en-ZA uses a non-breaking space between groups). Rounds to whole rand. */
export function formatRand(cents: Cents): string {
  return whole.format(Math.round(cents / 100));
}

/** "R 150–R 300", or a single amount when low and high match. */
export function formatRandRange(lo: Cents, hi: Cents): string {
  return lo === hi ? formatRand(lo) : `${formatRand(lo)}–${formatRand(hi)}`;
}

/** Parse what an owner types ("R150", "1 200", "1,200.50") into cents, or null. */
export function parseRand(input: string): Cents | null {
  const s = input.trim().replace(/^R\s*/i, "").replace(/[\s ]/g, "");
  if (!/^\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?$/.test(s)) return null;
  // A trailing ".dd" or ",dd" is cents; any other separator is a thousands separator.
  const m = s.match(/^(.*?)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const rand = Number(m[1].replace(/[.,]/g, ""));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return Number.isFinite(rand) ? rand * 100 + cents : null;
}
