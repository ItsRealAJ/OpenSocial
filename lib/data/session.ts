/**
 * =============================================================================
 *  ONE PLACE THAT ANSWERS "WHO IS ASKING, AND WHAT DO I QUERY?"
 * =============================================================================
 *
 *  Every page and route handler starts by calling getSession(). It returns the
 *  viewer plus the two database clients they should be using, and it hides the
 *  difference between a configured Supabase project and demo mode.
 *
 *  Two clients, because they answer different questions:
 *
 *    db      scoped to the viewer. Row Level Security applies. Everything the
 *            viewer writes goes through this, so the database enforces that
 *            they can only write their own rows.
 *
 *    ranker  elevated. Only the feed pipeline uses it, and only because
 *            ranking needs global engagement counts that RLS deliberately
 *            hides from the browser.
 *
 *  In demo mode both are the same in-memory adapter, because there is no
 *  security boundary to enforce when there is no database and no real accounts.
 * =============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasServiceRoleKey, isDemoMode } from '@/lib/supabase/env';
import { createDemoClient } from '@/lib/demo/db';
import { demoWorld } from '@/lib/demo/store';

export interface AppSession {
  /** True when no Supabase project is configured and the demo world is in use. */
  isDemo: boolean;
  /** The signed-in user, or the demo viewer, or null when signed out. */
  viewerId: string | null;
  /** Their handle, for links and the nav. */
  username: string | null;
  /** Viewer-scoped client. RLS applies in real mode. */
  db: SupabaseClient;
  /** Elevated client for the ranker only. */
  ranker: SupabaseClient;
  /** Demo mode has no storage bucket, so /compose hides the attach control. */
  canUploadMedia: boolean;
  /** Demo mode has no auth, so /login and follow buttons change their copy. */
  canSignIn: boolean;
}

export async function getSession(): Promise<AppSession> {
  if (isDemoMode()) {
    const demo = createDemoClient();
    return {
      isDemo: true,
      viewerId: demoWorld.viewerId,
      username: demoWorld.viewerUsername,
      db: demo,
      ranker: demo,
      canUploadMedia: false,
      canSignIn: false,
    };
  }

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await db
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    username = (profile?.username as string | undefined) ?? null;
  }

  return {
    isDemo: false,
    viewerId: user?.id ?? null,
    username,
    db,
    // Falls back to the viewer client when the service role key is absent. The
    // feed route checks hasServiceRoleKey() separately and shows setup
    // instructions, so this never silently produces a half-ranked feed.
    ranker: hasServiceRoleKey() ? createAdminClient() : db,
    canUploadMedia: true,
    canSignIn: true,
  };
}
