import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/env";

/** Refreshes the visitor's session cookie on each request, before any page reads it. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabaseConfig();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Validates the token and refreshes it if it has expired. Nothing may run between
  // creating the client and this call, or sessions can drop at random.
  await supabase.auth.getClaims();
  return response;
}
