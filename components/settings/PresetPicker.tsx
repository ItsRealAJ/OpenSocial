'use client';

import { Check } from '@phosphor-icons/react/ssr';
import { FEED_RULES, RULE_RANGES, WEIGHTS } from '@/lib/algorithm/weights';
import type { FeedRules, Weights } from '@/lib/types';

/**
 * Four whole configurations, so the point of the file lands before anyone
 * touches a single slider. Three of these are the worked examples in the
 * README; the fourth is the file itself.
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  weights: Weights;
  rules: FeedRules;
}

export const PRESETS: Preset[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description:
      'The numbers in the file. Replies and finished videos outrank likes, and one predicted block costs more reach than dozens of predicted likes.',
    weights: { ...WEIGHTS },
    rules: { ...FEED_RULES },
  },
  {
    id: 'chronological',
    name: 'Chronological',
    description:
      'Newest first, ranking effectively switched off. Every weight is zero except a sliver of like weight so ties break sensibly, and a post loses half its value every 30 minutes.',
    weights: {
      like: 0.001,
      reply: 0,
      repost: 0,
      bookmark: 0,
      share: 0,
      profile_click: 0,
      video_watch_complete: 0,
      follow_author: 0,
      mute_author: 0,
      block_author: 0,
      report: 0,
      not_interested: 0,
      video_skip_early: 0,
    },
    rules: {
      outOfNetworkDiscount: 1,
      maxConsecutiveSameAuthor: RULE_RANGES.maxConsecutiveSameAuthor.max,
      recencyHalfLifeHours: RULE_RANGES.recencyHalfLifeHours.min,
      candidatePoolSize: 200,
      inNetworkShare: 1,
      maxConsecutiveSameMedia: RULE_RANGES.maxConsecutiveSameMedia.max,
    },
  },
  {
    id: 'maximum-engagement',
    name: 'Maximum engagement',
    description:
      'Likes, reposts and finished videos are worth everything, nothing is worth less than zero, and a post stays in play for a week. Expect loud video from strangers and no brake on the accounts people mute. This is the configuration that is bad for people, which is why the defaults are not this.',
    weights: {
      like: 30,
      reply: 10,
      repost: 35,
      bookmark: 4,
      share: 6,
      profile_click: 3,
      video_watch_complete: 50,
      follow_author: 12,
      mute_author: 0,
      block_author: 0,
      report: 0,
      not_interested: 0,
      video_skip_early: 0,
    },
    rules: {
      outOfNetworkDiscount: 1.2,
      maxConsecutiveSameAuthor: 6,
      recencyHalfLifeHours: 168,
      candidatePoolSize: 400,
      inNetworkShare: 0.2,
      maxConsecutiveSameMedia: 10,
    },
  },
  {
    id: 'conversation-first',
    name: 'Conversation first',
    description:
      'A reply is worth ninety likes, the same account never appears twice in a row, and posts fade within a few hours. Negative weights stay heavy, so the argument still has to be one people want to be in.',
    weights: {
      like: 0.5,
      reply: 45,
      repost: 2,
      bookmark: 6,
      share: 5,
      profile_click: 4,
      video_watch_complete: 6,
      follow_author: 12,
      mute_author: -50,
      block_author: -90,
      report: -120,
      not_interested: -40,
      video_skip_early: -8,
    },
    rules: {
      outOfNetworkDiscount: 0.7,
      maxConsecutiveSameAuthor: 1,
      recencyHalfLifeHours: 3,
      candidatePoolSize: 200,
      inNetworkShare: 0.5,
      maxConsecutiveSameMedia: 3,
    },
  },
];

/** Float-safe comparison of two bags of numbers with the same keys. */
function sameNumbers<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every(
    (key) => Math.abs((a[key] as number) - (b[key] as number)) < 1e-9,
  );
}

export function PresetPicker({
  weights,
  rules,
  onApply,
}: {
  weights: Weights;
  rules: FeedRules;
  onApply: (weights: Weights, rules: FeedRules) => void;
}) {
  const activeId = PRESETS.find(
    (preset) => sameNumbers(preset.weights, weights) && sameNumbers(preset.rules, rules),
  )?.id;

  return (
    <div>
      <h2 className="text-[17px] font-bold leading-tight">Start from a preset</h2>
      <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
        Each one writes every slider on this page at once. Nothing here is permanent, so
        try the one you disagree with.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PRESETS.map((preset) => {
          const active = preset.id === activeId;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => onApply({ ...preset.weights }, { ...preset.rules })}
              className={`rounded-[16px] border p-4 text-left transition-[background-color,border-color,transform] duration-150 active:translate-y-px active:bg-surface-2 disabled:pointer-events-none disabled:opacity-45 ${
                active
                  ? 'border-accent bg-surface'
                  : 'border-hairline bg-surface hover:bg-surface-2'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{preset.name}</span>
                {active ? (
                  <Check size={15} weight="bold" className="text-accent" aria-hidden="true" />
                ) : null}
                {active ? <span className="sr-only">Currently applied</span> : null}
              </span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-muted">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
