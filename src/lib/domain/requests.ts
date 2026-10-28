import { market } from "@/config/market";
import { normalizeContact } from "./contact";
import { addDays, localNow, toMinutes, type LocalNow } from "./time";

/**
 * Customer requests. Validation is ported from the prototype's rqValidate();
 * the status machine extends its RSTAT list with who may make each change.
 * Submitting a request never confirms a booking: only the venue (or an admin
 * acting for it) can move a request to "confirmed".
 */
export type RequestType = "table" | "recommendation" | "group_outing" | "listing_correction";

export type RequestDraft = {
  type: RequestType;
  name: string;
  contact: string;
  date: string;
  time: string;
  guests: string | number;
  note?: string;
  occasion?: string;
};

export type FieldErrors = Partial<Record<keyof RequestDraft, string>>;

export function validateRequest(d: RequestDraft, now: LocalNow = localNow()): FieldErrors {
  const e: FieldErrors = {};
  const t = (s: string | undefined) => (s ?? "").trim();
  const { maxDaysAhead, minGuests, maxGuests, maxNoteLength } = market.requests;

  if (t(d.name).length < 2) e.name = "Please enter your name.";

  if (!t(d.contact)) e.contact = "Add a phone number or email so the venue can reach you.";
  else if (!normalizeContact(d.contact)) {
    e.contact = "That doesn't look like a valid South African phone number (like 082 123 4567) or email.";
  }

  const needsVisit = d.type === "table" || d.type === "group_outing";
  if (needsVisit) {
    const max = addDays(now.date, maxDaysAhead);
    if (!d.date) e.date = "Choose a date.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) e.date = "That date isn't valid.";
    else if (d.date < now.date) e.date = "That date has already passed.";
    else if (d.date > max) e.date = "Please choose a date within the next six months.";

    if (!d.time) e.time = "Choose an arrival time.";
    else if (!/^\d{2}:\d{2}$/.test(d.time)) e.time = "That time isn't valid.";
    else if (!e.date && d.date === now.date && toMinutes(d.time) <= now.minutes) {
      e.time = "That time has already passed today.";
    }

    const g = Number(d.guests);
    if (d.guests === "" || d.guests == null) e.guests = "Enter how many people are coming.";
    else if (!Number.isInteger(g) || g < minGuests || g > maxGuests) {
      e.guests = `Guests must be a whole number from ${minGuests} to ${maxGuests}.`;
    }
  }

  if ((d.note ?? "").length > maxNoteLength) e.note = `Please keep your note under ${maxNoteLength} characters.`;
  return e;
}

export type RequestStatus =
  | "submitted"
  | "delivered"
  | "acknowledged"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "expired";

export type RequestActor = "customer" | "venue" | "admin" | "system";

/** Wording shown to the customer. None of these overstate what has happened. */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Submitted · not yet delivered to the venue",
  delivered: "Delivered to the venue · waiting for a reply",
  acknowledged: "Seen by the venue · not confirmed yet",
  confirmed: "Confirmed by the venue",
  declined: "Declined by the venue",
  cancelled: "Cancelled",
  expired: "Expired · the date has passed",
};

const TRANSITIONS: Record<RequestStatus, Partial<Record<RequestStatus, RequestActor[]>>> = {
  submitted: { delivered: ["system", "admin"], cancelled: ["customer", "admin"], expired: ["system"] },
  delivered: {
    acknowledged: ["venue", "admin"],
    confirmed: ["venue", "admin"],
    declined: ["venue", "admin"],
    cancelled: ["customer", "admin"],
    expired: ["system"],
  },
  acknowledged: {
    confirmed: ["venue", "admin"],
    declined: ["venue", "admin"],
    cancelled: ["customer", "admin"],
    expired: ["system"],
  },
  confirmed: { cancelled: ["customer", "venue", "admin"] },
  declined: {},
  cancelled: {},
  expired: {},
};

export function canTransition(from: RequestStatus, to: RequestStatus, actor: RequestActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function nextStatuses(from: RequestStatus, actor: RequestActor): RequestStatus[] {
  return (Object.keys(TRANSITIONS[from]) as RequestStatus[]).filter((to) => canTransition(from, to, actor));
}
