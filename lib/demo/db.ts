/**
 * =============================================================================
 *  A SUPABASE-SHAPED ADAPTER OVER THE DEMO STORE
 * =============================================================================
 *
 *  The point of this file is that NOTHING ELSE has to know about demo mode.
 *  candidate-pipeline.ts, thunder.ts and home-mixer.ts are handed one of these
 *  instead of a real Supabase client and carry on exactly as they are. The
 *  ranking you see without a database is produced by the same code as the
 *  ranking you see with one.
 *
 *  This implements only the queries this app actually makes. It is not a
 *  Postgres, and it is not trying to be. Anything unrecognised throws loudly
 *  rather than quietly returning nothing, because a silent empty result would
 *  look like a ranking bug and waste somebody's afternoon.
 *
 *  Supported: select (with the two embeds this app uses), eq, is, in, order,
 *  limit, single, maybeSingle, head+count, insert, upsert, delete.
 * =============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionName } from '@/lib/types';
import { demoId, demoWorld, type EngagementRecord } from './store';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

interface QueryState {
  table: string;
  filters: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  /** Set by select(..., { head, count }). */
  wantCount: boolean;
  headOnly: boolean;
  /** Which embedded relation the select string asked for, if any. */
  embed?: 'post_author' | 'engagement_post';
  single?: 'one' | 'maybe';
}

/** The tables, resolved fresh each query so writes are visible immediately. */
function tableRows(table: string): Row[] {
  switch (table) {
    case 'profiles':
      return demoWorld.profiles as unknown as Row[];
    case 'posts':
      return demoWorld.posts as unknown as Row[];
    case 'engagements':
      return demoWorld.engagements as unknown as Row[];
    case 'follows':
      return demoWorld.follows as unknown as Row[];
    case 'user_signals':
      // Written by home-mixer as a debugging convenience. In demo mode there is
      // no table editor to inspect, so the writes are accepted and discarded.
      return [];
    default:
      throw new Error(`Demo database has no table named "${table}".`);
  }
}

/**
 * The app uses exactly two PostgREST embeds. Rather than write a parser for a
 * syntax we only use twice, they are recognised by their constraint name.
 */
function detectEmbed(select: string): QueryState['embed'] {
  if (select.includes('posts_author_id_fkey')) return 'post_author';
  if (select.includes('engagements_post_id_fkey')) return 'engagement_post';
  return undefined;
}

function applyEmbed(row: Row, embed: QueryState['embed']): Row {
  if (embed === 'post_author') {
    return {
      ...row,
      author: demoWorld.profiles.find((p) => p.id === row.author_id) ?? null,
    };
  }
  if (embed === 'engagement_post') {
    const post = demoWorld.posts.find((p) => p.id === row.post_id);
    return { ...row, post: post ? { author_id: post.author_id } : null };
  }
  return row;
}

