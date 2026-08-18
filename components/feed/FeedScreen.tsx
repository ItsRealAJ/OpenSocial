'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { ArrowClockwise, CheckCircle } from '@phosphor-icons/react/ssr';
import type { FeedResponse, RankedPost } from '@/lib/types';
import {
  hasCustomTuning,
  loadRules,
  loadWeights,
  TUNING_CHANGED_EVENT,
} from '@/lib/algorithm/storage';
import { PostCard } from './PostCard';
import { FeedEmpty, FeedError, FeedSkeleton } from './FeedStates';

/** localStorage is an external store, so React should read it as one. */
function subscribeToTuning(onChange: () => void): () => void {
  window.addEventListener(TUNING_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(TUNING_CHANGED_EVENT, onChange);
}

/**
 * The feed.
 *
 * Owns three things and nothing else: the fetch to /api/feed, the set of post
 * ids already shown this session, and which card is currently on screen. The
 * active card is decided by a single IntersectionObserver rooted on the
 * scroller, never by a scroll listener, because a snap feed fires hundreds of
 * scroll events per swipe and needs none of them.
 *
 * The tuning event is the other half of the product: change a weight on
 * /settings/algorithm and this refetches, so the reorder is visible immediately
 * rather than on the next hard refresh.
 */
export function FeedScreen({
  viewerId,
  viewerUsername,
}: {
  viewerId: string | null;
  viewerUsername: string | null;
}) {
  const [posts, setPosts] = useState<RankedPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const customTuning = useSyncExternalStore(
    subscribeToTuning,
    hasCustomTuning,
    () => false,
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Every id this session has already rendered. The mixer skips them. */
  const seenRef = useRef<Set<string>>(new Set());
  const postsRef = useRef<RankedPost[]>([]);
  const loadingMoreRef = useRef(false);
  const atEndRef = useRef(false);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    atEndRef.current = atEnd;
  }, [atEnd]);

  /* --- fetching ------------------------------------------------------------ */

  const load = useCallback(async (mode: 'initial' | 'more') => {
    if (mode === 'more') {
      if (loadingMoreRef.current || atEndRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      setMoreError(null);
    } else {
      abortRef.current?.abort();
      // A fresh ranking should be able to show the same posts again, otherwise
      // retuning the weights would silently hide the reorder you just asked for.
      seenRef.current = new Set();
      atEndRef.current = false;
      setAtEnd(false);
      setMoreError(null);
      setError(null);
      setStatus('loading');
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          weights: loadWeights(),
          rules: loadRules(),
          seen: [...seenRef.current],
          limit: 25,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (FeedResponse & { error?: string })
        | { error?: string }
        | null;

      if (!response.ok || !payload || !('posts' in payload)) {
        const message =
          (payload && 'error' in payload && payload.error) ||
          `The feed request failed with status ${response.status}.`;
        throw new Error(message);
      }

      const incoming = payload.posts;
      for (const item of incoming) seenRef.current.add(item.post.id);

      // The server knows whether it ranked a real database or the demo world.
      // The empty state needs it, because "run npm run seed" is useless advice
      // when there is no project to seed into.
      setIsDemo(Boolean(payload.diagnostics?.isDemo));

      if (mode === 'initial') {
        setPosts(incoming);
        setActiveId(incoming[0]?.post.id ?? null);
        setStatus('ready');
      } else if (incoming.length === 0) {
        atEndRef.current = true;
        setAtEnd(true);
      } else {
        setPosts((previous) => {
          const already = new Set(previous.map((item) => item.post.id));
          const fresh = incoming.filter((item) => !already.has(item.post.id));
          return fresh.length > 0 ? [...previous, ...fresh] : previous;
        });
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : 'The feed request failed.';
      if (mode === 'initial') {
        setError(message);
        setStatus('error');
      } else {
        setMoreError(message);
      }
    } finally {
      if (mode === 'more') {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  /* --- mount, and every time the weights change ---------------------------- */

  useEffect(() => {
    // The first ranking request has to start somewhere, and mount is that
    // place. It resets state that is already at its initial value, so React
    // bails out rather than cascading, but the rule cannot see that statically.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load('initial');

    const onTuningChanged = () => {
      scrollerRef.current?.scrollTo({ top: 0 });
      void load('initial');
    };

    window.addEventListener(TUNING_CHANGED_EVENT, onTuningChanged);
    return () => {
      window.removeEventListener(TUNING_CHANGED_EVENT, onTuningChanged);
      abortRef.current?.abort();
    };
  }, [load]);

  /* --- which card is on screen -------------------------------------------- */

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { id: string; ratio: number } | null = null;

        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.feedCard;
          if (!id || !entry.isIntersecting) continue;
          if (entry.intersectionRatio < 0.6) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { id, ratio: entry.intersectionRatio };
          }
        }

        if (!best) return;
        const id = best.id;
        setActiveId(id);
        seenRef.current.add(id);

        // Two cards from the bottom, start the next page.
        const list = postsRef.current;
        const index = list.findIndex((item) => item.post.id === id);
        if (index >= 0 && index >= list.length - 2) void load('more');
      },
      { root, threshold: [0.6, 0.9] },
    );

    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [load, status]);

  // Newly appended cards join the same observer. Observing twice is a no-op.
  useEffect(() => {
    const observer = observerRef.current;
    const root = scrollerRef.current;
    if (!observer || !root) return;
    root
      .querySelectorAll<HTMLElement>('[data-feed-card]')
      .forEach((element) => observer.observe(element));
  }, [posts, status]);

  /* --- states -------------------------------------------------------------- */

  if (status === 'loading' && posts.length === 0) return <FeedSkeleton />;

  if (status === 'error' && posts.length === 0) {
    return (
      <FeedError
        message={error ?? 'The feed request failed.'}
        onRetry={() => void load('initial')}
      />
    );
  }

  if (status === 'ready' && posts.length === 0) {
    return <FeedEmpty username={viewerUsername} isDemo={isDemo} />;
  }

  // A rerank that fails while cards are already on screen keeps the old feed
  // rather than blanking it, so the failure has to be said out loud up here.
  const rerankFailed = status === 'error';
  const problem = rerankFailed
    ? (error ?? 'The feed did not reload.')
    : moreError;

  return (
    <>
      <header className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] lg:left-[88px] xl:left-[240px]">
        <span className="pointer-events-auto rounded-full bg-ground/55 px-3 py-1.5 text-[15px] font-bold leading-none text-ink backdrop-blur-md">
          For you
        </span>

        {customTuning ? (
          <Link
            href="/settings/algorithm"
            className="pointer-events-auto rounded-full border border-accent/70 bg-ground/55 px-2.5 py-1.5 text-[12px] font-semibold leading-none text-accent backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-accent/15 active:translate-y-px active:bg-accent/25"
          >
            Custom weights
          </Link>
        ) : null}

        {loadingMore ? (
          <span className="pointer-events-auto rounded-full bg-ground/55 px-2.5 py-1.5 text-[12px] font-medium leading-none text-ink-muted backdrop-blur-md">
            Ranking more
          </span>
        ) : null}

        {problem && !loadingMore ? (
          <button
            type="button"
            onClick={() => void load(rerankFailed ? 'initial' : 'more')}
            title={problem}
            className="pointer-events-auto rounded-full border border-danger/50 bg-ground/55 px-2.5 py-1.5 text-[12px] font-semibold leading-none text-ink backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-surface active:translate-y-px active:bg-surface-2"
          >
            {rerankFailed ? 'The feed did not reload. Retry' : 'More posts failed to load. Retry'}
          </button>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="feed-scroller h-[100dvh] snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
      >
        {posts.map((ranked) => (
          <PostCard
            key={ranked.post.id}
            ranked={ranked}
            isActive={activeId === ranked.post.id}
            viewerId={viewerId}
          />
        ))}

        {atEnd ? (
          <section className="flex h-[100dvh] snap-start snap-always flex-col items-center justify-center gap-4 px-8 pb-[calc(80px_+_env(safe-area-inset-bottom))] text-center lg:pb-12">
            <CheckCircle size={30} weight="fill" className="text-repost" />
            <h2 className="text-[20px] font-bold tracking-tight">
              That is every post the ranker had
            </h2>
            <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-muted">
              The feed is out of new posts for this session. Refresh to score
              everything again from the top, or change a weight and watch the
              order move.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  scrollerRef.current?.scrollTo({ top: 0 });
                  void load('initial');
                }}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-press active:translate-y-px active:bg-accent-press"
              >
                <ArrowClockwise size={17} weight="bold" />
                Refresh the feed
              </button>
              <Link
                href="/settings/algorithm"
                className="inline-flex items-center rounded-full border border-hairline px-4 py-2 text-[15px] font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-surface active:translate-y-px active:bg-surface-2"
              >
                Change the weights
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
