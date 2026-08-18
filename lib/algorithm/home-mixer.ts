/**
 * =============================================================================
 *  HOME MIXER  -  the orchestrator
 * =============================================================================
 *
 *  Everything else in this folder does one job. This file calls them in order
 *  and then fixes the things that pure scoring gets wrong.
 *
 *      candidate-pipeline   who is eligible
 *      thunder              hand me those posts, fast
 *      phoenix              score each one
 *      ->  this file        now make it an actual feed
 *
 *  The last step is not a formality. The twelve highest-scoring posts are
 *  almost always twelve posts by three people about one thing. Four rules fix
 *  that, and they run in this order:
 *
 *      1. VISIBILITY   drop blocked authors, muted authors, dismissed posts
 *      2. DEDUPE       drop anything already seen this session
 *      3. DIVERSITY    no more than N posts in a row by the same author
 *      4. BLENDING     no more than N reels in a row, interleave with text
 *
 *  Scoring decides what is good. These decide what ships.
 * =============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Candidate,
  FeedResponse,
  FeedRules,
  RankedPost,
  ScoreBreakdown,
  Weights,
} from '@/lib/types';
import { buildViewerContext, gatherCandidates, type ViewerContext } from './candidate-pipeline';
import { scoreCandidate } from './phoenix';
import { thunder } from './thunder';

export interface MixerInput {
  db: SupabaseClient;
  viewerId: string | null;
  weights: Weights;
  rules: FeedRules;
  /** Post ids the client has already rendered this session. */
  seen?: string[];
  limit?: number;
  usingCustomWeights?: boolean;
  /** True when `db` is the in-memory demo adapter. Reported, never branched on. */
  isDemo?: boolean;
}

export async function buildForYouFeed(input: MixerInput): Promise<FeedResponse> {
  const startedAt = Date.now();
  const { db, viewerId, weights, rules } = input;
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const seen = new Set(input.seen ?? []);
  const thunderBefore = thunder.stats();

  // --- Step 1: who is this person -----------------------------------------
  const ctx = await buildViewerContext(db, viewerId);

  // --- Step 2: what could we possibly show them ---------------------------
  const { candidates, counts: sourceCounts } = await gatherCandidates(db, ctx, rules);

  // --- Step 3: visibility filtering ---------------------------------------
  // Runs before scoring, not after. There is no point spending compute on a
  // post that is not allowed to appear, and no score is high enough to
  // override a block. In the real system this is a separate service with its
  // own rules engine; here it is one predicate.
  const visible: Candidate[] = [];
  let droppedByVisibility = 0;
  let droppedBySeen = 0;

  for (const candidate of candidates) {
    if (!passesVisibility(candidate, ctx)) {
      droppedByVisibility += 1;
      continue;
    }
    if (seen.has(candidate.post.id)) {
      droppedBySeen += 1;
      continue;
    }
    visible.push(candidate);
  }

  // --- Step 4: score everything -------------------------------------------
  const scored = visible.map((candidate) => {
    const breakdown = scoreCandidate(candidate, ctx, weights, rules);
    applyShaping(breakdown, candidate, rules);
    return { candidate, breakdown };
  });

  scored.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);

  // --- Step 5: diversity and blending -------------------------------------
  const ordered = selectWithDiversity(scored, rules, limit);

  // --- Step 6: hand it to the UI ------------------------------------------
  const posts: RankedPost[] = ordered.map(({ candidate, breakdown }) => ({
    post: candidate.post,
    source: candidate.source,
    score: breakdown.finalScore,
    breakdown,
    viewerActions: ctx.viewerActionsByPost.get(candidate.post.id) ?? [],
    counts: candidate.counts,
  }));

  // Write the scores to the cache table. Nothing reads it on the request path;
  // it is there so you can open the Supabase table editor and see the ranker's
  // output for yourself. Failure here must never break the feed.
  void cacheSignals(db, viewerId, posts);

  const thunderAfter = thunder.stats();

  return {
    posts,
    diagnostics: {
      candidatesConsidered: candidates.length,
      inNetwork: sourceCounts.in_network,
      outOfNetwork:
        sourceCounts.out_of_network_affinity + sourceCounts.out_of_network_popular,
      droppedByVisibility,
      droppedBySeen,
      thunderHits: thunderAfter.hits - thunderBefore.hits,
      thunderMisses: thunderAfter.misses - thunderBefore.misses,
      tookMs: Date.now() - startedAt,
      usingCustomWeights: Boolean(input.usingCustomWeights),
      isDemo: Boolean(input.isDemo),
    },
  };
}

