import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "venue_owner" | "organiser" | "moderator" | "admin";
export type CurrentUser = { id: string; email: string | null; roles: Role[] };

/**
 * The signed-in visitor, checked with Supabase on every call (the token's signature
 * and expiry), or null. All pages and actions get the user from here.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const id = data.claims.sub;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", id);
  return {
    id,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    roles: (roles ?? []).map((r) => r.role as Role),
  };
}

export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export const isStaff = (user: CurrentUser) => user.roles.includes("moderator") || user.roles.includes("admin");

/** Only for redirects after sign-in: a path on this site, never another site. */
export function safeNext(next: unknown, fallback = "/account"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
