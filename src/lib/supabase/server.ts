import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/env";

/**
 * A Supabase client that acts as the signed-in visitor, so every query runs under
 * their row-level security. Create one per request; never share it.
 */
export async function createClient() {
  // Read cookies first, so pages that ask for a user are always rendered per request.
  const cookieStore = await cookies();
  const config = supabaseConfig();
  if (!config) return null;
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}