/**
 * VISIBILITY FILTERING
 *
 * Separate from ranking on purpose, and that separation is one of the real
 * system's better ideas. Ranking answers "how good is this". Visibility answers
 * "is this allowed". Mixing them means a sufficiently engaging post could
 * out-score a block, which is exactly the failure mode nobody wants.
 */
function passesVisibility(candidate: Candidate, ctx: ViewerContext): boolean {
  const authorId = candidate.post.author_id;
  if (ctx.blockedAuthors.has(authorId)) return false;
  if (ctx.mutedAuthors.has(authorId)) return false;
  if (ctx.dismissedPosts.has(candidate.post.id)) return false;
  return true;
}

/**
 * Score shaping that belongs to the mixer rather than to Phoenix.
 *
 * Right now that is one thing: the out-of-network discount. A stranger's post
 * has to clear a higher bar than someone you chose to follow. The real system
 * applies the same discount for the same reason.
 *
 * Every adjustment writes a note, so the debug panel can explain the gap
 * between the raw score and the final one instead of just showing a number.
 */
function applyShaping(
  breakdown: ScoreBreakdown,
  candidate: Candidate,
  rules: FeedRules,
): void {
  if (candidate.source === 'in_network') return;

  const discount = rules.outOfNetworkDiscount;
  breakdown.finalScore = breakdown.rawScore * discount;
  breakdown.notes.push(
    `Out of network: score multiplied by ${discount.toFixed(2)} (you do not follow @${candidate.post.author.username}).`,
  );
}

/**
 * AUTHOR DIVERSITY and BLENDING, in one pass.
 *
 * Greedy: walk the score-sorted list and take the best post that does not break
 * a rule. If every remaining post breaks a rule, take the best one anyway
 * rather than returning a short feed. A rule that can empty your timeline is
 * not a rule, it is a bug.
 */
function selectWithDiversity<T extends { candidate: Candidate; breakdown: ScoreBreakdown }>(
  scored: T[],
  rules: FeedRules,
  limit: number,
): T[] {
  const maxAuthor = Math.max(1, Math.floor(rules.maxConsecutiveSameAuthor));
  const maxMedia = Math.max(1, Math.floor(rules.maxConsecutiveSameMedia));

  const remaining = [...scored];
  const output: T[] = [];

  let lastAuthor: string | null = null;
  let authorRun = 0;
  let lastMediaKind: 'reel' | 'text' | null = null;
  let mediaRun = 0;

  while (output.length < limit && remaining.length > 0) {
    let pickedIndex = remaining.findIndex((item) => {
      const authorId = item.candidate.post.author_id;
      const mediaKind = item.candidate.post.media_type === 'video' ? 'reel' : 'text';

      const authorOk = !(authorId === lastAuthor && authorRun >= maxAuthor);
      const mediaOk = !(mediaKind === lastMediaKind && mediaRun >= maxMedia);
      return authorOk && mediaOk;
    });

    // Nothing satisfies both rules. Ship the highest scorer rather than a
    // shorter feed, and note why.
    if (pickedIndex === -1) {
      pickedIndex = 0;
      remaining[0].breakdown.notes.push(
        'Diversity rules could not be satisfied without shortening the feed, so this post was placed anyway.',
      );
    }

    const [picked] = remaining.splice(pickedIndex, 1);
    const authorId = picked.candidate.post.author_id;
    const mediaKind = picked.candidate.post.media_type === 'video' ? 'reel' : 'text';

    authorRun = authorId === lastAuthor ? authorRun + 1 : 1;
    lastAuthor = authorId;
    mediaRun = mediaKind === lastMediaKind ? mediaRun + 1 : 1;
    lastMediaKind = mediaKind;

    output.push(picked);
  }

  return output;
}

/** Best-effort write to the user_signals cache table. Never throws. */
async function cacheSignals(
  db: SupabaseClient,
  viewerId: string | null,
  posts: RankedPost[],
): Promise<void> {
  if (!viewerId || posts.length === 0) return;
  try {
    await db.from('user_signals').upsert(
      posts.map((p) => ({
        user_id: viewerId,
        post_id: p.post.id,
        score: Number(p.score.toFixed(6)),
        computed_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,post_id' },
    );
  } catch {
    // The feed is already rendered. A failed cache write is not the user's
    // problem, and this table is a debugging convenience, not a dependency.
  }
}
