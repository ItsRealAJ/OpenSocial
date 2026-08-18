/**
 * =============================================================================
 *  POST /api/follow
 * =============================================================================
 *
 *  Writes the `follows` table directly, which is the plain "follow this
 *  account" button on a profile. It is separate from the follow_author
 *  engagement in /api/engage: that one records "this specific post made me
 *  follow them", which the ranker weights at 24, the largest positive number in
 *  weights.ts. This route is the relationship without the attribution.
 * =============================================================================
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/data/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface FollowBody {
  userId?: unknown;
  follow?: unknown;
}

export async function POST(request: Request) {
  try {
    // getSession() answers this in both modes. With no Supabase project the
    // demo viewer is the caller and the follow lands in the in-memory store,
    // which is enough for the in-network split in the feed to change. Nothing
    // is saved, and it resets when the server restarts.
    const session = await getSession();

    // A real, signed-out visitor is the only caller with nobody to follow as.
    // Demo mode always has a viewer, so this never fires there.
    if (session.viewerId === null) {
      return NextResponse.json(
        { error: 'Sign in to follow accounts.' },
        { status: 401 },
      );
    }

    const viewerId = session.viewerId;
    const supabase = session.db;

    const body = await readBody(request);
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required.' },
        { status: 400 },
      );
    }

    if (userId === viewerId) {
      return NextResponse.json(
        { error: 'You cannot follow yourself.' },
        { status: 400 },
      );
    }

    // Anything other than an explicit false is treated as a follow, so a client
    // that omits the field gets the safe, reversible outcome.
    const follow = body.follow !== false;

    // Both writes go through the user-scoped client, so RLS is what enforces
    // that follower_id is the caller and nobody can follow on someone's behalf.
    if (follow) {
      const { error } = await supabase.from('follows').upsert(
        { follower_id: viewerId, following_id: userId },
        { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
      );

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', viewerId)
        .eq('following_id', userId);

      if (error) throw error;
    }

    // Exact head count: no rows come back, only the number, so the profile
    // header can show a real total instead of guessing from the old value.
    const { count, error: countError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    if (countError) throw countError;

    return NextResponse.json(
      { ok: true, following: follow, followerCount: count ?? 0 },
      { status: 200 },
    );
  } catch (error) {
    // Bad requests are handled above with their own 400. Reaching here means
    // the database call failed, which is a 500.
    console.error('[api/follow] failed to update follow:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not update that follow. Try again.',
      },
      { status: 500 },
    );
  }
}

async function readBody(request: Request): Promise<FollowBody> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as FollowBody;
    }
  } catch {
    // Falls through to validation, which returns a 400 with a real message.
  }
  return {};
}
