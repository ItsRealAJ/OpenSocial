/**
 * Shared types for the whole app.
 *
 * The action list below is the spine of the project. Every module touches it:
 * the database stores one row per action, Phoenix predicts one probability per
 * action, and the weights file assigns one number per action. Add an action
 * here and the compiler will tell you every other place that needs updating.
 */

/** Actions that mean "show me more like this". */
export const POSITIVE_ACTIONS = [
  'like',
  'reply',
  'repost',
  'bookmark',
  'share',
  'profile_click',
  'video_watch_complete',
  'follow_author',
] as const;

/** Actions that mean "show me less like this". These carry the big weights. */
export const NEGATIVE_ACTIONS = [
  'mute_author',
  'block_author',
  'report',
  'not_interested',
  'video_skip_early',
] as const;

export type PositiveAction = (typeof POSITIVE_ACTIONS)[number];
export type NegativeAction = (typeof NEGATIVE_ACTIONS)[number];
export type ActionName = PositiveAction | NegativeAction;

export const ALL_ACTIONS: readonly ActionName[] = [
  ...POSITIVE_ACTIONS,
  ...NEGATIVE_ACTIONS,
];

/** One number per action. This is the shape of `WEIGHTS` in weights.ts. */
export type Weights = Record<ActionName, number>;

/** How many times each action has been taken on a post, across all users. */
export type ActionCounts = Partial<Record<ActionName, number>>;

export type MediaType = 'none' | 'image' | 'video';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  body: string | null;
  media_url: string | null;
  media_type: MediaType;
  reply_to: string | null;
  created_at: string;
}

export interface PostWithAuthor extends Post {
  author: Profile;
}

/**
 * Where a post came from. The real system tracks this too, because
 * out-of-network posts get a score discount before they reach the feed.
 */
export type CandidateSource =
  /** The viewer follows this author. */
  | 'in_network'
  /** The viewer has engaged with this author before but does not follow them. */
  | 'out_of_network_affinity'
  /** Broadly popular right now, viewer has no relationship to the author. */
  | 'out_of_network_popular';

/**
 * A post plus everything the ranker needs to score it, with no further
 * database reads. Phoenix takes one of these and returns a number.
 */
export interface Candidate {
  post: PostWithAuthor;
  source: CandidateSource;
  /** Global engagement counts for this post, from Thunder's cache. */
  counts: ActionCounts;
  /**
   * Rough number of times this post has been shown. We do not log impressions
   * (that would be a lot of rows for a demo), so this is estimated. See
   * `estimateImpressions` in phoenix.ts for exactly how, and why it matters.
   */
  impressions: number;
}

/** Everything Phoenix knows about a (viewer, post) pair before it predicts. */
export interface PhoenixSignals {
  /** Does the viewer follow the author? */
  viewerFollowsAuthor: boolean;
  /** How many times has the viewer positively engaged with this author before? */
  viewerAffinityToAuthor: number;
  /** Hours since the post was created. */
  ageHours: number;
  mediaType: MediaType;
  source: CandidateSource;
  impressions: number;
  counts: ActionCounts;
}

/** One line of the "why did this rank here" breakdown. */
export interface ActionContribution {
  action: ActionName;
  /** Phoenix's predicted probability that the viewer takes this action, 0..1. */
  probability: number;
  /** The weight from weights.ts. */
  weight: number;
  /** probability * weight. Summing this column gives the score. */
  contribution: number;
}

/** The full, readable explanation of a single post's score. */
export interface ScoreBreakdown {
  postId: string;
  /** Raw Phoenix score, before home-mixer applies its shaping rules. */
  rawScore: number;
  /** Score after out-of-network discount and any other shaping. */
  finalScore: number;
  /** Every action, sorted by absolute contribution, biggest first. */
  contributions: ActionContribution[];
  signals: PhoenixSignals;
  /** Human-readable notes about shaping the mixer applied, e.g. discounts. */
  notes: string[];
}

/** What the feed API returns: a post, its score, and the reason for that score. */
export interface RankedPost {
  post: PostWithAuthor;
  source: CandidateSource;
  score: number;
  breakdown: ScoreBreakdown;
  /** The viewer's own engagement state, so buttons render filled or hollow. */
  viewerActions: ActionName[];
  /** Counts to display under the buttons. */
  counts: ActionCounts;
}

/** Request body for POST /api/feed. */
export interface FeedRequest {
  /** The viewer's tuned weights from localStorage. Omit to use the defaults. */
  weights?: Partial<Weights>;
  /** Feed shaping rules, also tunable. Omit to use the defaults. */
  rules?: Partial<FeedRules>;
  /** Post ids already shown this session, so the mixer can skip them. */
  seen?: string[];
  limit?: number;
}

export interface FeedResponse {
  posts: RankedPost[];
  /** How the pipeline spent its time and what it saw. Shown in the debug UI. */
  diagnostics: {
    candidatesConsidered: number;
    inNetwork: number;
    outOfNetwork: number;
    droppedByVisibility: number;
    droppedBySeen: number;
    thunderHits: number;
    thunderMisses: number;
    tookMs: number;
    usingCustomWeights: boolean;
    /** True when the ranker read the in-memory demo world, not a database. */
    isDemo: boolean;
  };
}

/**
 * Feed shaping knobs that live outside the per-action weights. These are the
 * rules home-mixer applies after Phoenix has scored everything.
 * Defined in weights.ts next to WEIGHTS so all the tuning lives in one file.
 */
export interface FeedRules {
  outOfNetworkDiscount: number;
  maxConsecutiveSameAuthor: number;
  recencyHalfLifeHours: number;
  candidatePoolSize: number;
  inNetworkShare: number;
  maxConsecutiveSameMedia: number;
}
