import Image from 'next/image';
import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { relativeTime } from '@/lib/format';
import type { PostWithAuthor } from '@/lib/types';

/**
 * The standard timeline row: avatar on the left, one metadata line, body, then
 * media. Used by the profile page and by the reply list on a post, so both read
 * the same way. The whole row is the link, which is why nothing inside it is.
 */
export function PostList({ posts, empty }: { posts: PostWithAuthor[]; empty: string }) {
  if (posts.length === 0) {
    return <p className="px-4 py-8 text-[15px] leading-relaxed text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-hairline">
      {posts.map((post) => {
        const name = post.author.display_name ?? post.author.username;

        return (
          <li key={post.id}>
            <Link
              href={`/post/${post.id}`}
              className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface/60 active:translate-y-px active:bg-surface-2"
            >
              <Avatar
                src={post.author.avatar_url}
                name={name}
                seed={post.author.id}
                size={40}
              />

              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[15px] leading-tight">
                  <span className="truncate font-bold text-ink">{name}</span>
                  <span className="truncate text-ink-muted">@{post.author.username}</span>
                  <span aria-hidden="true" className="text-ink-muted">
                    ·
                  </span>
                  <span className="shrink-0 text-ink-muted">
                    {relativeTime(post.created_at)}
                  </span>
                </p>

                {post.body ? (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-normal text-ink">
                    {post.body}
                  </p>
                ) : null}

                {post.media_url && post.media_type !== 'none' ? (
                  <div className="mt-2 overflow-hidden rounded-[16px] border border-hairline">
                    {post.media_type === 'video' ? (
                      <video
                        src={post.media_url}
                        muted
                        playsInline
                        preload="metadata"
                        className="max-h-[320px] w-full bg-black object-cover"
                      />
                    ) : (
                      <Image
                        src={post.media_url}
                        alt=""
                        width={640}
                        height={360}
                        unoptimized
                        className="max-h-[320px] w-full bg-black object-cover"
                      />
                    )}
                  </div>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
