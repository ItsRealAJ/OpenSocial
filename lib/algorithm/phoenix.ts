/**
 * =============================================================================
 *  PHOENIX  -  the ranker
 * =============================================================================
 *
 *  This is the most important file in the project. Read it top to bottom and
 *  you will know exactly why any post is where it is.
 *
 *  ---------------------------------------------------------------------------
 *  WHAT THE REAL ONE DOES
 *  ---------------------------------------------------------------------------
 *  X's Phoenix is a Grok-derived transformer. For each candidate post it
 *  outputs a probability for each of roughly twenty user actions: will this
 *  person like it, reply to it, watch it to the end, block the author. Those
 *  probabilities are multiplied by per-action weights and summed into one
 *  number, and that number is the ranking.
 *
 *  ---------------------------------------------------------------------------
 *  WHAT THIS ONE DOES
 *  ---------------------------------------------------------------------------
 *  Exactly the same arithmetic, with the transformer replaced by thirteen small
 *  hand-written functions. Same pipeline shape, same multi-action structure,
 *  same weighted sum, same "one block outweighs many likes" property.
 *
 *      score = sum over every action of ( P(action) * WEIGHTS[action] )
 *
 *  The tradeoff is deliberate and it runs in both directions. A transformer
 *  would predict better than these heuristics ever will. But nobody, including
 *  the people who trained it, can tell you why it ranked a specific post
 *  seventh. Here you can, and the app shows you: tap the score chip on any post.
 *
 *  ---------------------------------------------------------------------------
 *  HOW A PROBABILITY IS ARRIVED AT
 *  ---------------------------------------------------------------------------
 *  Every predictor is the same three steps, in the same order:
 *
 *    1. BASE RATE   How often does this action actually happen on this post?
 *                   Engagements divided by estimated impressions, smoothed
 *                   toward a prior so a post with 1 view and 1 like does not
 *                   read as a 100% like rate.
 *
 *    2. MULTIPLIERS Adjust for this particular viewer and this particular
 *                   moment. Do they follow the author. Have they engaged with
 *                   this author before. How old is the post. Is it a video.
 *
 *    3. CLAMP       Squash back into 0..1, because it is a probability.
 *
 *  Each predictor is its own named function so you can read one action's logic
 *  without reading any of the others.
 * =============================================================================
 */

import type {
  ActionContribution,
  ActionName,
  Candidate,
  FeedRules,
  MediaType,
  PhoenixSignals,
  ScoreBreakdown,
  Weights,
} from '@/lib/types';
import { ALL_ACTIONS } from '@/lib/types';
import type { ViewerContext } from './candidate-pipeline';

/* ===========================================================================
   SECTION 1  -  Priors
   ===========================================================================
   The base rate we assume for an action before we have seen any evidence.

   These are hand-set to be plausible, not measured. They are not X's numbers
   and they are not derived from any dataset. They exist to give a brand-new
   post with zero engagement a sane starting score, and to stop a post with
   three impressions from dominating the feed on a fluke.

   The ordering between them is the part that carries real information: likes
   are roughly ten times as common as replies, blocks are vanishingly rare.
   =========================================================================== */

const PRIOR_RATE: Record<ActionName, number> = {
  like: 0.03,
  reply: 0.004,
  repost: 0.006,
  bookmark: 0.005,
  share: 0.002,
  profile_click: 0.008,
  video_watch_complete: 0.22,
  follow_author: 0.0015,
  mute_author: 0.0006,
  block_author: 0.0003,
  report: 0.0001,
  not_interested: 0.002,
  video_skip_early: 0.35,
};

/**
 * How much evidence it takes to move away from the prior, measured in
 * impressions. At 40, a post needs about forty views before its own numbers
 * matter more than the prior does.
 *
 * Lower it and the feed reacts fast and noisily to brand-new posts. Raise it
 * and the feed is stable but slow to notice a hit.
 */
const PRIOR_STRENGTH = 40;

/* ===========================================================================
   SECTION 2  -  Shared building blocks
   ===========================================================================
   Four small functions that most predictors reuse. Read these once and the
   thirteen predictors below are almost self-explanatory.
   =========================================================================== */

/**
 * We do not log impressions. Doing it properly means a row every time a post
 * scrolls past anyone, which is more rows than everything else combined.
 *
 * So we estimate. The assumption: a post gets roughly 15 views per engagement,
 * plus a floor of 30 views that any post in the pool has had. Both numbers are
 * arbitrary and clearly labelled as such. What matters is that the estimate is
 * monotonic in engagement and never zero, because it is a denominator.
 *
 * If you ever add a real impressions table, this is the only function that has
 * to change.
 */
