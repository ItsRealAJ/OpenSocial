'use client';

import { useRef, useState } from 'react';
import type { RankedPost } from '@/lib/types';
import { formatScore } from '@/lib/format';
import { ScorePanel } from './ScorePanel';

/**
 * The score, always on screen, always tappable.
 *
 * Every other feed in the world hides its ranking. This one prints it in the
 * corner of every card and opens the full arithmetic when you touch it, which
 * is the reason the app exists.
 */
export function ScoreChip({ ranked }: { ranked: RankedPost }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const inNetwork = ranked.source === 'in_network';

  const close = () => {
    setOpen(false);
    // Focus goes back where it came from, so the keyboard user is not dumped
    // at the top of the document.
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="group inline-flex items-center gap-2 rounded-full border border-hairline bg-ground/55 py-1.5 pl-2.5 pr-3 backdrop-blur-md transition-[background-color,border-color,transform] duration-150 hover:border-ink-muted hover:bg-ground/75 active:translate-y-px active:bg-surface"
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${inNetwork ? 'bg-accent' : 'bg-ink-muted'}`}
        />
        <span className="font-mono text-[13px] font-medium leading-none tabular-nums text-ink">
          {formatScore(ranked.score)}
        </span>
        <span className="sr-only">
          {`Score ${formatScore(ranked.score)}, ${inNetwork ? 'in network' : 'out of network'}. Open the score breakdown.`}
        </span>
      </button>

      {open ? <ScorePanel ranked={ranked} onClose={close} /> : null}
    </>
  );
}
