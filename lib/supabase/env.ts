/**
 * One place to ask "is Supabase configured yet?".
 *
 * Someone cloning this repo will run `npm run dev` before they have filled in
 * .env.local. Rather than crashing with a stack trace, every page checks this
 * and renders setup instructions instead.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Demo mode is simply "no Supabase project configured".
 *
 * Rather than showing a dead setup screen, the app falls back to an in-memory
 * dataset so it can be browsed straight after a clone. See lib/demo/store.ts.
 * Configure the two public env vars and this turns itself off.
 */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}