export function estimateImpressions(candidate: Candidate): number {
  const totalEngagements = Object.values(candidate.counts).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );
  return 30 + totalEngagements * 15;
}

/**
 * Laplace-style smoothing. Blends what we observed with what we expected,
 * weighted by how much evidence we have.
 *
 *     rate = (observed + prior * strength) / (impressions + strength)
 *
 * One like on 2 impressions gives roughly the prior. Four hundred likes on
 * 6000 impressions gives roughly the observed rate. Nothing in between jumps.
 */
function smoothedRate(observed: number, impressions: number, prior: number): number {
  return (observed + prior * PRIOR_STRENGTH) / (impressions + PRIOR_STRENGTH);
}

/**
 * Exponential time decay. A post is worth half as much after one half-life,
 * a quarter after two, and so on.
 *
 * This is the knob that turns a ranked feed into a chronological one. Set
 * `recencyHalfLifeHours` very low and only fresh posts survive. Set it to a
 * month and the algorithm stops caring when something was posted.
 */
function recencyMultiplier(ageHours: number, halfLifeHours: number): number {
  const halfLife = Math.max(0.1, halfLifeHours);
  return Math.pow(0.5, Math.max(0, ageHours) / halfLife);
}

/**
 * How much more likely is this viewer to engage because they follow the author
 * or have engaged with them before?
 *
 * Following is worth a flat 1.8x. Past engagement adds on top with diminishing
 * returns, so the tenth like you give someone moves the needle less than the
 * first. Caps out around 3.5x total, because no relationship should be able to
 * dominate the score on its own.
 */
function relationshipMultiplier(signals: PhoenixSignals): number {
  const follow = signals.viewerFollowsAuthor ? 1.8 : 1.0;
  const affinity = 1 + Math.log1p(signals.viewerAffinityToAuthor) * 0.35;
  return Math.min(3.5, follow * affinity);
}

/**
 * Media changes the odds. Video gets watched and skipped, images get liked,
 * text gets replied to. Rather than bury this inside every predictor, each one
 * asks for its own multiplier here.
 */
function mediaMultiplier(action: ActionName, mediaType: MediaType): number {
  const table: Partial<Record<ActionName, Record<MediaType, number>>> = {
    like: { none: 0.9, image: 1.25, video: 1.15 },
    reply: { none: 1.4, image: 0.9, video: 0.75 },
    repost: { none: 1.0, image: 1.2, video: 1.1 },
    bookmark: { none: 1.15, image: 1.0, video: 0.9 },
    share: { none: 0.85, image: 1.1, video: 1.5 },
    profile_click: { none: 1.0, image: 1.1, video: 1.2 },
    // The two video-only actions are zeroed out on everything else, below.
    video_watch_complete: { none: 0, image: 0, video: 1 },
    video_skip_early: { none: 0, image: 0, video: 1 },
  };
  return table[action]?.[mediaType] ?? 1;
}

/** Probabilities are probabilities. */
function clamp(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/* ===========================================================================
   SECTION 3  -  The thirteen predictors
   ===========================================================================
   One function per action. Each one is short on purpose. If you disagree with
   how the algorithm treats replies, there is exactly one function to argue
   with, and it is eight lines long.
   =========================================================================== */

/* --- Positive actions ---------------------------------------------------- */

/**
 * LIKE. The workhorse. Almost entirely driven by the post's observed like rate,
 * nudged by relationship and heavily by recency, because likes pile up over
 * time and an old post with a big number is not necessarily a good post now.
 */
function predictLike(s: PhoenixSignals, rules: FeedRules): number {
  const base = smoothedRate(s.counts.like ?? 0, s.impressions, PRIOR_RATE.like);
  return clamp(
    base *
      relationshipMultiplier(s) *
      mediaMultiplier('like', s.mediaType) *
      recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours),
  );
}

/**
 * REPLY. Text posts draw replies, video does not. Relationship matters more
 * here than anywhere else: people argue with accounts they follow.
 */
function predictReply(s: PhoenixSignals, rules: FeedRules): number {
  const base = smoothedRate(s.counts.reply ?? 0, s.impressions, PRIOR_RATE.reply);
  return clamp(
    base *
      relationshipMultiplier(s) *
      mediaMultiplier('reply', s.mediaType) *
      recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours),
  );
}

/**
 * REPOST. A public endorsement, so it tracks the observed repost rate closely
 * and decays fast: reposting a two-day-old post is rare.
 */
function predictRepost(s: PhoenixSignals, rules: FeedRules): number {
  const base = smoothedRate(s.counts.repost ?? 0, s.impressions, PRIOR_RATE.repost);
  return clamp(
    base *
      relationshipMultiplier(s) *
      mediaMultiplier('repost', s.mediaType) *
      recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours * 0.6),
  );
}

