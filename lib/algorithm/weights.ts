/**
 * =============================================================================
 *  THE WEIGHTS FILE
 * =============================================================================
 *
 *  This is the file the whole project exists to expose.
 *
 *  Every number below is multiplied by a predicted probability and the results
 *  are added together. That sum is a post's score. Higher score, higher in the
 *  feed. There is no other magic anywhere in this codebase.
 *
 *      score = sum over every action of ( P(action) * WEIGHTS[action] )
 *
 *  Change a number, save, refresh the feed. The order changes. That is the
 *  entire point. If you would rather not edit code, the same numbers are
 *  exposed as sliders at /settings/algorithm.
 *
 *  These values are modelled on the shape of X's published scoring config: a
 *  small positive weight on cheap actions, a much larger one on actions that
 *  cost the user something, and negative weights an order of magnitude larger
 *  than any positive one. They are NOT X's production numbers. Those were not
 *  part of the open-source release. See "What This Is and Isn't" in the README.
 * =============================================================================
 */

import type { FeedRules, Weights } from '@/lib/types';

export const WEIGHTS: Weights = {
  // ---------------------------------------------------------------------------
  // POSITIVE ACTIONS
  // Cheap to perform, so they get small weights. Expensive to perform, so they
  // get large ones. A like costs a thumb twitch. A reply costs a sentence.
  // ---------------------------------------------------------------------------

  /**
   * The cheapest signal there is, and the reference point for everything else.
   * Raise it and the feed fills with mass-appeal posts that are easy to like
   * and easy to forget. Lower it toward 0 and popularity stops mattering.
   */
  like: 1.0,

  /**
   * Someone typed something back. Weighted far above likes on purpose: a reply
   * means the post started a conversation rather than just passing by.
   * Raise it and the feed gets argumentative. Lower it and it gets quiet.
   */
  reply: 13.5,

  /**
   * The viewer put their own name on it. Stronger than a like because it is a
   * public endorsement. Raise it and the feed chases shareable takes.
   */
  repost: 8.0,

  /**
   * A private save. Nobody sees it, so it is honest. Useful, reference-grade
   * posts score well here. Raise it for a more practical, less loud feed.
   */
  bookmark: 6.0,

  /**
   * Sent off-platform. Rare, and rarely accidental. Raise it and the feed
   * favours posts worth showing to someone who is not on this app.
   */
  share: 9.0,

  /**
   * The viewer tapped through to see who wrote this. A signal about the author
   * more than the post. Raise it to surface interesting accounts over
   * interesting individual posts.
   */
  profile_click: 4.0,

  /**
   * Watched the whole reel. The strongest positive signal available on video,
   * because it is measured in seconds of a person's life rather than a tap.
   * Raise it and video crowds out text. Lower it to rebalance toward text.
   */
  video_watch_complete: 20.0,

  /**
   * The viewer followed the author because of this post. The most expensive
   * positive action in the set: it changes what they see for months.
   * Raise it and the feed becomes a discovery engine for new accounts.
   */
  follow_author: 24.0,

  // ---------------------------------------------------------------------------
  // NEGATIVE ACTIONS
  //
  // These are large on purpose, and the size gap is the single most important
  // property of this file. A platform that optimises for engagement alone will
  // happily show you things that make you want to leave, because outrage is
  // engaging. Making one block cost more than dozens of likes is how a ranker
  // optimises for someone still being here next month instead of today.
  //
  // If you set every one of these to 0 you get a pure engagement-maximising
  // feed. It is worth doing once, just to see what happens.
  // ---------------------------------------------------------------------------

  /**
   * "Stop showing me this person." Quieter than a block but the same message.
   * Make this more negative to punish authors that annoy people.
   */
  mute_author: -40.0,

  /**
   * Catastrophic. One predicted block should outweigh dozens of predicted
   * likes, and at -75 against +1 it does. This number is the ceiling on how
   * much reach any amount of engagement can buy an author people dislike.
   */
  block_author: -75.0,

  /**
   * A report is a claim that the post should not exist, not just that the
   * viewer dislikes it. Ranked as the worst outcome in the set.
   */
  report: -90.0,

  /**
   * Explicit "not interested" feedback. Milder than a mute because it is aimed
   * at the post rather than the person.
   */
  not_interested: -30.0,

  /**
   * Scrolled past the reel in the first couple of seconds. Individually weak,
   * which is why the number is small, but it fires constantly, so it is the
   * main brake on bad video. Make it more negative for a stricter video feed.
   */
  video_skip_early: -6.0,
};

