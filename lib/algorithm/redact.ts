/**
 * Strips the private negative counts out of anything headed for the browser.
 *
 * The ranker needs to know that four people muted an author, and it reads that
 * with the service-role key, which bypasses RLS. The RLS policy in
 * 0002_rls_and_storage.sql deliberately makes those four actions readable only
 * by the person who took them, so shipping the totals in an API response would
 * route around the policy: anyone could read "3 people reported this post" out
 * of the JSON.
 *
 * Likes are public on X. Mutes, blocks, reports and dismissals are not.
 */
import type { ActionCounts, ActionName, RankedPost } from '@/lib/types';

const PRIVATE_ACTIONS: readonly ActionName[] = [
  'mute_author',
  'block_author',
  'report',
  'not_interested',
];

export function publicCounts(counts: ActionCounts): ActionCounts {
  const safe: ActionCounts = { ...counts };
  for (const action of PRIVATE_ACTIONS) delete safe[action];
  return safe;
}

/**
 * Same idea one level up. The score breakdown carries a second copy of the
 * counts inside `signals`, which the debug panel renders, so that copy has to
 * be redacted too. The probabilities and contributions stay untouched: those
 * are derived numbers and showing them is the entire point of the panel.
 */
export function redactFeedPosts(posts: RankedPost[]): RankedPost[] {
  return posts.map((ranked) => ({
    ...ranked,
    counts: publicCounts(ranked.counts),
    breakdown: {
      ...ranked.breakdown,
      signals: {
        ...ranked.breakdown.signals,
        counts: publicCounts(ranked.breakdown.signals.counts),
      },
    },
  }));
}
