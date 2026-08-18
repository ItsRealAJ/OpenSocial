/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * Only the ranker uses this, and only on the server. It needs to read global
 * engagement counts across all users to work out that a post has 400 likes,
 * which RLS deliberately prevents the browser from doing.
 *
 * Never import this file from a Client Component.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing. Copy .env.example to .env.local and fill in all three values from Supabase -> Project Settings -> API.',
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
