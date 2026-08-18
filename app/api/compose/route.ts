/**
 * =============================================================================
 *  POST /api/compose  (demo mode only)
 * =============================================================================
 *
 *  With a Supabase project configured, the composer writes to the posts table
 *  straight from the browser and RLS proves the row belongs to the signed-in
 *  user. There is no server route in that path and there does not need to be.
 *
 *  Demo mode has no database and no browser-reachable store, so the post has to
 *  be handed to the server process that holds the in-memory world. That is all
 *  this route is for.
 *
 *  Which is why the first thing it does is refuse to run outside demo mode. If
 *  it accepted real requests it would be an unauthenticated write path into a
 *  real deployment: the demo world hands out a viewer id without any sign-in, so
 *  anyone who could reach this endpoint could post as somebody else. Refusing
 *  early keeps that from ever being possible once .env.local is filled in.
 *
 *  Nothing written here is saved. It lives in one server process and is gone on
 *  the next restart.
 * =============================================================================
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/data/session';
import { addDemoPost, demoWorld } from '@/lib/demo/store';
import { thunder } from '@/lib/algorithm/thunder';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Matches the counter in the composer and the column in the schema. */
const MAX_BODY_LENGTH = 500;

interface ComposeBody {
  body?: unknown;
  /** Set when this is a reply. The id of the post being replied to. */
  replyTo?: unknown;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session.isDemo) {
      return NextResponse.json(
        {
          error:
            'This route only exists in demo mode. With Supabase configured the browser writes posts directly, so this endpoint is disabled.',
        },
        { status: 400 },
      );
    }

    if (!session.viewerId) {
      return NextResponse.json(
        { error: 'No viewer to post as.' },
        { status: 401 },
      );
    }

    const payload = await readBody(request);
    const raw = typeof payload.body === 'string' ? payload.body : '';
    const trimmed = raw.trim();

    if (!trimmed) {
      return NextResponse.json(
        { error: 'Write something first.' },
        { status: 400 },
      );
    }

    if (trimmed.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        {
          error: `That is ${trimmed.length} characters. The limit is ${MAX_BODY_LENGTH}.`,
        },
        { status: 400 },
      );
    }

    // A reply names its parent. Anything else is a top-level post.
    const replyTo =
      typeof payload.replyTo === 'string' && payload.replyTo.trim()
        ? payload.replyTo.trim()
        : null;

    if (replyTo && !demoWorld.posts.some((post) => post.id === replyTo)) {
      return NextResponse.json(
        { error: 'That post no longer exists.' },
        { status: 400 },
      );
    }

    // Demo mode has no storage bucket, so a demo post is always text.
    const post = addDemoPost({
      author_id: session.viewerId,
      body: trimmed,
      media_url: null,
      media_type: 'none',
      reply_to: replyTo,
    });

    // A reply writes two rows, exactly as the real path does. The second is an
    // engagement row of action 'reply' against the parent, because Phoenix
    // scores from the engagements table and would otherwise never see it.
    // Doing both here keeps them from ever disagreeing.
    if (replyTo) {
      await session.db
        .from('engagements')
        .insert({ user_id: session.viewerId, post_id: replyTo, action: 'reply' });

      // The parent's counts just changed, so drop it from Thunder's cache.
      thunder.invalidate(replyTo);
    }

    return NextResponse.json({ ok: true, id: post.id }, { status: 200 });
  } catch (error) {
    // Every bad request above returns its own 4xx. Reaching here means
    // something in the process failed, which is not the caller's fault.
    console.error('[api/compose] failed to add demo post:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not post that. Try again.',
      },
      { status: 500 },
    );
  }
}

async function readBody(request: Request): Promise<ComposeBody> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ComposeBody;
    }
  } catch {
    // Falls through to validation, which returns a 400 with a real message.
  }
  return {};
}
