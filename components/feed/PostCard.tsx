'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ActionName, RankedPost } from '@/lib/types';
import { relativeTime } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { EngagementRail, sendEngagement } from './EngagementRail';
import { ReelVideo } from './ReelVideo';
import { ScoreChip } from './ScoreChip';

/**
 * One post, one viewport.
 *
 * Media fills the card and everything else floats on top of it: identity and
 * body bottom-left, engagement rail bottom-right, score top-right. A post with
 * no media gets a different composition entirely, because a text post rendered
 * as an empty video frame looks like something failed to load.
 */

/** The phone nav is roughly 60px plus the home indicator. Nothing overlaps it. */
const BOTTOM_CLEAR = 'pb-[calc(80px_+_env(safe-area-inset-bottom))] lg:pb-12';

const DISMISS_COPY: Partial<Record<ActionName, string>> = {
  not_interested: 'Noted. You will see fewer posts like this.',
  report: 'Reported. That is the heaviest negative signal the ranker has.',
  mute_author: 'Muted. Their posts stop reaching your feed.',
  block_author: 'Blocked. Their posts stop reaching your feed.',
};

export function PostCard({
  ranked,
  isActive,
  viewerId,
}: {
  ranked: RankedPost;
  isActive: boolean;
  viewerId: string | null;
}) {
  const { post } = ranked;
  const author = post.author;
  const displayName = author.display_name ?? author.username;
  const body = post.body?.trim() ?? '';
  const hasMedia = post.media_type !== 'none' && Boolean(post.media_url);
  const isOwnPost = viewerId !== null && post.author_id === viewerId;

  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [dismissed, setDismissed] = useState<ActionName | null>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  // Ask the browser whether the four-line clamp actually cut anything, rather
  // than guessing from character count.
  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    setClamped(element.scrollHeight - element.clientHeight > 2);
  }, [body]);

  function handleEngage(action: ActionName, undo: boolean) {
    if (undo) return;
    if (
      action === 'not_interested' ||
      action === 'mute_author' ||
      action === 'block_author' ||
      action === 'report'
    ) {
      setDismissed(action);
    }
  }

  function undoDismiss() {
    const action = dismissed;
    setDismissed(null);
    if (action && viewerId) void sendEngagement(post.id, action, true);
  }

  // Video signals are the only engagements the viewer does not press a button
  // for, so they are written quietly and never surface an error.
  function writeVideoSignal(action: ActionName) {
    if (!viewerId) return;
    void sendEngagement(post.id, action, false);
  }

  return (
    <article
      data-feed-card={post.id}
      className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-ground"
      aria-label={`Post by ${displayName}`}
    >
      {/* --- Media ------------------------------------------------------- */}
      {post.media_type === 'video' && post.media_url ? (
        <ReelVideo
          src={post.media_url}
          isActive={isActive}
          onWatchComplete={() => writeVideoSignal('video_watch_complete')}
          onSkipEarly={() => writeVideoSignal('video_skip_early')}
        />
      ) : null}

      {post.media_type === 'image' && post.media_url ? (
        <div className="absolute inset-0 bg-black">
          <Image
            src={post.media_url}
            alt={body ? body.slice(0, 140) : `Image posted by @${author.username}`}
            fill
            unoptimized
            sizes="100vw"
            className="object-contain"
          />
        </div>
      ) : null}

      {/* --- Text-only composition --------------------------------------- */}
      {!hasMedia ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-ground)_58%,var(--color-surface)_100%)]"
          />
          <div
            className={`absolute inset-0 flex items-center justify-center px-7 pt-16 lg:px-16 ${BOTTOM_CLEAR}`}
          >
            <p
              className={`text-balance text-center font-semibold tracking-tight text-ink ${textOnlySize(body)}`}
            >
              {body || 'This post has no text.'}
            </p>
          </div>
        </>
      ) : null}

      {/* --- Scrim. Required so white text survives a bright frame. -------- */}
      {hasMedia ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[52%] bg-gradient-to-t from-black/90 via-black/45 to-transparent"
        />
      ) : null}

      {/* --- Score -------------------------------------------------------- */}
      <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-30">
        <ScoreChip ranked={ranked} />
      </div>

      {/* --- Author and body ---------------------------------------------- */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 pl-4 pr-[76px] lg:pl-8 lg:pr-[104px] ${BOTTOM_CLEAR}`}
      >
        <div className="flex items-center gap-3">
          <Link
            href={`/profile/${author.username}`}
            aria-label={`Open the profile of @${author.username}`}
            className="shrink-0 rounded-full transition-transform duration-150 active:translate-y-px"
          >
            <Avatar
              src={author.avatar_url}
              name={displayName}
              seed={author.id}
              size={40}
            />
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/profile/${author.username}`}
                className="truncate text-[15px] font-bold leading-tight text-ink transition-colors hover:underline active:text-ink-muted"
              >
                {displayName}
              </Link>
              {isOwnPost ? (
                <span className="shrink-0 rounded-full border border-hairline px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  You
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-[13px] leading-tight text-ink-muted">
              <Link
                href={`/profile/${author.username}`}
                className="truncate transition-colors hover:text-ink hover:underline active:text-ink"
              >
                @{author.username}
              </Link>
              <span aria-hidden="true">.</span>
              <time dateTime={post.created_at} className="shrink-0">
                {relativeTime(post.created_at)}
              </time>
            </div>
          </div>
        </div>

        {hasMedia && body ? (
          <div className="mt-3 max-w-[46ch]">
            <p
              ref={bodyRef}
              className={`whitespace-pre-wrap text-[15px] leading-relaxed text-ink ${expanded ? '' : 'line-clamp-4'}`}
            >
              {body}
            </p>
            {clamped ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="mt-1 rounded-full text-[14px] font-semibold text-ink-muted transition-[color,transform] duration-150 hover:text-ink active:translate-y-px"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* --- Rail --------------------------------------------------------- */}
      <EngagementRail ranked={ranked} viewerId={viewerId} onEngage={handleEngage} />

      {/* --- Acknowledgement for the negative actions ---------------------- */}
      {dismissed ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ground/94 px-8 text-center backdrop-blur-sm">
          <p className="text-[17px] font-semibold text-ink">
            {DISMISS_COPY[dismissed] ?? 'Noted.'}
          </p>
          <p className="max-w-[40ch] text-[14px] leading-relaxed text-ink-muted">
            {dismissed === 'mute_author' || dismissed === 'block_author'
              ? 'That went into the engagements table. The mixer reads it before scoring anything, so this author is filtered out of your feed rather than just ranked lower.'
              : 'That went into the engagements table as a negative signal, so it pulls posts like this one down the next time the feed is scored.'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={undoDismiss}
              className="rounded-full border border-hairline px-4 py-2 text-[15px] font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-surface active:translate-y-px active:bg-surface-2"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setDismissed(null)}
              className="rounded-full bg-ink px-4 py-2 text-[15px] font-semibold text-black transition-[background-color,transform] duration-150 hover:bg-white active:translate-y-px"
            >
              Keep going
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * A text post has to fill a whole screen. Short thoughts get to be large,
 * longer ones step down so the card never scrolls or overflows.
 */
function textOnlySize(body: string): string {
  const length = body.length;
  if (length <= 90) return 'max-w-[18ch] text-[clamp(28px,6.4vw,46px)] leading-[1.15]';
  if (length <= 220) return 'max-w-[26ch] text-[clamp(21px,4.4vw,32px)] leading-[1.25]';
  return 'max-w-[42ch] text-[clamp(16px,3vw,21px)] leading-[1.45] line-clamp-[14]';
}
