/**
 * =============================================================================
 *  POST /api/feed
 * =============================================================================
 *
 *  RANKING HAPPENS ON THE SERVER, and that is a deliberate split.
 *
 *  Thunder (lib/algorithm/thunder.ts) is an in-process Map. Keeping the ranker
 *  here means every request in this server process shares one warm cache of
 *  recent posts and their engagement counts, so the second feed load costs
 *  roughly zero queries. If ranking ran in the browser, every tab would start
 *  with an empty cache and re-fetch everything, and the service-role key that
 *  reads global counts would have to be shipped to the client, which it never
 *  can be.
 *
 *  THE WEIGHTS COME FROM THE BROWSER, which is the other half of the split.
 *  They are the viewer's own localStorage values from /settings/algorithm,
 *  posted with every request. Move a slider, refresh the feed, the order
 *  changes. No deploy, no database write, no server restart. The server merges
 *  whatever arrives over the defaults in weights.ts and throws away anything
 *  that is not a finite number, so a corrupted localStorage cannot break
 *  anyone's feed.
 *
 *  THE RANKER RUNS AGAINST WHATEVER getSession() HANDS IT: a real Supabase
 *  project when one is configured, or the in-memory demo world when none is.
 *  The pipeline itself does not know the difference. It queries the same tables
 *  with the same filters either way, so the ordering you see with an empty
 *  .env.local is produced by the real scoring code, not by a canned list. The
 *  only thing that changes is where the rows come from, which is why the
 *  response reports `isDemo` instead of the pipeline branching on it.
 * =============================================================================
 */

import { NextResponse } from 'next/server';
import type { FeedRequest, FeedResponse, FeedRules, Weights } from '@/lib/types';
import {
  FEED_RULES,
  WEIGHTS,
  resolveRules,
  resolveWeights,
} from '@/lib/algorithm/weights';
import { buildForYouFeed } from '@/lib/algorithm/home-mixer';
import { getSession } from '@/lib/data/session';
import { redactFeedPosts } from '@/lib/algorithm/redact';
import { hasServiceRoleKey } from '@/lib/supabase/env';

/** The feed depends on cookies and on wall-clock time. Never cache it. */
export const dynamic = 'force-dynamic';
/** Thunder is a process-local Map, so the ranker needs the Node runtime. */
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // --- Who is asking -----------------------------------------------------
    // One call answers both "who is this" and "what do I query". An empty
    // .env.local is no longer an error: getSession() returns the demo viewer
    // and the in-memory adapter, and the feed ranks that instead of refusing.
    const session = await getSession();

    // --- Setup guard -------------------------------------------------------
    // Only one case is still unserveable: a real Supabase project is configured
    // but the service-role key is not, so the ranker cannot read the global
    // engagement counts it needs. Say which variable is missing, never echo the
    // value back. Demo mode skips this entirely, it has no keys at all.
    if (!session.isDemo && !hasServiceRoleKey()) {
      return NextResponse.json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY is not set. The ranker needs it to read engagement counts across every user. Add it to .env.local and restart the dev server. The README has the steps.',
        },
        { status: 500 },
      );
    }

    // --- Request body ------------------------------------------------------
    // An empty or malformed body is not an error, it just means "rank with the
    // defaults". The feed must still load if the client sends nothing at all.
    const body = await readBody(request);

    // --- Tuning ------------------------------------------------------------
    const weights = resolveWeights(body.weights);
    const rules = resolveRules(body.rules);
    const usingCustomWeights =
      differsFromDefaults(weights, WEIGHTS) || differsFromDefaults(rules, FEED_RULES);

    // --- Rank --------------------------------------------------------------
    // The ranker runs on the ELEVATED client, because it has to read engagement
    // counts across all users to know that a post has 400 likes, and RLS
    // deliberately blocks exactly that read for the anon key. The viewer's own
    // identity is still passed separately as viewerId, so personalisation is
    // unaffected: the elevated key buys global counts, not a different viewer.
    // In demo mode session.ranker is the in-memory adapter and there is no
    // security boundary to cross, but the pipeline call is character for
    // character the same.
    const feed: FeedResponse = await buildForYouFeed({
      db: session.ranker,
      viewerId: session.viewerId,
      weights,
      rules,
      seen: sanitizeSeen(body.seen),
      limit: sanitizeLimit(body.limit),
      usingCustomWeights,
      isDemo: session.isDemo,
    });

    // The ranker saw the private negative counts. The browser does not get to,
    // in demo mode either: the same redaction runs on both paths.
    //
    // diagnostics.isDemo was already set by buildForYouFeed from the same input,
    // so it is not re-applied here. The feed reads it to word its empty state
    // correctly, since "run npm run seed" is useless advice with no database.
    return NextResponse.json(
      { ...feed, posts: redactFeedPosts(feed.posts) },
      { status: 200 },
    );
  } catch (error) {
    // Real error to the server log, short sentence to the user.
    console.error('[api/feed] failed to build feed:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not build the feed. Check the server logs for details.',
      },
      { status: 500 },
    );
  }
}

/** Parses the body, tolerating empty, non-JSON and non-object payloads. */
async function readBody(request: Request): Promise<FeedRequest> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as FeedRequest;
    }
  } catch {
    // No body, or not JSON. Fall through to the defaults.
  }
  return {};
}

/**
 * True when the resolved values differ from the file defaults anywhere.
 *
 * Comparing the resolved objects rather than checking whether `weights` was
 * present means posting the defaults back does not light up the "custom
 * weights" badge, which is what someone who just hit Reset would expect.
 */
function differsFromDefaults(
  resolved: Weights | FeedRules,
  defaults: Weights | FeedRules,
): boolean {
  const a = resolved as Record<string, number>;
  const b = defaults as Record<string, number>;
  return Object.keys(b).some((key) => a[key] !== b[key]);
}

/** Post ids the client has already shown. Strings only, and capped. */
function sanitizeSeen(seen: unknown): string[] {
  if (!Array.isArray(seen)) return [];
  return seen
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 500);
}

function sanitizeLimit(limit: unknown): number | undefined {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return undefined;
  return Math.floor(limit);
}
