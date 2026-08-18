import Image from 'next/image';
import Link from 'next/link';

import { ReplyComposer } from '@/components/post/ReplyComposer';
import { PostList } from '@/components/profile/PostList';
import { Avatar } from '@/components/ui/Avatar';
import { absoluteTime, compactCount, relativeTime } from '@/lib/format';
import type { ActionCounts, ActionName, PostWithAuthor } from '@/lib/types';

/** The four counts X shows under a post, in X's order. */
const STATS: { action: ActionName; label: string; one: string; tone: string }[] = [
  { action: 'reply', label: 'Replies', one: 'Reply', tone: 'text-accent' },
  { action: 'repost', label: 'Reposts', one: 'Repost', tone: 'text-repost' },
  { action: 'like', label: 'Likes', one: 'Like', tone: 'text-like' },
  { action: 'bookmark', label: 'Bookmarks', one: 'Bookmark', tone: 'text-accent' },
];

export function PostThread({
  post,
  parent,
  replies,
  counts,
  viewerActions,
  viewerId,
  viewerName,
  viewerAvatar,
  isDemo = false,
}: {
  post: PostWithAuthor;
  parent: PostWithAuthor | null;
  replies: PostWithAuthor[];
  counts: ActionCounts;
  viewerActions: ActionName[];
  viewerId: string | null;
  viewerName: string | null;
  viewerAvatar: string | null;
  /** Passed down so the reply box knows not to build a Supabase client. */
  isDemo?: boolean;
}) {
  const authorName = post.author.display_name ?? post.author.username;

  return (
    <article>
      {parent ? <ParentCard parent={parent} /> : null}

      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/profile/${post.author.username}`}
            className="flex min-w-0 items-center gap-3 rounded-full transition-opacity hover:opacity-80 active:translate-y-px"
          >
            <Avatar
              src={post.author.avatar_url}
              name={authorName}
              seed={post.author.id}
              size={48}
            />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight text-ink">
                {authorName}
              </span>
              <span className="block truncate text-[15px] leading-tight text-ink-muted">
                @{post.author.username}
              </span>
            </span>
          </Link>
        </div>

        {post.body ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[23px] leading-snug text-ink">
            {post.body}
          </p>
        ) : null}

        {post.media_url && post.media_type !== 'none' ? (
          <div className="mt-3 overflow-hidden rounded-[16px] border border-hairline">
            {post.media_type === 'video' ? (
              <video
                src={post.media_url}
                controls
                muted
                loop
                playsInline
                className="max-h-[70dvh] w-full bg-black object-contain"
              />
            ) : (
              <Image
                src={post.media_url}
                alt=""
                width={1200}
                height={800}
                unoptimized
                className="max-h-[70dvh] w-full bg-black object-contain"
              />
            )}
          </div>
        ) : null}

        <p className="mt-3 text-[15px] text-ink-muted">
          <time dateTime={post.created_at}>{absoluteTime(post.created_at)}</time>
        </p>
      </div>

      <div className="flex flex-wrap gap-5 border-y border-hairline px-4 py-3">
        {STATS.map(({ action, label, one, tone }) => {
          const value = counts[action] ?? 0;
          const taken = viewerActions.includes(action);
          return (
            <span key={action} className="text-[14px]">
              <span className={`font-bold ${taken ? tone : 'text-ink'}`}>
                {compactCount(value)}
              </span>{' '}
              <span className="text-ink-muted">{value === 1 ? one : label}</span>
            </span>
          );
        })}
      </div>

      <ReplyComposer
        parentId={post.id}
        viewerId={viewerId}
        viewerName={viewerName}
        viewerAvatar={viewerAvatar}
        isDemo={isDemo}
      />

      <PostList
        posts={replies}
        empty={`No replies yet. Be the first to reply to ${authorName}.`}
      />
    </article>
  );
}

/** The post this one is answering, shown as a compact card above the focal post. */
function ParentCard({ parent }: { parent: PostWithAuthor }) {
  const name = parent.author.display_name ?? parent.author.username;

  return (
    <div className="px-4 pt-4">
      <p className="mb-2 text-[13px] text-ink-muted">
        Replying to @{parent.author.username}
      </p>
      <Link
        href={`/post/${parent.id}`}
        className="block rounded-[16px] border border-hairline bg-surface p-3 transition-colors hover:bg-surface-2 active:translate-y-px"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Avatar src={parent.author.avatar_url} name={name} seed={parent.author.id} size={24} />
          <span className="truncate text-[14px] font-bold text-ink">{name}</span>
          <span className="truncate text-[14px] text-ink-muted">@{parent.author.username}</span>
          <span aria-hidden="true" className="text-[14px] text-ink-muted">
            ·
          </span>
          <span className="shrink-0 text-[14px] text-ink-muted">
            {relativeTime(parent.created_at)}
          </span>
        </div>

        {parent.body ? (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-normal text-ink">
            {parent.body}
          </p>
        ) : null}

        {parent.media_url && parent.media_type !== 'none' ? (
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {parent.media_type === 'video' ? 'Video attached' : 'Image attached'}
          </p>
        ) : null}
      </Link>
    </div>
  );
}
