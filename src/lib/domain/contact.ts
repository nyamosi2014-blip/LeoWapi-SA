/**
 * Phone and email normalisation. Replaces the prototype's oNorm(), which only
 * accepted Tanzanian (+255) numbers.
 */
export type Contact = { type: "phone"; e164: string } | { type: "email"; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * South African numbers: 10 digits starting with 0 nationally (082 123 4567),
 * or +27 / 0027 followed by 9 digits. Returns E.164 ("+27821234567") or null.
 */
export function normalizeZaPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+27")) d = d.slice(3);
  else if (d.startsWith("0027")) d = d.slice(4);
  else if (d.startsWith("27") && d.length === 11) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  else return null;
  return /^[1-8]\d{8}$/.test(d) ? `+27${d}` : null;
}

/** Cell numbers start 06, 07 or 08 nationally. */
export function isZaMobile(e164: string): boolean {
  return /^\+27[678]\d{8}$/.test(e164);
}

/** "+27 82 123 4567" for display. */
export function formatZaPhone(e164: string): string {
  const n = e164.replace(/^\+27/, "");
  return `+27 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

export function normalizeContact(input: string): Contact | null {
  const s = input.trim();
  if (s.includes("@")) return EMAIL.test(s) ? { type: "email", email: s.toLowerCase() } : null;
  const e164 = normalizeZaPhone(s);
  return e164 ? { type: "phone", e164 } : null;
}

/** WhatsApp click-to-chat link. Opens the customer's own WhatsApp; nothing is sent by LeoWapi. */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}
