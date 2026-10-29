import { describe, expect, it } from "vitest";
import { formatRand, formatRandRange, parseRand } from "./money";
import { formatZaPhone, isZaMobile, normalizeContact, normalizeZaPhone, whatsappLink } from "./contact";
import { addDays, localNow } from "./time";
import { hoursLines, hoursStatus, isOpenAt, type WeeklyHours } from "./hours";
import { budgetBand, groupEstimate, priceText, spendEstimate, type PriceItem } from "./pricing";
import { canTransition, nextStatuses, validateRequest, type RequestDraft } from "./requests";
import { canPublishTransition } from "./publication";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("money (ZAR)", () => {
  it("formats whole rand with en-ZA grouping", () => {
    expect(nbsp(formatRand(15000))).toBe("R 150");
    expect(nbsp(formatRand(120000))).toBe("R 1 200");
    expect(nbsp(formatRandRange(8000, 12000))).toBe("R 80–R 120");
    expect(nbsp(formatRandRange(5000, 5000))).toBe("R 50");
  });
  it("parses what owners type", () => {
    expect(parseRand("R150")).toBe(15000);
    expect(parseRand("1 200")).toBe(120000);
    expect(parseRand("1,200")).toBe(120000);
    expect(parseRand("99.50")).toBe(9950);
    expect(parseRand("abc")).toBeNull();
    expect(parseRand("")).toBeNull();
  });
});

describe("South African phone and email", () => {
  it("normalises national and international forms to E.164", () => {
    expect(normalizeZaPhone("082 123 4567")).toBe("+27821234567");
    expect(normalizeZaPhone("+27 82 123 4567")).toBe("+27821234567");
    expect(normalizeZaPhone("0027821234567")).toBe("+27821234567");
    expect(normalizeZaPhone("011 555 1234")).toBe("+27115551234");
  });
  it("rejects Tanzanian and malformed numbers", () => {
    expect(normalizeZaPhone("0712 345 678")).toBe("+27712345678"); // valid SA cell format
    expect(normalizeZaPhone("+255 712 345 678")).toBeNull();
    expect(normalizeZaPhone("12345")).toBeNull();
    expect(normalizeZaPhone("0012345678")).toBeNull();
  });
  it("detects mobiles and formats for display", () => {
    expect(isZaMobile("+27821234567")).toBe(true);
    expect(isZaMobile("+27115551234")).toBe(false);
    expect(formatZaPhone("+27821234567")).toBe("+27 82 123 4567");
  });
  it("accepts email or phone as a contact", () => {
    expect(normalizeContact(" Thandi@Example.co.za ")).toEqual({ type: "email", email: "thandi@example.co.za" });
    expect(normalizeContact("not-an-email@")).toBeNull();
    expect(whatsappLink("+27821234567", "Hi there")).toBe("https://wa.me/27821234567?text=Hi%20there");
  });
});

