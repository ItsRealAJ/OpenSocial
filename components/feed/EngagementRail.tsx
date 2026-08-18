'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import {
  UserPlus,
  ArrowsClockwise,
  BookmarkSimple,
  ChatCircle,
  DotsThree,
  EyeSlash,
  Flag,
  Heart,
  Prohibit,
  ShareFat,
  SpeakerSimpleSlash,
} from '@phosphor-icons/react/ssr';
import type { ActionCounts, ActionName, RankedPost } from '@/lib/types';
import { compactCount } from '@/lib/format';

/**
 * The right-hand rail.
 *
 * Every button here writes one row to the engagements table, and every row is
 * an input the ranker reads back on the next feed request. That is the loop the
 * whole app is about, so the buttons update instantly and reconcile with the
 * server's counts when the write lands.
 */

type EngageResult =
  | { ok: true; counts: ActionCounts; viewerActions: ActionName[] }
  | { ok: false; error: string };

/** Shared writer, also used for the two video signals PostCard produces. */
export async function sendEngagement(
  postId: string,
  action: ActionName,
  undo = false,
): Promise<EngageResult> {
  try {
    const response = await fetch('/api/engage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, action, undo }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: true; counts?: ActionCounts; viewerActions?: ActionName[]; error?: string }
      | null;

    if (!response.ok || !payload || !payload.counts || !payload.viewerActions) {
      return {
        ok: false,
        error: payload?.error ?? 'That did not save. Try again.',
      };
    }
    return { ok: true, counts: payload.counts, viewerActions: payload.viewerActions };
  } catch {
    return { ok: false, error: 'You appear to be offline. Try again.' };
  }
}

type Toast = { text: string; tone: 'info' | 'error'; needsSignIn: boolean };

const MENU_ITEMS: {
  action: ActionName;
  label: string;
  Icon: typeof EyeSlash;
  danger?: boolean;
  /** Hidden when the viewer already follows the author. */
  onlyWhenNotFollowing?: boolean;
}[] = [
  // follow_author carries the largest positive weight in weights.ts (24.0).
  // Without an entry here the only way to emit it would be the seed script,
  // which would make the biggest number on the settings page a dead control.
  // Note this is a different thing from the Follow button on a profile: this
  // one records "this specific post is what made me follow them".
  {
    action: 'follow_author',
    label: 'Follow author',
    Icon: UserPlus,
    onlyWhenNotFollowing: true,
  },
  { action: 'not_interested', label: 'Not interested', Icon: EyeSlash },
  { action: 'mute_author', label: 'Mute author', Icon: SpeakerSimpleSlash },
  { action: 'block_author', label: 'Block author', Icon: Prohibit, danger: true },
  { action: 'report', label: 'Report', Icon: Flag, danger: true },
];

export function EngagementRail({
  ranked,
  viewerId,
  onEngage,
}: {
  ranked: RankedPost;
  viewerId: string | null;
  onEngage?: (action: ActionName, undo: boolean) => void;
}) {
  const postId = ranked.post.id;
  const reduced = useReducedMotion();

  const [counts, setCounts] = useState<ActionCounts>(ranked.counts);
  const [actions, setActions] = useState<Set<ActionName>>(
    () => new Set(ranked.viewerActions),
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [likePop, setLikePop] = useState(0);

  const inFlight = useRef<Set<ActionName>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A refetch (new weights, or a pull to the top) hands down a fresh RankedPost
  // for the same post id. Server truth wins over whatever we guessed locally.
  const [source, setSource] = useState(ranked);
  if (source !== ranked) {
    setSource(ranked);
    setCounts(ranked.counts);
    setActions(new Set(ranked.viewerActions));
  }

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback(
    (text: string, tone: 'info' | 'error', needsSignIn = false) => {
      setToast({ text, tone, needsSignIn });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  /* --- the menu ----------------------------------------------------------- */

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  /* --- writes ------------------------------------------------------------- */

  const applyLocally = useCallback((action: ActionName, undo: boolean) => {
    setActions((previous) => {
      const next = new Set(previous);
      if (undo) next.delete(action);
      else next.add(action);
      return next;
    });
    setCounts((previous) => {
      const current = previous[action] ?? 0;
      return { ...previous, [action]: Math.max(0, current + (undo ? -1 : 1)) };
    });
  }, []);

  const toggle = useCallback(
    async (action: ActionName) => {
      if (!viewerId) {
        showToast('Sign in to react to posts.', 'error', true);
        return;
      }
      if (inFlight.current.has(action)) return;
      inFlight.current.add(action);

      const undo = actions.has(action);
      if (action === 'like' && !undo) setLikePop((n) => n + 1);

      applyLocally(action, undo);
      onEngage?.(action, undo);

      const result = await sendEngagement(postId, action, undo);
      inFlight.current.delete(action);

      if (!result.ok) {
        applyLocally(action, !undo);
        showToast(result.error, 'error');
        return;
      }
      setCounts(result.counts);
      setActions(new Set(result.viewerActions));
    },
    [actions, applyLocally, onEngage, postId, showToast, viewerId],
  );

  const runMenuAction = useCallback(
    async (action: ActionName) => {
      setMenuOpen(false);
      if (!viewerId) {
        showToast('Sign in to react to posts.', 'error', true);
        return;
      }
      onEngage?.(action, false);
      const result = await sendEngagement(postId, action, false);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      setActions(new Set(result.viewerActions));
      setCounts(result.counts);

      // The four negative actions get a full-card acknowledgement from
      // PostCard. follow_author does not, and a menu item that changes nothing
      // on screen reads as broken, so it confirms with a toast instead.
      if (action === 'follow_author') {
        showToast(
          `Following @${ranked.post.author.username}. Their posts are in network now.`,
          'info',
        );
      }
    },
    [onEngage, postId, ranked.post.author.username, showToast, viewerId],
  );

  const share = useCallback(async () => {
    const url = `${window.location.origin}/post/${postId}`;
    const author = ranked.post.author.display_name ?? ranked.post.author.username;

    // navigator.share only exists on some browsers, and it is only allowed in a
    // secure context, so `in` is the check rather than a truthiness test.
    const canUseShareSheet =
      typeof navigator !== 'undefined' && 'share' in navigator;
    let handedOff = false;

    if (canUseShareSheet) {
      try {
        await navigator.share({ title: `Post by ${author}`, url });
        handedOff = true;
      } catch {
        // Cancelling the share sheet is not a failure, it just means we fall
        // through to the clipboard.
      }
    }

    if (!handedOff) {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied.', 'info', !viewerId);
      } catch {
        showToast('Could not copy the link.', 'error');
        return;
      }
    }

    // The link is out either way. Only the engagement row needs an account,
    // and the clipboard path already carried the sign-in link in its toast.
    if (!viewerId) {
      if (handedOff) showToast('Sign in to react to posts.', 'error', true);
      return;
    }

    if (inFlight.current.has('share')) return;
    inFlight.current.add('share');

    applyLocally('share', false);
    onEngage?.('share', false);
    const result = await sendEngagement(postId, 'share', false);
    inFlight.current.delete('share');

    if (!result.ok) {
      applyLocally('share', true);
      showToast(result.error, 'error');
      return;
    }
    setCounts(result.counts);
    setActions(new Set(result.viewerActions));
  }, [applyLocally, onEngage, postId, ranked.post.author, showToast, viewerId]);

  /* --- render ------------------------------------------------------------- */

  const liked = actions.has('like');
  const reposted = actions.has('repost');
  const bookmarked = actions.has('bookmark');

  return (
    <>
      <div className="absolute bottom-[calc(92px_+_env(safe-area-inset-bottom))] right-2 z-20 flex flex-col items-center gap-4 lg:bottom-12 lg:right-6">
        {/* Like */}
        <RailButton
          label={liked ? 'Undo like' : 'Like'}
          pressed={liked}
          count={counts.like}
          onClick={() => void toggle('like')}
        >
          <motion.span
            key={likePop}
            className="block"
            animate={
              likePop > 0 && !reduced
                ? { scale: [1, 1.32, 0.94, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.34, times: [0, 0.3, 0.62, 1] }}
          >
            <Heart
              size={28}
              weight={liked ? 'fill' : 'regular'}
              className={liked ? 'text-like' : 'text-ink'}
            />
          </motion.span>
        </RailButton>

        {/* Reply */}
        <div className="flex flex-col items-center gap-1">
          <Link
            href={`/post/${postId}`}
            aria-label="Reply to this post"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-[background-color,transform] duration-150 hover:bg-white/10 active:translate-y-px active:bg-white/15"
          >
            <ChatCircle size={28} weight="regular" />
          </Link>
          <span className="font-mono text-[12px] tabular-nums text-ink">
            {compactCount(counts.reply)}
          </span>
        </div>

        {/* Repost */}
        <RailButton
          label={reposted ? 'Undo repost' : 'Repost'}
          pressed={reposted}
          count={counts.repost}
          onClick={() => void toggle('repost')}
        >
          <ArrowsClockwise
            size={28}
            weight={reposted ? 'fill' : 'regular'}
            className={reposted ? 'text-repost' : 'text-ink'}
          />
        </RailButton>

        {/* Bookmark */}
        <RailButton
          label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          pressed={bookmarked}
          count={counts.bookmark}
          onClick={() => void toggle('bookmark')}
        >
          <BookmarkSimple
            size={28}
            weight={bookmarked ? 'fill' : 'regular'}
            className={bookmarked ? 'text-accent' : 'text-ink'}
          />
        </RailButton>

        {/* Share */}
        <RailButton label="Share" count={counts.share} onClick={() => void share()}>
          <ShareFat size={28} weight="regular" className="text-ink" />
        </RailButton>

        {/* More */}
        <div ref={menuRef} className="relative flex flex-col items-center">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="More actions for this post"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-[background-color,transform] duration-150 hover:bg-white/10 active:translate-y-px active:bg-white/15"
          >
            <DotsThree size={28} weight="bold" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="More actions"
              className="absolute bottom-12 right-0 w-[204px] overflow-hidden rounded-[16px] border border-hairline bg-surface py-1"
            >
              {MENU_ITEMS.filter(
                // Following someone you already follow is not an option, and
                // predictFollowAuthor returns 0 for them anyway.
                (item) =>
                  !item.onlyWhenNotFollowing ||
                  !(
                    ranked.breakdown.signals.viewerFollowsAuthor ||
                    actions.has('follow_author')
                  ),
              ).map(({ action, label, Icon, danger }) => (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  onClick={() => void runMenuAction(action)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-[background-color,transform] duration-150 hover:bg-surface-2 active:translate-y-px active:bg-hairline ${danger ? 'text-danger' : 'text-ink'}`}
                >
                  <Icon size={18} weight="regular" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Inline toast, anchored to the bottom of the card. */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(70px_+_env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6"
        >
          <div
            className={`pointer-events-auto flex max-w-[min(38ch,100%)] items-center gap-2 rounded-full border px-4 py-2 text-[13px] backdrop-blur-md ${
              toast.tone === 'error'
                ? 'border-danger/50 bg-ground/85 text-ink'
                : 'border-hairline bg-ground/85 text-ink'
            }`}
          >
            <span>{toast.text}</span>
            {toast.needsSignIn ? (
              <Link
                href="/login"
                className="shrink-0 font-semibold text-accent transition-colors hover:underline active:text-accent-press"
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function RailButton({
  label,
  pressed,
  count,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  count: number | undefined;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className="flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-white/10 active:translate-y-px active:bg-white/15 disabled:opacity-45"
      >
        {children}
      </button>
      <span className="font-mono text-[12px] tabular-nums text-ink">
        {compactCount(count)}
      </span>
    </div>
  );
}
