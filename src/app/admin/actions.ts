"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const decision = z.object({
  venueId: z.uuid(),
  decision: z.enum(["published", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Approve or reject a venue waiting for review. The database repeats every check here
 * (moderator role, not the moderator's own venue, pending only), so this is a convenience
 * layer, not the safeguard.
 */
export async function reviewVenue(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new Error("Not allowed");
  const input = decision.parse({ venueId: form.get("venueId"), decision: form.get("decision"), note: form.get("note") || undefined });
  if (input.decision === "rejected" && !input.note) throw new Error("Give the owner a reason when rejecting a listing");

  const supabase = (await createClient())!;
  const { error } = await supabase
    .from("venues")
    .update({ publication: input.decision, moderator_note: input.note ?? null })
    .eq("id", input.venueId)
    .eq("publication", "pending");
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