describe("time in Africa/Johannesburg", () => {
  it("is UTC+2 all year", () => {
    expect(localNow(new Date("2026-10-31T21:30:00Z"))).toEqual({ date: "2026-10-31", day: 6, minutes: 23 * 60 + 30 });
    expect(localNow(new Date("2026-10-31T22:30:00Z"))).toEqual({ date: "2026-11-01", day: 0, minutes: 30 });
    expect(localNow(new Date("2026-06-15T10:00:00Z")).minutes).toBe(12 * 60);
  });
  it("adds calendar days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("opening hours", () => {
  // Fri and Sat 21:00–04:00, Sunday 14:00–22:00
  const h: WeeklyHours = { 5: [["21:00", "04:00"]], 6: [["21:00", "04:00"]], 0: [["14:00", "22:00"]] };
  const at = (day: number, hhmm: string) => ({ date: "", day, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });

  it("is open late on the same night", () => {
    expect(hoursStatus(h, at(5, "23:00"))).toMatchObject({ state: "open", closesAt: "04:00" });
  });
  it("is still open after midnight from the night before", () => {
    expect(hoursStatus(h, at(6, "02:30"))).toMatchObject({ state: "open", label: "Open now · until 4:00 AM" });
    expect(hoursStatus(h, at(0, "03:59")).state).toBe("open");
    expect(hoursStatus(h, at(0, "04:00")).state).toBe("later");
  });
  it("says when it opens later today or on another day", () => {
    expect(hoursStatus(h, at(5, "18:00"))).toMatchObject({ state: "later", label: "Opens tonight · 9:00 PM" });
    expect(hoursStatus(h, at(1, "12:00"))).toMatchObject({ state: "closed", label: "Closed tonight · opens Fri 9:00 PM" });
  });
  it("handles missing hours honestly", () => {
    expect(hoursStatus({}, at(1, "12:00")).state).toBe("unknown");
    expect(hoursStatus(null, at(1, "12:00")).label).toBe("Hours not added yet");
    expect(isOpenAt(null, 5, 1300)).toBeNull();
  });
  it("groups identical days, Monday first", () => {
    expect(hoursLines(h)).toEqual(["Fri, Sat · 9:00 PM – 4:00 AM", "Sun · 2:00 PM – 10:00 PM"]);
  });
});

describe("pricing and expected spend", () => {
  const today = "2026-10-28";
  const items: PriceItem[] = [
    { kind: "entry", lo: 10000, hi: 10000, source: "venue", expiresOn: "2026-12-31" },
    { kind: "drink", lo: 4000, hi: 7000, source: "verified", expiresOn: "2026-12-31" },
    { kind: "table", lo: 150000, hi: null, from: true, source: "venue", expiresOn: "2026-12-31" },
  ];

  it("labels free, from-prices and stale prices", () => {
    expect(priceText({ kind: "entry", lo: 0, hi: 0, source: "venue" }, today)).toBe("Free");
    expect(nbsp(priceText(items[2], today))).toBe("From R 1 500");
    expect(priceText({ ...items[0], expiresOn: "2026-10-01" }, today)).toBe("Price not recently confirmed");
  });
  it("estimates entry + 2–3 drinks and lists its assumptions", () => {
    const est = spendEstimate(items, today)!;
    expect(est).toMatchObject({ lo: 18000, hi: 31000, label: "Estimate" });
    expect(est.assumptions.join(" | ")).toMatch(/2–3 drinks/);
    expect(est.assumptions).toContain("Excludes food, tips and transport");
    expect(budgetBand(est)).toBe("middle");
    expect(groupEstimate(est, 4)).toMatchObject({ lo: 72000, hi: 124000, people: 4 });
  });
  it("refuses to estimate from missing or out-of-date prices", () => {
    expect(spendEstimate([items[0]], today)).toBeNull();
    expect(spendEstimate([items[0], { ...items[1], expiresOn: "2026-01-01" }], today)).toBeNull();
  });
});

describe("customer requests", () => {
  const now = { date: "2026-10-28", day: 3, minutes: 20 * 60 };
  const ok: RequestDraft = { type: "table", name: "Thandi", contact: "082 123 4567", date: "2026-10-30", time: "21:00", guests: 4 };

  it("accepts a complete table request", () => {
    expect(validateRequest(ok, now)).toEqual({});
  });
  it("rejects past times, far-future dates and bad guest counts", () => {
    expect(validateRequest({ ...ok, date: "2026-10-27" }, now).date).toMatch(/passed/);
    expect(validateRequest({ ...ok, date: "2026-10-28", time: "19:00" }, now).time).toMatch(/passed today/);
    expect(validateRequest({ ...ok, date: "2027-06-01" }, now).date).toMatch(/six months/);
    expect(validateRequest({ ...ok, guests: 0 }, now).guests).toBeDefined();
    expect(validateRequest({ ...ok, guests: 2.5 }, now).guests).toBeDefined();
    expect(validateRequest({ ...ok, guests: 31 }, now).guests).toBeDefined();
  });
  it("asks for a South African contact", () => {
    expect(validateRequest({ ...ok, contact: "+255 712 345 678" }, now).contact).toMatch(/South African/);
    expect(validateRequest({ ...ok, contact: "" }, now).contact).toBeDefined();
  });
  it("doesn't need a date for a recommendation request", () => {
    expect(validateRequest({ type: "recommendation", name: "Sipho", contact: "sipho@example.com", date: "", time: "", guests: "" }, now)).toEqual({});
  });
  it("only lets the venue or an admin confirm", () => {
    expect(canTransition("delivered", "confirmed", "customer")).toBe(false);
    expect(canTransition("delivered", "confirmed", "system")).toBe(false);
    expect(canTransition("delivered", "confirmed", "venue")).toBe(true);
    expect(canTransition("submitted", "confirmed", "venue")).toBe(false);
    expect(nextStatuses("acknowledged", "customer")).toEqual(["cancelled"]);
    expect(nextStatuses("declined", "admin")).toEqual([]);
  });
});

describe("listing publication", () => {
  it("sends owner submissions to review", () => {
    expect(canPublishTransition("draft", "pending", "owner")).toBe(true);
    expect(canPublishTransition("draft", "published", "owner")).toBe(false);
    expect(canPublishTransition("pending", "published", "owner")).toBe(false);
  });
  it("lets moderators approve, but never their own venue", () => {
    expect(canPublishTransition("pending", "published", "moderator")).toBe(true);
    expect(canPublishTransition("pending", "published", "moderator", { actorIsMember: true })).toBe(false);
  });
  it("only re-shows a listing without review if it was approved before", () => {
    expect(canPublishTransition("unpublished", "published", "owner", { everApproved: true })).toBe(true);
    expect(canPublishTransition("unpublished", "published", "owner", { everApproved: false })).toBe(false);
  });
});
