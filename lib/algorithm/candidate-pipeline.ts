/**
 * =============================================================================
 *  CANDIDATE PIPELINE  -  what are we even ranking?
 * =============================================================================
 *
 *  Ranking is expensive, so you never rank the whole database. You pull a few
 *  hundred posts that stand a chance, and rank those. This file decides which
 *  few hundred.
 *
 *  X pulls from two kinds of source, and so does this:
 *
 *    IN-NETWORK       posts by accounts the viewer follows
 *    OUT-OF-NETWORK   posts by accounts they do not follow
 *
 *  The real system finds out-of-network candidates with embedding search
 *  (Phoenix Retrieval) and engagement-graph clustering (SimClusters). Neither
 *  fits in a Next.js route handler, so out-of-network here is two much simpler
 *  things that capture the same intuition:
 *
 *    AFFINITY   authors this viewer has liked, replied to or reposted before,
 *               but does not follow. "You keep engaging with this person."
 *    POPULAR    recent posts with the most engagement overall. "Everyone else
 *               is looking at this." The cold-start fallback.
 *
 *  Nothing here scores anything. This file only decides who gets to compete.
 * =============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionName, Candidate, CandidateSource, FeedRules } from '@/lib/types';
import { POSITIVE_ACTIONS } from '@/lib/types';
import { hydratePosts } from './thunder';

/**
 * Everything we know about the viewer, gathered once per feed request.
 * Phoenix reads from this for every candidate, so it must not hit the database.
 */
export interface ViewerContext {
  /** Null when nobody is signed in. The feed still works, it is just popular-only. */
  viewerId: string | null;
  /** Author ids the viewer follows. */
  following: Set<string>;
  /** Authors the viewer has blocked. Their posts never reach the feed. */
  blockedAuthors: Set<string>;
  /** Authors the viewer has muted. Same treatment, softer intent. */
  mutedAuthors: Set<string>;
  /** authorId -> how many positive engagements this viewer has given them. */
  affinity: Map<string, number>;
  /** postId -> which actions this viewer has already taken, for the UI. */
  viewerActionsByPost: Map<string, ActionName[]>;
  /** Posts the viewer explicitly dismissed. */
  dismissedPosts: Set<string>;
}

/**
 * One round trip per relationship type, then everything Phoenix needs is in
 * memory. Runs before candidate gathering because "do I follow this author"
 * decides which bucket a post lands in.
 */
