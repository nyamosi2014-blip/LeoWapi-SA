/**
 * Listing publication, ported from the prototype's OWNER_TX/PUBL. Publication
 * (can customers see it?) and verification (has LeoWapi checked it?) stay
 * separate, as in the prototype. Owners can never publish or verify their own
 * listing; the database enforces the same rule (see supabase/migrations).
 */
export type Publication = "draft" | "pending" | "published" | "unpublished" | "rejected";
export type Verification = "none" | "pending" | "verified" | "lapsed";
export type ListingActor = "owner" | "moderator";

export const PUBLICATION_LABEL: Record<Publication, string> = {
  draft: "Draft · not visible to customers",
  pending: "Waiting for LeoWapi review · not visible yet",
  published: "Published · visible to customers",
  unpublished: "Unpublished · hidden from customers",
  rejected: "Not approved · see the moderator's note",
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  none: "Not verified by LeoWapi",
  pending: "Verification pending",
  verified: "Verified by LeoWapi",
  lapsed: "Verification out of date",
};

const TRANSITIONS: Record<Publication, Partial<Record<Publication, ListingActor[]>>> = {
  draft: { pending: ["owner"] },
  pending: { draft: ["owner"], published: ["moderator"], rejected: ["moderator"] },
  // An approved listing can be hidden and shown again by its owner without re-review.
  published: { unpublished: ["owner", "moderator"] },
  unpublished: { published: ["owner"], pending: ["owner"] },
  rejected: { draft: ["owner"] },
};

export function canPublishTransition(
  from: Publication,
  to: Publication,
  actor: ListingActor,
  opts: { actorIsMember?: boolean; everApproved?: boolean } = {},
): boolean {
  if (!TRANSITIONS[from][to]?.includes(actor)) return false;
  // Nobody moderates their own listing.
  if (actor === "moderator" && opts.actorIsMember && (to === "published" || to === "rejected")) return false;
  // Re-showing a listing skips review only if a moderator approved it before.
  if (from === "unpublished" && to === "published" && !opts.everApproved) return false;
  return true;
}