class DemoQuery implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private state: QueryState;

  constructor(table: string) {
    this.state = { table, filters: [], wantCount: false, headOnly: false };
  }

  select(
    columns = '*',
    options?: { head?: boolean; count?: 'exact' | 'planned' | 'estimated' },
  ): this {
    this.state.embed = detectEmbed(columns);
    this.state.wantCount = Boolean(options?.count);
    this.state.headOnly = Boolean(options?.head);
    return this;
  }

  eq(column: string, value: unknown): this {
    this.state.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.state.filters.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: unknown): this {
    // PostgREST `.is('reply_to', null)` means IS NULL.
    this.state.filters.push((row) =>
      value === null ? row[column] == null : row[column] === value,
    );
    return this;
  }

  in(column: string, values: unknown[]): this {
    const set = new Set(values);
    this.state.filters.push((row) => set.has(row[column]));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.state.order = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number): this {
    this.state.limit = count;
    return this;
  }

  single(): this {
    this.state.single = 'one';
    return this;
  }

  maybeSingle(): this {
    this.state.single = 'maybe';
    return this;
  }

  /* --- writes ------------------------------------------------------------ */

  insert(values: Row | Row[]): this {
    for (const value of Array.isArray(values) ? values : [values]) {
      this.write(value);
    }
    return this.asWriteResult();
  }

  /**
   * The conflict options are accepted and ignored. Real PostgREST needs them to
   * pick an arbiter index; here the write path below does its own duplicate
   * check against the same columns the partial unique index covers.
   */
  upsert(values: Row | Row[]): this {
    for (const value of Array.isArray(values) ? values : [values]) {
      this.write(value);
    }
    return this.asWriteResult();
  }

  delete(): this {
    this.state.filters = [];
    // Deletion is resolved at await time, once the eq() calls have landed.
    this.pendingDelete = true;
    return this;
  }

  private pendingDelete = false;
  private writeResult = false;

  private asWriteResult(): this {
    this.writeResult = true;
    return this;
  }

  private write(value: Row): void {
    const { table } = this.state;

    if (table === 'engagements') {
      const record: EngagementRecord = {
        id: demoId(`engagement:live:${demoWorld.engagements.length}:${Date.now()}`),
        user_id: String(value.user_id),
        post_id: String(value.post_id),
        action: value.action as ActionName,
        created_at: new Date().toISOString(),
      };
      // Mirrors the partial unique index in 0001_schema.sql. The engage route
      // relies on a duplicate being a silent no-op, so it is one here too.
      const duplicate = demoWorld.engagements.some(
        (row) =>
          row.user_id === record.user_id &&
          row.post_id === record.post_id &&
          row.action === record.action,
      );
      if (duplicate && TOGGLEABLE.has(record.action)) return;
      demoWorld.engagements.push(record);
      return;
    }

    if (table === 'follows') {
      const follower = String(value.follower_id);
      const following = String(value.following_id);
      const exists = demoWorld.follows.some(
        (row) => row.follower_id === follower && row.following_id === following,
      );
      if (!exists) {
        demoWorld.follows.push({
          follower_id: follower,
          following_id: following,
          created_at: new Date().toISOString(),
        });
      }
      return;
    }

    if (table === 'user_signals') return; // accepted and dropped, see tableRows

    if (table === 'posts') {
      demoWorld.posts.push({
        id: demoId(`post:live:${demoWorld.posts.length}:${Date.now()}`),
        author_id: String(value.author_id),
        body: (value.body as string | null) ?? null,
        media_url: (value.media_url as string | null) ?? null,
        media_type: (value.media_type as 'none' | 'image' | 'video') ?? 'none',
        reply_to: (value.reply_to as string | null) ?? null,
        created_at: new Date().toISOString(),
      });
      return;
    }

    throw new Error(`Demo database cannot write to "${table}".`);
  }

  private runDelete(): void {
    const { table, filters } = this.state;
    const matches = (row: Row) => filters.every((f) => f(row));

    if (table === 'engagements') {
      const kept = demoWorld.engagements.filter(
        (row) => !matches(row as unknown as Row),
      );
      demoWorld.engagements.length = 0;
      demoWorld.engagements.push(...kept);
      return;
    }
    if (table === 'follows') {
      const kept = demoWorld.follows.filter((row) => !matches(row as unknown as Row));
      demoWorld.follows.length = 0;
      demoWorld.follows.push(...kept);
      return;
    }
    throw new Error(`Demo database cannot delete from "${table}".`);
  }

  /* --- resolution -------------------------------------------------------- */

  then<TResult1 = { data: unknown; error: null; count?: number }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }

  private run(): { data: unknown; error: null; count?: number } {
    if (this.pendingDelete) {
      this.runDelete();
      return { data: null, error: null };
    }
    if (this.writeResult) {
      return { data: null, error: null };
    }

    const { table, filters, order, limit, embed, single, wantCount, headOnly } =
      this.state;

    let rows = tableRows(table).filter((row) => filters.every((f) => f(row)));

    if (order) {
      const { column, ascending } = order;
      rows = [...rows].sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return left < right ? (ascending ? -1 : 1) : left > right ? (ascending ? 1 : -1) : 0;
      });
    }

    const count = rows.length;
    if (typeof limit === 'number') rows = rows.slice(0, limit);

    if (headOnly) return { data: null, error: null, count };

    const shaped = embed ? rows.map((row) => applyEmbed(row, embed)) : rows;

    if (single) {
      return {
        data: shaped[0] ?? null,
        error: null,
        ...(wantCount ? { count } : {}),
      };
    }

    return { data: shaped, error: null, ...(wantCount ? { count } : {}) };
  }
}

const TOGGLEABLE = new Set<ActionName>([
  'like',
  'repost',
  'bookmark',
  'not_interested',
  'mute_author',
  'block_author',
  'report',
  'follow_author',
]);

/**
 * Quacks like a SupabaseClient for the handful of methods this app calls. The
 * cast is deliberate and load-bearing: it is what lets the ranking modules stay
 * completely unaware that demo mode exists.
 */
export function createDemoClient(): SupabaseClient {
  return {
    from(table: string) {
      return new DemoQuery(table);
    },
  } as unknown as SupabaseClient;
}