/**
 * BOOKMARK. The one positive action that does not decay much. A useful post is
 * still worth saving tomorrow, so recency is applied at a quarter strength.
 */
function predictBookmark(s: PhoenixSignals, rules: FeedRules): number {
  const base = smoothedRate(s.counts.bookmark ?? 0, s.impressions, PRIOR_RATE.bookmark);
  return clamp(
    base *
      relationshipMultiplier(s) *
      mediaMultiplier('bookmark', s.mediaType) *
      recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours * 4),
  );
}

/** SHARE. Rare, and video travels furthest off-platform. */
function predictShare(s: PhoenixSignals, rules: FeedRules): number {
  const base = smoothedRate(s.counts.share ?? 0, s.impressions, PRIOR_RATE.share);
  return clamp(
    base *
      relationshipMultiplier(s) *
      mediaMultiplier('share', s.mediaType) *
      recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours),
  );
}

/**
 * PROFILE CLICK. A signal about the author, not the post, so it works
 * backwards from the usual pattern: you are much likelier to tap through on
 * someone you do NOT already follow, because you already know the ones you do.
 */
function predictProfileClick(s: PhoenixSignals, rules: FeedRules): number {
  const base = smoothedRate(
    s.counts.profile_click ?? 0,
    s.impressions,
    PRIOR_RATE.profile_click,
  );
  const curiosity = s.viewerFollowsAuthor ? 0.6 : 1.6;
  return clamp(
    base *
      curiosity *
      mediaMultiplier('profile_click', s.mediaType) *
      recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours * 2),
  );
}

/**
 * VIDEO WATCH COMPLETE. Zero for anything that is not a video, which is what
 * makes `video_watch_complete: 20.0` in the weights file safe: a huge weight
 * multiplied by zero is still zero, so text posts are not punished by it.
 *
 * Completion rate is mostly a property of the video itself, so relationship
 * only nudges it. Short posts by people you follow do not magically get watched
 * to the end more often.
 */
function predictVideoWatchComplete(s: PhoenixSignals, rules: FeedRules): number {
  if (s.mediaType !== 'video') return 0;
  const base = smoothedRate(
    s.counts.video_watch_complete ?? 0,
    s.impressions,
    PRIOR_RATE.video_watch_complete,
  );
  const nudge = 1 + (relationshipMultiplier(s) - 1) * 0.25;
  return clamp(base * nudge * recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours * 3));
}

/**
 * FOLLOW AUTHOR. Structurally impossible if the viewer already follows them,
 * so this returns 0 for in-network posts. That is not a rounding decision, it
 * is what makes the +24 weight a discovery lever rather than a loyalty bonus.
 */
function predictFollowAuthor(s: PhoenixSignals, rules: FeedRules): number {
  if (s.viewerFollowsAuthor) return 0;
  const base = smoothedRate(
    s.counts.follow_author ?? 0,
    s.impressions,
    PRIOR_RATE.follow_author,
  );
  // Someone you keep engaging with but have not followed is the likeliest
  // follow there is. That is the entire out-of-network affinity thesis.
  const warmth = 1 + Math.min(2, s.viewerAffinityToAuthor * 0.4);
  return clamp(base * warmth * recencyMultiplier(s.ageHours, rules.recencyHalfLifeHours * 2));
}

/* --- Negative actions ----------------------------------------------------
   The negatives are where a ranker earns its keep, so read these closely.

   Three properties they share:

     - They barely decay. Something that made people block the author two days
       ago will make you block them today. Time does not launder a bad post.
     - Relationship works in reverse. You do not block people you follow; you
       block strangers the algorithm pushed at you. So out-of-network posts
       carry a higher predicted negative rate than in-network ones.
     - The observed rate dominates. If real users muted this author, that is
       the strongest evidence in the system and the prior should not soften it.
   ------------------------------------------------------------------------- */

/**
 * MUTE AUTHOR. Doubled for strangers, quartered for accounts you follow.
 */
function predictMuteAuthor(s: PhoenixSignals): number {
  const base = smoothedRate(
    s.counts.mute_author ?? 0,
    s.impressions,
    PRIOR_RATE.mute_author,
  );
  return clamp(base * strangerRisk(s));
}

/**
 * BLOCK AUTHOR. The action the whole negative-weight design exists for.
 *
 * At weight -75, a 1% predicted block probability costs 0.75 points, which is
 * roughly what a 75% predicted like probability earns. That ratio is the
 * mechanism by which a feed can be optimised for people still being here in a
 * month rather than for clicks today.
 */
function predictBlockAuthor(s: PhoenixSignals): number {
  const base = smoothedRate(
    s.counts.block_author ?? 0,
    s.impressions,
    PRIOR_RATE.block_author,
  );
  return clamp(base * strangerRisk(s));
}

