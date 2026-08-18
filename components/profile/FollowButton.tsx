'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';

/**
 * Optimistic follow. The state flips first and the request catches up, because
 * a follow that waits on a round trip feels broken. A failure rolls the state
 * back and says why, rather than leaving a lie on screen.
 *
 * In demo mode the follow is real, in the sense that it writes to the in-memory
 * store and the feed reranks around it. It is still gone at the next restart,
 * which is what the title says rather than disabling the button over.
 */
export function FollowButton({
  userId,
  username,
  initialFollowing,
  isSignedIn,
  isDemo = false,
}: {
  userId: string;
  username: string;
  initialFollowing: boolean;
  isSignedIn: boolean;
  isDemo?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-full bg-ink px-4 py-2 text-[15px] font-semibold text-black transition-colors hover:bg-white active:translate-y-px"
      >
        Sign in to follow
      </Link>
    );
  }

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, follow: next }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        following?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'That did not go through.');
      }

      if (typeof payload?.following === 'boolean') setFollowing(payload.following);
      // The header counts are rendered on the server, so pull them again.
      router.refresh();
    } catch (caught) {
      setFollowing(!next);
      setError(caught instanceof Error ? caught.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        onClick={toggle}
        loading={busy}
        aria-pressed={following}
        title={
          isDemo
            ? 'This follow is not saved. It changes the feed now and resets when the server restarts.'
            : undefined
        }
        className={following ? 'group min-w-[104px] hover:text-danger' : 'min-w-[104px]'}
      >
        {following ? (
          <>
            <span className="group-hover:hidden">Following</span>
            <span className="hidden group-hover:inline">Unfollow</span>
          </>
        ) : (
          <span>Follow</span>
        )}
      </Button>

      {error ? (
        <p role="alert" className="max-w-[220px] text-right text-[13px] leading-snug text-danger">
          {error}
        </p>
      ) : null}

      <span className="sr-only">
        {following ? `You follow @${username}` : `You do not follow @${username}`}
      </span>
    </div>
  );
}
