/**
 * =============================================================================
 *  THE DEMO STORE
 * =============================================================================
 *
 *  When .env.local has no Supabase project in it, the app runs against this
 *  instead: the same dataset as `npm run seed`, materialised in memory.
 *
 *  Everything the ranker needs is here, so the feed you see in demo mode is
 *  genuinely ranked. Phoenix scores it, home-mixer filters and blends it, the
 *  score panel shows real numbers, and moving a slider really does reorder it.
 *  Nothing about the algorithm is faked or precomputed.
 *
 *  What IS fake: persistence. This lives in one server process. Likes you leave
 *  survive until the process restarts and are shared by anyone hitting the same
 *  process. That is fine for looking around and wrong for anything else, which
 *  is what the banner on every page is there to say.
 * =============================================================================
 */

import type {
  ActionName,
  MediaType,
  Post,
  Profile,
} from '@/lib/types';
import {
  ACCOUNTS,
  FOLLOWS,
  POSTS,
  REPLIES,
  buildEngagementRows,
} from './dataset';

export interface EngagementRecord {
  id: string;
  user_id: string;
  post_id: string;
  action: ActionName;
  created_at: string;
}

export interface FollowRecord {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface DemoWorld {
  profiles: Profile[];
  posts: Post[];
  engagements: EngagementRecord[];
  follows: FollowRecord[];
  /** The account "you" are browsing as. Not one of the eight authors. */
  viewerId: string;
  viewerUsername: string;
  /** Fixed at process start so relative timestamps do not drift mid-session. */
  anchorMs: number;
}

/**
 * Stable id for a given name. The app puts post ids in URLs, so they have to
 * survive between requests. A hash keeps them stable without a database, and
 * shaping the output like a uuid keeps the demo honest about what these are
 * standing in for.
 */
export function demoId(name: string): string {
  // FNV-1a, run four times over salted copies to fill 32 hex digits.
  const hex = [0, 1, 2, 3]
    .map((salt) => {
      let hash = 0x811c9dc5;
      const input = `${salt}:${name}`;
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    })
    .join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const VIEWER_HANDLE = 'you';

function buildWorld(): DemoWorld {
  const anchorMs = Date.now();
  const iso = (hoursAgo: number) =>
    new Date(anchorMs - hoursAgo * 3_600_000).toISOString();

  const idByHandle = new Map<string, string>();
  const profiles: Profile[] = [];

  for (const account of ACCOUNTS) {
    const id = demoId(`profile:${account.handle}`);
    idByHandle.set(account.handle, id);
    profiles.push({
      id,
      username: account.handle,
      display_name: account.displayName,
      avatar_url: null,
      bio: account.bio,
      created_at: iso(24 * 220),
    });
  }

  // The viewer. A ninth account rather than one of the eight, so the feed is
  // other people's posts and the in-network / out-of-network split is visible.
  const viewerId = demoId(`profile:${VIEWER_HANDLE}`);
  idByHandle.set(VIEWER_HANDLE, viewerId);
  profiles.push({
    id: viewerId,
    username: VIEWER_HANDLE,
    display_name: 'Demo viewer',
    avatar_url: null,
    bio: 'Looking around without a Supabase project. Nothing here is saved.',
    created_at: iso(24 * 30),
  });

  const idByKey = new Map<string, string>();
  const posts: Post[] = [];

  for (const post of POSTS) {
    const id = demoId(`post:${post.key}`);
    idByKey.set(post.key, id);
    posts.push({
      id,
      author_id: idByHandle.get(post.handle)!,
      body: post.body,
      media_url: post.mediaUrl,
      media_type: post.mediaType as MediaType,
      reply_to: null,
      created_at: iso(post.hoursAgo),
    });
  }

  REPLIES.forEach((reply, index) => {
    const key = `reply:${index}`;
    const id = demoId(`post:${key}`);
    idByKey.set(key, id);
    posts.push({
      id,
      author_id: idByHandle.get(reply.handle)!,
      body: reply.body,
      media_url: null,
      media_type: 'none',
      reply_to: idByKey.get(reply.parent) ?? null,
      created_at: iso(reply.hoursAgo),
    });
  });

  const follows: FollowRecord[] = [];
  for (const [follower, following] of Object.entries(FOLLOWS)) {
    for (const target of following) {
      const a = idByHandle.get(follower);
      const b = idByHandle.get(target);
      if (a && b) follows.push({ follower_id: a, following_id: b, created_at: iso(24 * 40) });
    }
  }

  // Half the cast, so the feed has a real in-network and out-of-network mix
  // and the out-of-network discount in the score panel actually fires.
  for (const handle of ['marisolwrenches', 'sowsounds', 'olagtfs', 'yewandeshoots']) {
    const target = idByHandle.get(handle);
    if (target) {
      follows.push({ follower_id: viewerId, following_id: target, created_at: iso(24 * 12) });
    }
  }

  const engagements: EngagementRecord[] = buildEngagementRows(
    idByHandle,
    idByKey,
    anchorMs,
  ).map((row, index) => ({ id: demoId(`engagement:${index}`), ...row }));

  return {
    profiles,
    posts,
    engagements,
    follows,
    viewerId,
    viewerUsername: VIEWER_HANDLE,
    anchorMs,
  };
}

/**
 * One world per server process, kept on globalThis so hot reloading in
 * development does not throw away the likes you just left.
 */
const globalForDemo = globalThis as unknown as { __demoWorld?: DemoWorld };
export const demoWorld: DemoWorld = globalForDemo.__demoWorld ?? buildWorld();
if (process.env.NODE_ENV !== 'production') globalForDemo.__demoWorld = demoWorld;

/** Used by the compose page so a demo post lands somewhere. */
export function addDemoPost(post: Omit<Post, 'id' | 'created_at'>): Post {
  const created: Post = {
    ...post,
    id: demoId(`post:user:${demoWorld.posts.length}:${Date.now()}`),
    created_at: new Date().toISOString(),
  };
  demoWorld.posts.push(created);
  return created;
}
