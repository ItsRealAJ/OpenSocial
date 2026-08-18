'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { PencilSimple, Stack, WarningCircle } from '@phosphor-icons/react/ssr';
import { Button } from '@/components/ui/Button';

/**
 * The three states every feed surface owes the user.
 *
 * The skeleton is a blocked-out copy of the real card, not a spinner, because
 * the feed is one card per viewport: a centred spinner would tell you nothing
 * about what is arriving. The empty state explains where posts come from, and
 * the error state repeats the server's own message rather than paraphrasing it.
 */

const BOTTOM_CLEAR = 'pb-[calc(76px_+_env(safe-area-inset-bottom))] lg:pb-10';

/* -------------------------------------------------------------------------- */
/*  Loading                                                                    */
/* -------------------------------------------------------------------------- */

export function FeedSkeleton() {
  return (
    <div
      className="h-[100dvh] overflow-hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Ranking posts.</span>
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function SkeletonCard() {
  const reduced = useReducedMotion();

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ground" aria-hidden="true">
      {/* Media plate. */}
      <div className="absolute inset-0 bg-surface" />

      {reduced ? null : (
        <motion.div
          className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.045] to-transparent"
          initial={{ x: '-120%' }}
          animate={{ x: '240%' }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Score chip. */}
      <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] h-8 w-[86px] rounded-full bg-surface-2" />

      {/* Engagement rail. */}
      <div className="absolute bottom-[calc(96px_+_env(safe-area-inset-bottom))] right-4 flex flex-col items-center gap-6 lg:bottom-16 lg:right-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="h-9 w-9 rounded-full bg-surface-2" />
            <div className="h-2 w-6 rounded-full bg-surface-2" />
          </div>
        ))}
      </div>

      {/* Author and body. */}
      <div className={`absolute inset-x-0 bottom-0 pl-4 pr-[92px] lg:pl-8 ${BOTTOM_CLEAR}`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-surface-2" />
          <div className="space-y-2">
            <div className="h-3 w-28 rounded-full bg-surface-2" />
            <div className="h-2.5 w-20 rounded-full bg-surface-2" />
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          <div className="h-3 w-[min(46ch,92%)] rounded-full bg-surface-2" />
          <div className="h-3 w-[min(40ch,80%)] rounded-full bg-surface-2" />
          <div className="h-3 w-[min(28ch,58%)] rounded-full bg-surface-2" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty                                                                      */
/* -------------------------------------------------------------------------- */

export function FeedEmpty({
  username,
  isDemo = false,
}: {
  username?: string | null;
  /** Changes the remedy: `npm run seed` needs a database that demo mode lacks. */
  isDemo?: boolean;
}) {
  const signedIn = Boolean(username);

  return (
    <div
      className={`flex h-[100dvh] flex-col justify-center px-6 lg:px-10 ${BOTTOM_CLEAR}`}
    >
      <div className="mx-auto w-full max-w-[46ch]">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-accent">
          <Stack size={22} weight="fill" />
        </span>

        <h1 className="mt-5 text-[24px] font-bold leading-tight tracking-tight">
          Nothing to rank yet
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          This feed is built by scoring every post against the engagements table.
          There are no posts to score right now, so there is no order to show
          you. Add something and the ranker has something to work with.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={signedIn ? '/compose' : '/login'}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-press active:translate-y-px active:bg-accent-press"
          >
            <PencilSimple size={18} weight="bold" />
            {signedIn ? 'Write a post' : 'Sign in to post'}
          </Link>
          <Link
            href="/settings/algorithm"
            className="inline-flex items-center rounded-full border border-hairline px-4 py-2 text-[15px] font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-surface active:translate-y-px active:bg-surface-2"
          >
            Read the weights
          </Link>
        </div>

        <p className="mt-7 border-l-2 border-hairline pl-4 text-[13px] leading-relaxed text-ink-muted">
          {isDemo ? (
            <>
              There is nothing left to rank because the demo world has been
              hidden or dismissed away. Restart the dev server to bring it back.
            </>
          ) : (
            <>
              Want something to look at first? Run{' '}
              <code className="font-mono text-[12px] text-ink">npm run seed</code>{' '}
              to load demo accounts, posts and engagements, then refresh this page.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Error                                                                      */
/* -------------------------------------------------------------------------- */

export function FeedError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  // The API returns configuration problems as plain sentences, so a keyword
  // test is enough to decide whether the .env.local hint is worth showing.
  const looksLikeConfig = /config|environment|env\.local|supabase|service_role|anon key|url/i.test(
    message,
  );

  return (
    <div
      className={`flex h-[100dvh] flex-col justify-center px-6 lg:px-10 ${BOTTOM_CLEAR}`}
      role="alert"
    >
      <div className="mx-auto w-full max-w-[46ch]">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-danger">
          <WarningCircle size={22} weight="fill" />
        </span>

        <h1 className="mt-5 text-[24px] font-bold leading-tight tracking-tight">
          The feed did not load
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-ink">{message}</p>

        {looksLikeConfig ? (
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
            That reads like a configuration problem. Check that .env.local has
            the Supabase project URL, the anon key and the service_role key,
            then restart the dev server.
          </p>
        ) : null}

        <div className="mt-7">
          <Button onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
