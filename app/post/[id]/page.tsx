import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PostThread } from '@/components/post/PostThread';
import { AppShell } from '@/components/ui/AppShell';
import { BackHeader } from '@/components/ui/BackHeader';
import { getSession } from '@/lib/data/session';
import type { ActionCounts, ActionName, PostWithAuthor } from '@/lib/types';

/** Embeds resolve by constraint name, which is why the name is spelled out. */
const POST_SELECT = '*, author:profiles!posts_author_id_fkey(*)';

export const metadata: Metadata = {
  title: 'Post',
};

const COLUMN = 'mx-auto min-h-[100dvh] max-w-[640px] pb-24 lg:border-x lg:border-hairline';

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16 hands params over as a promise.
  const { id } = await params;

  // One call answers "who is asking, and what do I query?" in both modes.
  const session = await getSession();

  const { data: viewerProfile } = session.viewerId
    ? await session.db
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', session.viewerId)
        .maybeSingle()
    : { data: null };

  const viewer = viewerProfile as {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;

  // The existence check runs HERE, before anything is streamed, and not inside
  // the Suspense boundary below. notFound() can only set a 404 status while the
  // response headers are still open; once the shell has flushed, Next renders
  // the 404 page with a 200 attached, which looks right in a browser and is
  // wrong to every crawler and uptime check.
  //
  // A malformed id makes Postgres reject the uuid cast, which lands here as an
  // error rather than an empty row, so both cases mean the same thing.
  const { data: postRow, error: postError } = await session.db
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (postError || !postRow) notFound();

  const post = postRow as PostWithAuthor;

  return (
    <AppShell username={viewer?.username ?? null}>
      <div className={COLUMN}>
        {/* Only the parent, replies and counts stream. The post is already here. */}
        <Suspense fallback={<ThreadSkeleton />}>
          <Thread
            db={session.db}
            post={post}
            viewerId={session.viewerId}
            viewerName={viewer?.display_name ?? viewer?.username ?? null}
            viewerAvatar={viewer?.avatar_url ?? null}
            isDemo={session.isDemo}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function Thread({
  db,
  post,
  viewerId,
  viewerName,
  viewerAvatar,
  isDemo,
}: {
  db: SupabaseClient;
  /** Already resolved by the page, so this component cannot 404. */
  post: PostWithAuthor;
  viewerId: string | null;
  viewerName: string | null;
  viewerAvatar: string | null;
  isDemo: boolean;
}) {
  // Handed down rather than rebuilt, so the thread and the page agree on which
  // database they are reading, demo or real.
  const supabase = db;

  const [parentResult, repliesResult, engagementResult] = await Promise.all([
    post.reply_to
      ? supabase.from('posts').select(POST_SELECT).eq('id', post.reply_to).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('reply_to', post.id)
      .order('created_at', { ascending: true }),
    supabase.from('engagements').select('action, user_id').eq('post_id', post.id),
  ]);

  const parent = (parentResult.data as PostWithAuthor | null) ?? null;
  const replies = (repliesResult.data as PostWithAuthor[] | null) ?? [];

  // Counts are grouped here rather than in SQL: one small select of action rows
  // beats four count queries, and the grouping is three lines of JavaScript.
  const counts: ActionCounts = {};
  const viewerActions: ActionName[] = [];
  for (const row of (engagementResult.data ?? []) as { action: ActionName; user_id: string }[]) {
    counts[row.action] = (counts[row.action] ?? 0) + 1;
    if (viewerId && row.user_id === viewerId && !viewerActions.includes(row.action)) {
      viewerActions.push(row.action);
    }
  }

  const failed = [
    repliesResult.error ? 'replies' : null,
    engagementResult.error ? 'engagement counts' : null,
  ].filter(Boolean);

  return (
    <>
      <BackHeader
        title="Post"
        subtitle={replies.length === 1 ? '1 reply' : `${replies.length} replies`}
      />

      {failed.length > 0 ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3"
        >
          <p className="text-[14px] text-danger">
            Could not load the {failed.join(' or ')} for this post.
          </p>
          <a
            href={`/post/${post.id}`}
            className="rounded-full border border-hairline px-3 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-2 active:translate-y-px"
          >
            Retry
          </a>
        </div>
      ) : null}

      <PostThread
        post={post}
        parent={parent}
        replies={replies}
        counts={counts}
        viewerActions={viewerActions}
        viewerId={viewerId}
        viewerName={viewerName}
        viewerAvatar={viewerAvatar}
        isDemo={isDemo}
      />
    </>
  );
}

/** Same bones as the real thread, so nothing jumps when the data lands. */
function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="flex items-center gap-6 border-b border-hairline px-4 py-3">
        <div className="h-5 w-5 rounded-full bg-surface-2" />
        <div className="h-4 w-16 rounded-full bg-surface-2" />
      </div>

      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-surface-2" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 rounded-full bg-surface-2" />
            <div className="h-3.5 w-24 rounded-full bg-surface" />
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="h-5 w-full rounded-full bg-surface-2" />
          <div className="h-5 w-11/12 rounded-full bg-surface-2" />
          <div className="h-5 w-2/3 rounded-full bg-surface-2" />
        </div>

        <div className="mt-3 h-[220px] w-full rounded-[16px] bg-surface" />
        <div className="mt-3 h-3.5 w-40 rounded-full bg-surface" />
      </div>

      <div className="flex gap-5 border-y border-hairline px-4 py-3">
        <div className="h-3.5 w-16 rounded-full bg-surface-2" />
        <div className="h-3.5 w-16 rounded-full bg-surface-2" />
        <div className="h-3.5 w-16 rounded-full bg-surface-2" />
      </div>

      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3 border-b border-hairline px-4 py-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-surface-2" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-44 rounded-full bg-surface-2" />
            <div className="h-3.5 w-full rounded-full bg-surface" />
            <div className="h-3.5 w-3/5 rounded-full bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
