/**
 * =============================================================================
 *  THUNDER  -  the in-memory post store
 * =============================================================================
 *
 *  In the real system Thunder is a Rust service that keeps recent posts and
 *  their engagement counts resident in memory, so the ranker can look up a
 *  couple of hundred posts in well under a millisecond instead of hammering a
 *  database on every feed refresh.
 *
 *  Here it is a Map with timestamps. Same job, four orders of magnitude less
 *  engineering. The ranker asks Thunder for posts; Thunder serves what it has
 *  and fetches only what it is missing.
 *
 *  Why this matters even in a toy: without it, every scroll refresh would run
 *  one query per post to count likes. With it, a warm cache costs zero queries.
 * =============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionCounts, ActionName, PostWithAuthor } from '@/lib/types';
import { ALL_ACTIONS } from '@/lib/types';

/** How long a cached post stays fresh. Short, because counts move fast. */
const TTL_MS = 30_000;

/** Upper bound on cache size, so a long-running server does not grow forever. */
const MAX_ENTRIES = 5_000;

export interface ThunderEntry {
  post: PostWithAuthor;
  counts: ActionCounts;
  /** Wall-clock time this entry was written, used for TTL checks. */
  cachedAt: number;
}

class ThunderStore {
  private entries = new Map<string, ThunderEntry>();
  private hits = 0;
  private misses = 0;

  /** Returns the entry if it exists and has not expired. */
  get(postId: string): ThunderEntry | undefined {
    const entry = this.entries.get(postId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.entries.delete(postId);
      return undefined;
    }
    return entry;
  }

  set(postId: string, post: PostWithAuthor, counts: ActionCounts): void {
    this.entries.set(postId, { post, counts, cachedAt: Date.now() });
    if (this.entries.size > MAX_ENTRIES) this.evictOldest();
  }

  /**
   * Drops the oldest tenth of the cache. Cheap approximation of an LRU; a real
   * implementation would keep a linked list, but this runs once in a blue moon.
   */
  private evictOldest(): void {
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt,
    );
    for (const [id] of sorted.slice(0, Math.floor(MAX_ENTRIES / 10))) {
      this.entries.delete(id);
    }
  }

  recordHit(): void {
    this.hits += 1;
  }

  recordMiss(): void {
    this.misses += 1;
  }

  stats() {
    return { size: this.entries.size, hits: this.hits, misses: this.misses };
  }

  /** Used by the engagement route: a new like should not wait out the TTL. */
  invalidate(postId: string): void {
    this.entries.delete(postId);
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * One store per server process. Stashed on globalThis so Next.js hot reloading
 * in development does not hand out a fresh empty cache on every file save.
 */
const globalForThunder = globalThis as unknown as { __thunder?: ThunderStore };
export const thunder = globalForThunder.__thunder ?? new ThunderStore();
if (process.env.NODE_ENV !== 'production') globalForThunder.__thunder = thunder;

/**
 * The one function the rest of the pipeline calls.
 *
 * Give it post ids, get back posts with their global engagement counts. Cached
 * ids are served from memory; the rest are fetched in exactly two queries no
 * matter how many posts are missing.
 */
export async function hydratePosts(
  db: SupabaseClient,
  postIds: string[],
): Promise<Map<string, ThunderEntry>> {
  const result = new Map<string, ThunderEntry>();
  const missing: string[] = [];

  for (const id of postIds) {
    const cached = thunder.get(id);
    if (cached) {
      thunder.recordHit();
      result.set(id, cached);
    } else {
      thunder.recordMiss();
      missing.push(id);
    }
  }

  if (missing.length === 0) return result;

  // Query 1: the posts themselves, with their author profile joined in.
  const { data: posts } = await db
    .from('posts')
    .select(
      'id, author_id, body, media_url, media_type, reply_to, created_at, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, bio, created_at)',
    )
    .in('id', missing);

  // Query 2: every engagement row for those posts. Tallied in JS below.
  //
  // A production system would keep denormalised counter columns on `posts` and
  // increment them with a trigger. Counting rows keeps the data model honest
  // and readable, which matters more here than the query plan.
  const { data: engagements } = await db
    .from('engagements')
    .select('post_id, action')
    .in('post_id', missing);

  const countsByPost = new Map<string, ActionCounts>();
  for (const row of engagements ?? []) {
    const action = row.action as ActionName;
    if (!ALL_ACTIONS.includes(action)) continue;
    const bucket = countsByPost.get(row.post_id) ?? {};
    bucket[action] = (bucket[action] ?? 0) + 1;
    countsByPost.set(row.post_id, bucket);
  }

  for (const raw of posts ?? []) {
    // Supabase types the embedded relation loosely; normalise it here so the
    // rest of the pipeline gets a clean PostWithAuthor.
    const author = Array.isArray(raw.author) ? raw.author[0] : raw.author;
    if (!author) continue;
    const post = { ...raw, author } as unknown as PostWithAuthor;
    const counts = countsByPost.get(post.id) ?? {};
    thunder.set(post.id, post, counts);
    result.set(post.id, { post, counts, cachedAt: Date.now() });
  }

  return result;
}