export async function buildViewerContext(
  db: SupabaseClient,
  viewerId: string | null,
): Promise<ViewerContext> {
  const ctx: ViewerContext = {
    viewerId,
    following: new Set(),
    blockedAuthors: new Set(),
    mutedAuthors: new Set(),
    affinity: new Map(),
    viewerActionsByPost: new Map(),
    dismissedPosts: new Set(),
  };

  if (!viewerId) return ctx;

  const [followsResult, engagementResult] = await Promise.all([
    db.from('follows').select('following_id').eq('follower_id', viewerId),
    // Every action this viewer has ever taken, with the author of the post it
    // was taken on. That single join gives us affinity, blocks and mutes.
    db
      .from('engagements')
      .select('post_id, action, post:posts!engagements_post_id_fkey(author_id)')
      .eq('user_id', viewerId)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  for (const row of followsResult.data ?? []) {
    ctx.following.add(row.following_id as string);
  }

  const positive = new Set<string>(POSITIVE_ACTIONS);

  for (const row of engagementResult.data ?? []) {
    const action = row.action as ActionName;
    const postId = row.post_id as string;
    const embedded = row.post as unknown;
    const authorId = Array.isArray(embedded)
      ? (embedded[0] as { author_id: string } | undefined)?.author_id
      : (embedded as { author_id: string } | null)?.author_id;

    const existing = ctx.viewerActionsByPost.get(postId) ?? [];
    if (!existing.includes(action)) existing.push(action);
    ctx.viewerActionsByPost.set(postId, existing);

    if (!authorId) continue;

    if (positive.has(action)) {
      ctx.affinity.set(authorId, (ctx.affinity.get(authorId) ?? 0) + 1);
    }
    if (action === 'block_author') ctx.blockedAuthors.add(authorId);
    if (action === 'mute_author') ctx.mutedAuthors.add(authorId);
    if (action === 'not_interested') ctx.dismissedPosts.add(postId);
  }

  return ctx;
}

/**
 * Pulls the candidate pool.
 *
 * Budget split follows `rules.inNetworkShare`: at the default 0.5, half the
 * pool is people you follow and half is discovery. Set it to 1.0 and you have
 * rebuilt a following-only timeline.
 */
export async function gatherCandidates(
  db: SupabaseClient,
  ctx: ViewerContext,
  rules: FeedRules,
): Promise<{ candidates: Candidate[]; counts: Record<CandidateSource, number> }> {
  const poolSize = Math.max(10, Math.floor(rules.candidatePoolSize));
  const inNetworkBudget = Math.round(poolSize * clamp01(rules.inNetworkShare));
  const outOfNetworkBudget = poolSize - inNetworkBudget;

  // Which authors count as "affinity" out-of-network: engaged with, not followed.
  const affinityAuthors = [...ctx.affinity.entries()]
    .filter(([authorId]) => !ctx.following.has(authorId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([authorId]) => authorId);

  const following = [...ctx.following];

  // Three independent reads. Each returns ids only; Thunder does the hydration.
  const [inNetworkIds, affinityIds, popularIds] = await Promise.all([
    following.length > 0 && inNetworkBudget > 0
      ? selectRecentPostIds(db, { authorIds: following, limit: inNetworkBudget })
      : Promise.resolve([]),
    affinityAuthors.length > 0 && outOfNetworkBudget > 0
      ? selectRecentPostIds(db, {
          authorIds: affinityAuthors,
          limit: Math.ceil(outOfNetworkBudget / 2),
        })
      : Promise.resolve([]),
    // The popular source is deliberately generous: it backfills whatever the
    // other two sources could not supply, which is everything on a fresh account.
    selectRecentPostIds(db, { limit: poolSize }),
  ]);

  // First source to claim a post id owns it, so a post never appears twice.
  const claimed = new Map<string, CandidateSource>();
  for (const id of inNetworkIds) claimed.set(id, 'in_network');
  for (const id of affinityIds) {
    if (!claimed.has(id)) claimed.set(id, 'out_of_network_affinity');
  }
  for (const id of popularIds) {
    if (claimed.size >= poolSize) break;
    if (!claimed.has(id)) claimed.set(id, 'out_of_network_popular');
  }

  const hydrated = await hydratePosts(db, [...claimed.keys()]);

  const candidates: Candidate[] = [];
  const sourceCounts: Record<CandidateSource, number> = {
    in_network: 0,
    out_of_network_affinity: 0,
    out_of_network_popular: 0,
  };

  for (const [postId, declaredSource] of claimed) {
    const entry = hydrated.get(postId);
    if (!entry) continue;

    // Replies live in the same table as top-level posts. They belong on the
    // post page, not in the main feed.
    if (entry.post.reply_to) continue;

    // A post by someone you follow is in-network no matter which query found it.
    const source: CandidateSource = ctx.following.has(entry.post.author_id)
      ? 'in_network'
      : declaredSource === 'in_network'
        ? 'out_of_network_popular'
        : declaredSource;

    sourceCounts[source] += 1;
    candidates.push({
      post: entry.post,
      source,
      counts: entry.counts,
      // Thunder does not know about impressions; Phoenix estimates them.
      impressions: 0,
    });
  }

  return { candidates, counts: sourceCounts };
}

/**
 * Recency-ordered post ids, optionally restricted to a set of authors.
 *
 * Note this orders by created_at, not by engagement. "Popular" here means
 * "recent, and then scored on engagement by Phoenix", which is the same
 * ordering of concerns the real pipeline uses: retrieval is cheap and broad,
 * ranking is where quality gets decided.
 */
async function selectRecentPostIds(
  db: SupabaseClient,
  opts: { authorIds?: string[]; limit: number },
): Promise<string[]> {
  let query = db
    .from('posts')
    .select('id')
    .is('reply_to', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit);

  if (opts.authorIds) query = query.in('author_id', opts.authorIds);

  const { data } = await query;
  return (data ?? []).map((row) => row.id as string);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
