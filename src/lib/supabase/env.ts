export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The publishable key (sb_publishable_…) or a legacy anon key; both act as
  // the `anon` database role until a user signs in, so RLS decides access.
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. See .env.example.",
    );
  }
  return { url, publishableKey };
}
