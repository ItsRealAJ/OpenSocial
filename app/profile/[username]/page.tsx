import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarBlank } from '@phosphor-icons/react/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { FollowButton } from '@/components/profile/FollowButton';
import { PostList } from '@/components/profile/PostList';
import { AppShell } from '@/components/ui/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { compactCount } from '@/lib/format';
import { getSession } from '@/lib/data/session';
import type { Post, PostWithAuthor, Profile } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Profile',
};

const COLUMN = 'mx-auto min-h-[100dvh] max-w-[640px] pb-24 lg:border-x lg:border-hairline';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  // Next 16 hands params over as a promise.
  const { username } = await params;

  // One call answers "who is asking, and what do I query?" in both modes.
  const session = await getSession();

  // The existence check runs HERE, before anything is streamed, and not inside
  // the Suspense boundary below. notFound() can only set a 404 status while the
  // response headers are still open; once the shell has flushed, Next renders
  // the 404 page with a 200 attached, which looks right in a browser and is
  // wrong to every crawler and uptime check.
  const { data: profileRow, error: profileError } = await session.db
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (profileError || !profileRow) notFound();

  const profile = profileRow as Profile;

  return (
    <AppShell username={session.username}>
      <div className={COLUMN}>
        {/* Only the counts and the post list stream. The account is already here. */}
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileBody
            db={session.db}
            profile={profile}
            viewerId={session.viewerId}
            isDemo={session.isDemo}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ProfileBody({
  db,
  profile,
  viewerId,
  isDemo,
}: {
  db: SupabaseClient;
  /** Already resolved by the page, so this component cannot 404. */
  profile: Profile;
  viewerId: string | null;
  isDemo: boolean;
}) {
  // Handed down rather than rebuilt, so the header and the posts agree on which
  // database they are reading, demo or real.
  const supabase = db;

  const isSelf = viewerId === profile.id;

  const [postsResult, followersResult, followingResult, followResult] = await Promise.all([
    supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .eq('author_id', profile.id)
      .is('reply_to', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', profile.id),
    supabase
      .from('follows')
      .select('following_id', { count: 'exact', head: true })
      .eq('follower_id', profile.id),
    viewerId && !isSelf
      ? supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', viewerId)
          .eq('following_id', profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Every post here has the same author, so the rows do not need to embed it.
  const posts: PostWithAuthor[] = ((postsResult.data ?? []) as Post[]).map((post) => ({
    ...post,
    author: profile,
  }));

  const postCount = postsResult.count ?? posts.length;
  const followerCount = followersResult.count ?? 0;
  const followingCount = followingResult.count ?? 0;
  const isFollowing = Boolean(followResult.data);

  const displayName = profile.display_name ?? profile.username;
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <BackHeader
        title={displayName}
        subtitle={postCount === 1 ? '1 post' : `${postCount} posts`}
      />

      <header className="border-b border-hairline px-4 py-5">
        <div className="flex items-start justify-between gap-4">
          <Avatar src={profile.avatar_url} name={displayName} seed={profile.id} size={80} />

          {isSelf ? (
            <span
              title={
                isDemo
                  ? 'This is the built in demo account. Nothing on this page is saved, and it resets when the server restarts.'
                  : 'Editing a profile is not implemented in this demo.'
              }
            >
              <Button variant="ghost" disabled>
                {isDemo ? 'Demo account' : 'Edit profile'}
              </Button>
            </span>
          ) : (
            <FollowButton
              userId={profile.id}
              username={profile.username}
              initialFollowing={isFollowing}
              isSignedIn={Boolean(viewerId)}
              isDemo={isDemo}
            />
          )}
        </div>

        <h2 className="mt-3 text-[20px] font-bold leading-tight tracking-tight">
          {displayName}
        </h2>
        <p className="text-[15px] text-ink-muted">@{profile.username}</p>

        {profile.bio ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-normal text-ink">
            {profile.bio}
          </p>
        ) : null}

        <p className="mt-3 flex items-center gap-1.5 text-[14px] text-ink-muted">
          <CalendarBlank size={16} weight="regular" />
          Joined {joined}
        </p>

        <div className="mt-3 flex flex-wrap gap-5 text-[14px]">
          <span>
            <span className="font-bold text-ink">{compactCount(followingCount)}</span>{' '}
            <span className="text-ink-muted">Following</span>
          </span>
          <span>
            <span className="font-bold text-ink">{compactCount(followerCount)}</span>{' '}
            <span className="text-ink-muted">
              {followerCount === 1 ? 'Follower' : 'Followers'}
            </span>
          </span>
        </div>
      </header>

      {postsResult.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3"
        >
          <p className="text-[14px] text-danger">Could not load posts for this account.</p>
          <a
            href={`/profile/${profile.username}`}
            className="rounded-full border border-hairline px-3 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-2 active:translate-y-px"
          >
            Retry
          </a>
        </div>
      ) : (
        <PostList posts={posts} empty={`@${profile.username} has not posted anything yet.`} />
      )}
    </>
  );
}

/** Same bones as the real profile, so nothing jumps when the data lands. */
function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="flex items-center gap-6 border-b border-hairline px-4 py-3">
        <div className="h-5 w-5 rounded-full bg-surface-2" />
        <div className="space-y-1.5">
          <div className="h-4 w-32 rounded-full bg-surface-2" />
          <div className="h-3 w-16 rounded-full bg-surface" />
        </div>
      </div>

      <div className="border-b border-hairline px-4 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="h-20 w-20 rounded-full bg-surface-2" />
          <div className="h-9 w-[104px] rounded-full bg-surface-2" />
        </div>
        <div className="mt-3 h-5 w-40 rounded-full bg-surface-2" />
        <div className="mt-2 h-4 w-28 rounded-full bg-surface" />
        <div className="mt-4 h-4 w-full rounded-full bg-surface" />
        <div className="mt-2 h-4 w-3/4 rounded-full bg-surface" />
        <div className="mt-4 flex gap-5">
          <div className="h-4 w-24 rounded-full bg-surface" />
          <div className="h-4 w-24 rounded-full bg-surface" />
        </div>
      </div>

      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex gap-3 border-b border-hairline px-4 py-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-surface-2" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-44 rounded-full bg-surface-2" />
            <div className="h-3.5 w-full rounded-full bg-surface" />
            <div className="h-3.5 w-2/3 rounded-full bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
