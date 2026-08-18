/**
 * =============================================================================
 *  POST /api/engage
 * =============================================================================
 *
 *  One row per action, in one table. A like is a row, a block is a row, a
 *  skipped reel is a row. The ranker reads that table and nothing else, which
 *  is why tapping a button changes the next feed load.
 *
 *  Two clients are used here on purpose:
 *
 *    session.db      every write, so RLS enforces that you can only create and
 *                    delete your own engagement rows.
 *    session.ranker  the count read-back only, because the number under a
 *                    button is a global total and RLS hides other people's rows.
 *
 *  In demo mode both are the in-memory adapter and there is no RLS to enforce,
 *  but the code path is identical: the row is written, the counts are read back,
 *  and the next feed request ranks differently because of it. Nothing is saved.
 *  It all resets when the server restarts.
 * =============================================================================
 */

import { NextResponse } from 'next/server';
import type { ActionCounts, ActionName } from '@/lib/types';
import { ALL_ACTIONS } from '@/lib/types';
import { thunder } from '@/lib/algorithm/thunder';
import { getSession } from '@/lib/data/session';
import { publicCounts } from '@/lib/algorithm/redact';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Actions that are a toggle: you either like a post or you do not, and tapping
 * twice must not create two rows. These are the actions covered by the partial
 * unique index on (user_id, post_id, action), so an upsert with
 * ignoreDuplicates turns a double tap into a no-op instead of an error.
 */
const TOGGLEABLE_ACTIONS = new Set<ActionName>([
  'like',
  'repost',
  'bookmark',
  'follow_author',
  'mute_author',
  'block_author',
  'report',
  'not_interested',
]);

interface EngageBody {
  postId?: unknown;
  action?: unknown;
  undo?: unknown;
}

