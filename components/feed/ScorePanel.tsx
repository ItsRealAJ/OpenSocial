'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { CaretDown, SlidersHorizontal, X as CloseIcon } from '@phosphor-icons/react/ssr';
import type { ActionContribution, RankedPost } from '@/lib/types';
import {
  compactCount,
  formatProbability,
  formatScore,
  humanAction,
} from '@/lib/format';

/**
 * The receipt for a single post.
 *
 * Everything here is read straight off the ScoreBreakdown the API returned. No
 * number is recomputed in the browser, because the whole claim of the project
 * is that the score you see is the score the ranker used.
 *
 * Bottom sheet on phones, right-hand panel from lg up. Same content, same
 * order, so someone reading it on a laptop and someone reading it on a phone
 * are looking at the same document.
 */
export function ScorePanel({
  ranked,
  onClose,
}: {
  ranked: RankedPost;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const reduced = useReducedMotion();

  const { breakdown, source } = ranked;
  const { signals, contributions, notes } = breakdown;

  const scale = useMemo(() => {
    const biggest = contributions.reduce(
      (max, c) => Math.max(max, Math.abs(c.contribution)),
      0,
    );
    return biggest > 0 ? biggest : 1;
  }, [contributions]);

  // Escape closes. Focus lands on the panel so a keyboard user is inside it.
  useEffect(() => {
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Freeze the snap feed underneath, otherwise a stray wheel gesture scrolls
  // the panel's own post out from behind it.
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.feed-scroller');
    if (!scroller) return;
    const top = scroller.scrollTop;
    scroller.style.overflowY = 'hidden';
    scroller.scrollTop = top;
    return () => {
      scroller.style.overflowY = '';
      scroller.scrollTop = top;
    };
  }, []);

  const discounted = Math.abs(breakdown.finalScore - breakdown.rawScore) > 0.005;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-panel-title"
        tabIndex={-1}
        initial={reduced ? false : { opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
        className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[88dvh] flex-col rounded-t-[16px] border-t border-hairline bg-surface outline-none lg:inset-y-0 lg:bottom-auto lg:left-auto lg:right-0 lg:h-[100dvh] lg:max-h-none lg:w-[460px] lg:rounded-t-none lg:rounded-l-[16px] lg:border-l lg:border-t-0"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 pb-4 pt-3">
          <div className="min-w-0">
            <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-hairline lg:hidden" />
            <h2
              id="score-panel-title"
              className="text-[17px] font-bold leading-tight tracking-tight"
            >
              Why this ranked here
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-muted">
              @{ranked.post.author.username}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the score breakdown"
            className="-mr-2 -mt-1 rounded-full p-2 text-ink transition-[background-color,transform] duration-150 hover:bg-surface-2 active:translate-y-px active:bg-hairline"
          >
            <CloseIcon size={18} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-5">
          {/* The number itself. */}
          <div className="flex items-end gap-3">
            <span className="font-mono text-[46px] font-medium leading-none tracking-tight tabular-nums text-ink">
              {formatScore(ranked.score)}
            </span>
            <span className="pb-1.5 text-[12px] uppercase tracking-[0.14em] text-ink-muted">
              final score
            </span>
          </div>

          {discounted ? (
            <p className="mt-2 font-mono text-[12px] tabular-nums text-ink-muted">
              raw {formatScore(breakdown.rawScore)} shaped to{' '}
              {formatScore(breakdown.finalScore)}
            </p>
          ) : (
            <p className="mt-2 font-mono text-[12px] tabular-nums text-ink-muted">
              raw {formatScore(breakdown.rawScore)}, no shaping applied
            </p>
          )}

          <p className="mt-4 text-[14px] leading-relaxed text-ink">
            {networkSentence(source, ranked.post.author.username)}
          </p>

          {/* Top contributors */}
          <Section title="Top contributors">
            <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">
              Phoenix predicts a probability for every action. Each one is
              multiplied by its weight, and the results are added up. These three
              moved the number most.
            </p>
            <ContributionTable rows={contributions.slice(0, 3)} scale={scale} />
          </Section>

          {/* Full list */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="flex w-full items-center justify-between gap-2 rounded-[16px] border border-hairline px-4 py-3 text-left text-[14px] font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-surface-2 active:translate-y-px active:bg-hairline"
            >
              <span>
                {showAll
                  ? 'Hide the full list'
                  : `Show all ${contributions.length} actions`}
              </span>
              <CaretDown
                size={16}
                weight="bold"
                className={`shrink-0 text-ink-muted transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
              />
            </button>

            {showAll ? (
              <div className="mt-4">
                <ContributionTable rows={contributions} scale={scale} />
                <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-3">
                  <span className="text-[13px] font-semibold text-ink">
                    Sum of the column
                  </span>
                  <span className="font-mono text-[14px] tabular-nums text-ink">
                    {formatScore(breakdown.rawScore)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Signals */}
          <Section title="What the ranker saw">
            <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">
              These are the inputs, and the only inputs, behind every probability
              above.
            </p>
            <dl className="divide-y divide-hairline border-y border-hairline">
              <SignalRow
                label="Follows author"
                value={signals.viewerFollowsAuthor ? 'Yes' : 'No'}
              />
              <SignalRow
                label="Past engagements with this author"
                value={String(signals.viewerAffinityToAuthor)}
              />
              <SignalRow
                label="Age in hours"
                value={signals.ageHours.toFixed(1)}
              />
              <SignalRow label="Media type" value={signals.mediaType} />
              <SignalRow
                label="Estimated impressions"
                value={compactCount(signals.impressions)}
              />
            </dl>
          </Section>

          {/* Notes */}
          {notes.length > 0 ? (
            <Section title="Shaping applied after scoring">
              <div className="space-y-2">
                {notes.map((note, i) => (
                  <p
                    key={i}
                    className="text-[14px] leading-relaxed text-ink-muted"
                  >
                    {note}
                  </p>
                ))}
              </div>
            </Section>
          ) : null}

          <p className="mt-8 border-l-2 border-accent/60 pl-4 text-[13px] leading-relaxed text-ink-muted">
            Every number above came from lib/algorithm/phoenix.ts. Nothing else
            influences this ordering.
          </p>

          <Link
            href="/settings/algorithm"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[15px] font-semibold text-accent transition-[background-color,transform] duration-150 hover:bg-surface-2 active:translate-y-px active:bg-hairline"
          >
            <SlidersHorizontal size={17} weight="bold" />
            Change these weights
          </Link>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Four aligned columns of mono numbers, plus a hairline bar per row scaled to
 * the biggest contribution on the post. The bar is what makes "reply is doing
 * all the work here" readable in under a second.
 */
function ContributionTable({
  rows,
  scale,
}: {
  rows: ActionContribution[];
  scale: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-3">
      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        Action
      </span>
      <span className="justify-self-end text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        P
      </span>
      <span className="justify-self-end text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        Weight
      </span>
      <span className="justify-self-end text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        Adds
      </span>
      <span className="col-span-4 mt-2 mb-1 h-px bg-hairline" />

      {rows.map((row) => {
        const negative = row.contribution < 0;
        const width = `${Math.min(100, (Math.abs(row.contribution) / scale) * 100)}%`;

        return (
          <div key={row.action} className="col-span-4 grid grid-cols-subgrid">
            <span className="truncate pt-2 text-[13px] leading-tight text-ink">
              {humanAction(row.action)}
            </span>
            <span className="justify-self-end pt-2 font-mono text-[12px] tabular-nums text-ink-muted">
              {formatProbability(row.probability)}
            </span>
            <span className="justify-self-end pt-2 font-mono text-[12px] tabular-nums text-ink-muted">
              {row.weight.toFixed(1)}
            </span>
            <span
              className={`justify-self-end pt-2 font-mono text-[13px] tabular-nums ${negative ? 'text-danger' : 'text-ink'}`}
            >
              {formatScore(row.contribution)}
            </span>
            <span className="col-span-4 mb-1 mt-1.5 block h-[2px] w-full rounded-full bg-hairline/50">
              <span
                className={`block h-full rounded-full ${negative ? 'bg-danger' : 'bg-accent'}`}
                style={{ width }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function networkSentence(
  source: RankedPost['source'],
  username: string,
): string {
  if (source === 'in_network') {
    return `In network. You follow @${username}, so this post reached you without a discount.`;
  }
  if (source === 'out_of_network_affinity') {
    return `Out of network. You do not follow @${username}, but you have engaged with their posts before, which is why they were considered at all.`;
  }
  return `Out of network. You have no connection to @${username}. This post is here because it is getting engagement broadly right now.`;
}