/**
 * REPORT. Least common, worst outcome. Reports on a post generalise to future
 * viewers more strongly than any other signal, so the observed rate is
 * amplified rather than smoothed toward the prior.
 */
function predictReport(s: PhoenixSignals): number {
  const observed = s.counts.report ?? 0;
  const base = smoothedRate(observed, s.impressions, PRIOR_RATE.report);
  const amplify = observed > 0 ? 3 : 1;
  return clamp(base * amplify * strangerRisk(s));
}

/**
 * NOT INTERESTED. Aimed at the post rather than the person, so it does not get
 * the stranger penalty as hard, and it is the most common of the negatives.
 */
function predictNotInterested(s: PhoenixSignals): number {
  const base = smoothedRate(
    s.counts.not_interested ?? 0,
    s.impressions,
    PRIOR_RATE.not_interested,
  );
  return clamp(base * (1 + (strangerRisk(s) - 1) * 0.5));
}

/**
 * VIDEO SKIP EARLY. Individually the weakest signal in the set, which is why
 * its weight is only -6, but it fires on nearly every video that is not good.
 * In aggregate it is the main thing keeping bad reels out of the feed.
 *
 * The floor matters: even a video with no recorded skips is assumed to lose
 * some viewers in the first seconds, because that is how video works.
 */
function predictVideoSkipEarly(s: PhoenixSignals): number {
  if (s.mediaType !== 'video') return 0;
  const base = smoothedRate(
    s.counts.video_skip_early ?? 0,
    s.impressions,
    PRIOR_RATE.video_skip_early,
  );
  // People give accounts they follow a longer benefit of the doubt.
  const patience = s.viewerFollowsAuthor ? 0.7 : 1.15;
  return clamp(Math.max(0.05, base * patience));
}

/**
 * Shared "how likely is this to go badly" factor for the negative predictors.
 * Strangers are riskier than accounts you chose to follow, and an author you
 * have engaged with positively before is safer still.
 */
function strangerRisk(s: PhoenixSignals): number {
  if (s.viewerFollowsAuthor) return 0.25;
  if (s.viewerAffinityToAuthor > 0) return 0.7;
  return 2.0;
}

/* ===========================================================================
   SECTION 4  -  Putting it together
   =========================================================================== */

/** The lookup table the scorer walks. Add an action, add a line here. */
const PREDICTORS: Record<ActionName, (s: PhoenixSignals, rules: FeedRules) => number> = {
  like: predictLike,
  reply: predictReply,
  repost: predictRepost,
  bookmark: predictBookmark,
  share: predictShare,
  profile_click: predictProfileClick,
  video_watch_complete: predictVideoWatchComplete,
  follow_author: predictFollowAuthor,
  mute_author: (s) => predictMuteAuthor(s),
  block_author: (s) => predictBlockAuthor(s),
  report: (s) => predictReport(s),
  not_interested: (s) => predictNotInterested(s),
  video_skip_early: (s) => predictVideoSkipEarly(s),
};

/** Assembles everything Phoenix is allowed to look at into one object. */
export function buildSignals(candidate: Candidate, ctx: ViewerContext): PhoenixSignals {
  const ageHours =
    (Date.now() - new Date(candidate.post.created_at).getTime()) / 3_600_000;

  return {
    viewerFollowsAuthor: ctx.following.has(candidate.post.author_id),
    viewerAffinityToAuthor: ctx.affinity.get(candidate.post.author_id) ?? 0,
    ageHours,
    mediaType: candidate.post.media_type,
    source: candidate.source,
    impressions: candidate.impressions || estimateImpressions(candidate),
    counts: candidate.counts,
  };
}

/**
 * Score one post.
 *
 * This is the whole ranker in twelve lines: predict every action, multiply each
 * probability by its weight, add them up. Everything above is one of those
 * predictions; everything in home-mixer.ts happens after this returns.
 */
export function scoreCandidate(
  candidate: Candidate,
  ctx: ViewerContext,
  weights: Weights,
  rules: FeedRules,
): ScoreBreakdown {
  const signals = buildSignals(candidate, ctx);
  const contributions: ActionContribution[] = [];
  let score = 0;

  for (const action of ALL_ACTIONS) {
    const probability = PREDICTORS[action](signals, rules);
    const weight = weights[action];
    const contribution = probability * weight;
    score += contribution;
    contributions.push({ action, probability, weight, contribution });
  }

  // Biggest movers first, positive or negative, so the debug panel can just
  // take the top three and show something meaningful.
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    postId: candidate.post.id,
    rawScore: score,
    finalScore: score,
    contributions,
    signals,
    notes: [],
  };
}