export async function POST(request: Request) {
  try {
    // --- Who is asking -----------------------------------------------------
    // getSession() covers both modes. An unconfigured .env.local is no longer a
    // refusal: demo mode always has a viewer, so tapping a button really does
    // write a row and the counts and the next feed order really do move.
    const session = await getSession();

    // The only state that cannot react is a real, signed-out visitor. In demo
    // mode viewerId is never null, so this never fires there.
    if (session.viewerId === null) {
      return NextResponse.json(
        { error: 'Sign in to react to posts.' },
        { status: 401 },
      );
    }

    const viewerId = session.viewerId;
    const supabase = session.db;

    // --- Validate ----------------------------------------------------------
    const body = await readBody(request);

    const postId = typeof body.postId === 'string' ? body.postId.trim() : '';
    if (!postId) {
      return NextResponse.json(
        { error: 'postId is required.' },
        { status: 400 },
      );
    }

    const action = body.action as ActionName;
    if (typeof action !== 'string' || !ALL_ACTIONS.includes(action)) {
      return NextResponse.json(
        {
          error: `Unknown action. Expected one of: ${ALL_ACTIONS.join(', ')}.`,
        },
        { status: 400 },
      );
    }

    // A 'reply' engagement row is written by the reply composer at the same
    // time as the reply post itself, inside one flow, so the row and the post
    // can never disagree. Letting this endpoint write a bare 'reply' would
    // create a reply count with no reply behind it, which would inflate the
    // reply weight (13.5, the second largest positive) on a post nobody
    // actually answered.
    if (action === 'reply') {
      return NextResponse.json(
        {
          error:
            'Replies are created by posting a reply, not by this endpoint.',
        },
        { status: 400 },
      );
    }

    const undo = body.undo === true;
    const admin = session.ranker;

    // --- follow_author needs the author id before anything else ------------
    // Read it up front so an undo can delete the follow row even after the
    // engagement row is gone. author_id is a public field; the admin client is
    // used only so an RLS policy on posts cannot silently break following.
    let authorId: string | null = null;
    if (action === 'follow_author') {
      const { data: post, error } = await admin
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .maybeSingle();

      if (error) throw error;
      if (!post) {
        return NextResponse.json({ error: 'Post not found.' }, { status: 400 });
      }
      authorId = post.author_id as string;
    }

    // --- Write -------------------------------------------------------------
    if (undo) {
      // User-scoped client, so RLS is what proves these rows belong to the
      // caller. The eq on user_id is belt and braces, not the security check.
      const { error } = await supabase
        .from('engagements')
        .delete()
        .eq('user_id', viewerId)
        .eq('post_id', postId)
        .eq('action', action);

      if (error) throw error;

      if (action === 'follow_author' && authorId) {
        const { error: followError } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', viewerId)
          .eq('following_id', authorId);

        if (followError) throw followError;
      }
    } else {
      const row = { user_id: viewerId, post_id: postId, action };

      if (TOGGLEABLE_ACTIONS.has(action)) {
        // Double tap, offline retry, two tabs: all of these should land on the
        // same single row rather than an error or a duplicate count.
        //
        // This is a plain insert rather than an upsert on purpose. The index
        // guarding these actions is PARTIAL (see engagements_one_per_toggle_idx
        // in 0001_schema.sql), and Postgres cannot use a partial index as an
        // ON CONFLICT arbiter unless the statement repeats the index predicate.
        // PostgREST has no way to send that predicate, so an upsert here would
        // fail with 42P10 on every single tap. Inserting and swallowing the
        // duplicate-key error gets the same outcome and actually works.
        const { error } = await supabase.from('engagements').insert(row);

        // 23505 is unique_violation: the index caught a double tap, which is
        // exactly the no-op we wanted. Anything else is a real failure.
        if (error && error.code !== '23505') throw error;
      } else {
        // share, profile_click, video_watch_complete, video_skip_early. These
        // are events, not states. Watching a reel twice is two data points and
        // the ranker wants both.
        const { error } = await supabase.from('engagements').insert(row);
        if (error) throw error;
      }

      // Following is a relationship, not just an engagement row, so it gets
      // written to `follows` too. That table is what the candidate pipeline
      // reads to decide what counts as in-network.
      if (action === 'follow_author' && authorId && authorId !== viewerId) {
        const { error: followError } = await supabase.from('follows').upsert(
          { follower_id: viewerId, following_id: authorId },
          {
            onConflict: 'follower_id,following_id',
            ignoreDuplicates: true,
          },
        );

        if (followError) throw followError;
      }
    }

    // Thunder caches a post's counts for 30 seconds. Without this, a like you
    // just tapped would not reach the ranker until that window expired, and the
    // feed would appear to ignore you. Dropping the entry forces the next feed
    // request to re-read the real counts for this post.
    thunder.invalidate(postId);

    // --- Read back ---------------------------------------------------------
    // Counts on the ADMIN client: these are global totals, and RLS keeps a
    // viewer from seeing other people's rows (private negative actions such as
    // mute and report especially). The button labels need the true total, so
    // this one read is elevated.
    //
    // Viewer actions on the USER client: this is the caller's own state, which
    // is exactly what RLS already scopes for us.
    const [countsResult, viewerResult] = await Promise.all([
      admin.from('engagements').select('action').eq('post_id', postId),
      supabase
        .from('engagements')
        .select('action')
        .eq('post_id', postId)
        .eq('user_id', viewerId),
    ]);

    if (countsResult.error) throw countsResult.error;
    if (viewerResult.error) throw viewerResult.error;

    const counts: ActionCounts = {};
    for (const row of countsResult.data ?? []) {
      const name = row.action as ActionName;
      if (!ALL_ACTIONS.includes(name)) continue;
      counts[name] = (counts[name] ?? 0) + 1;
    }

    const viewerActions: ActionName[] = [];
    for (const row of viewerResult.data ?? []) {
      const name = row.action as ActionName;
      if (!ALL_ACTIONS.includes(name)) continue;
      if (!viewerActions.includes(name)) viewerActions.push(name);
    }

    // publicCounts drops mute/block/report/not_interested. Those totals were
    // read with the service-role key and RLS keeps them private, so they must
    // not travel to the browser. viewerActions still carries the viewer's own
    // negative actions, which is what makes their own buttons render as active.
    return NextResponse.json(
      { ok: true, counts: publicCounts(counts), viewerActions },
      { status: 200 },
    );
  } catch (error) {
    // Everything above returns its own 4xx for a bad request. Reaching here
    // means the database or the network failed, which is a 500, not the
    // caller's fault. The rail shows this message inline, so it stays short.
    console.error('[api/engage] failed to record engagement:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not record that. Try again.',
      },
      { status: 500 },
    );
  }
}

async function readBody(request: Request): Promise<EngageBody> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as EngageBody;
    }
  } catch {
    // Falls through to validation, which returns a 400 with a real message.
  }
  return {};
}