/**
 * =============================================================================
 *  FEED SHAPING RULES
 * =============================================================================
 *
 *  Scoring decides what is good. These decide what actually ships. They run
 *  in home-mixer.ts after every candidate has a score, and they exist because
 *  a feed of the twelve highest-scoring posts is usually twelve posts by three
 *  people about one thing.
 * =============================================================================
 */
export const FEED_RULES: FeedRules = {
  /**
   * Multiplier applied to posts from accounts the viewer does not follow.
   * 1.0 means no penalty and strangers compete on equal footing.
   * 0.5 would mean a stranger needs twice the score to hold the same slot.
   */
  outOfNetworkDiscount: 0.85,

  /**
   * Hard cap on how many posts by the same author may appear back to back.
   * Set to 1 and no author ever appears twice in a row.
   */
  maxConsecutiveSameAuthor: 2,

  /**
   * How fast a post decays. At 6 hours, a post is worth half as much after
   * six hours as it was when it was new, a quarter after twelve, and so on.
   * Raise it to 720 and week-old posts compete with fresh ones.
   */
  recencyHalfLifeHours: 6,

  /**
   * How many posts the candidate pipeline pulls before ranking. The real
   * system never ranks the whole database and neither does this one.
   */
  candidatePoolSize: 200,

  /**
   * Target share of the candidate pool that comes from accounts you follow.
   * 0.5 means half your candidates are in-network, half are discovery.
   */
  inNetworkShare: 0.5,

  /**
   * Blending: cap on consecutive posts of the same media type, so reels and
   * text interleave instead of clustering into a video block and a text block.
   */
  maxConsecutiveSameMedia: 3,
};

/**
 * Merges a viewer's tuned values over the defaults, dropping anything that is
 * not a finite number. The /settings/algorithm page posts its localStorage
 * values through here, so a corrupted localStorage cannot break the ranker.
 */
export function resolveWeights(overrides?: Partial<Weights>): Weights {
  if (!overrides) return { ...WEIGHTS };
  const merged = { ...WEIGHTS };
  for (const [key, value] of Object.entries(overrides)) {
    if (key in merged && typeof value === 'number' && Number.isFinite(value)) {
      merged[key as keyof Weights] = value;
    }
  }
  return merged;
}

/** Same idea as resolveWeights, for the shaping rules. */
export function resolveRules(overrides?: Partial<FeedRules>): FeedRules {
  if (!overrides) return { ...FEED_RULES };
  const merged = { ...FEED_RULES };
  for (const [key, value] of Object.entries(overrides)) {
    if (key in merged && typeof value === 'number' && Number.isFinite(value)) {
      merged[key as keyof FeedRules] = value;
    }
  }
  return merged;
}

/**
 * Slider bounds for /settings/algorithm. Kept next to the weights so that
 * adding an action means editing exactly one file.
 */
export const WEIGHT_RANGES: Record<keyof Weights, { min: number; max: number; step: number }> = {
  like: { min: 0, max: 50, step: 0.5 },
  reply: { min: 0, max: 50, step: 0.5 },
  repost: { min: 0, max: 50, step: 0.5 },
  bookmark: { min: 0, max: 50, step: 0.5 },
  share: { min: 0, max: 50, step: 0.5 },
  profile_click: { min: 0, max: 50, step: 0.5 },
  video_watch_complete: { min: 0, max: 50, step: 0.5 },
  follow_author: { min: 0, max: 50, step: 0.5 },
  mute_author: { min: -150, max: 0, step: 1 },
  block_author: { min: -150, max: 0, step: 1 },
  report: { min: -150, max: 0, step: 1 },
  not_interested: { min: -150, max: 0, step: 1 },
  video_skip_early: { min: -150, max: 0, step: 1 },
};

export const RULE_RANGES: Record<keyof FeedRules, { min: number; max: number; step: number }> = {
  outOfNetworkDiscount: { min: 0, max: 1.5, step: 0.05 },
  maxConsecutiveSameAuthor: { min: 1, max: 10, step: 1 },
  recencyHalfLifeHours: { min: 0.5, max: 720, step: 0.5 },
  candidatePoolSize: { min: 20, max: 500, step: 10 },
  inNetworkShare: { min: 0, max: 1, step: 0.05 },
  maxConsecutiveSameMedia: { min: 1, max: 20, step: 1 },
};
