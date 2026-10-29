/**
 * Public Supabase settings. Both are safe to expose to the browser: access is
 * controlled by row-level security in the database, not by hiding the key.
 * Returns null when this environment has no Supabase project yet, so pages can say
 * so instead of failing.
 */
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}
