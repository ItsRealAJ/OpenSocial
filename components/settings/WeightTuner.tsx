'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from '@phosphor-icons/react/ssr';
import { Button } from '@/components/ui/Button';
import { PresetPicker } from '@/components/settings/PresetPicker';
import { WeightSlider, formatTunedValue } from '@/components/settings/WeightSlider';
import {
  loadRules,
  loadWeights,
  resetTuning,
  saveRules,
  saveWeights,
} from '@/lib/algorithm/storage';
import {
  FEED_RULES,
  RULE_RANGES,
  WEIGHTS,
  WEIGHT_RANGES,
} from '@/lib/algorithm/weights';
import { humanAction } from '@/lib/format';
import {
  NEGATIVE_ACTIONS,
  POSITIVE_ACTIONS,
  type ActionName,
  type FeedRules,
  type Weights,
} from '@/lib/types';

/**
 * Plain-English notes for every weight, written from the comments in
 * weights.ts. Each one says what raising and lowering that number does to
 * the feed, because a slider with no consequence attached is just a toy.
 */
const WEIGHT_NOTES: Record<ActionName, string> = {
  like: 'The cheapest signal there is, and the reference point for every other number on this page. Raise it and the feed fills with mass appeal posts that are easy to like and easy to forget. Lower it toward 0 and raw popularity stops counting for anything.',
  reply:
    'Someone typed a sentence back, which costs far more than a tap. Raise it and the feed gets argumentative, because the posts that start fights also start conversations. Lower it and the feed goes quiet and passive.',
  repost:
    'The viewer put their own name on the post in public. Raise it and the feed chases shareable takes. Lower it and reach stops depending on who is willing to endorse you in front of their followers.',
  bookmark:
    'A private save that nobody else can see, which is what makes it honest. Raise it for a practical feed of things worth keeping. Lower it and useful posts lose their edge over loud ones.',
  share:
    'Sent to somebody off the app. Rare, and rarely accidental. Raise it to favour posts worth showing to a person who is not even here.',
  profile_click:
    'The viewer tapped through to find out who wrote this, which says more about the author than the post. Raise it to surface interesting accounts rather than interesting one-off posts.',
  video_watch_complete:
    'Watched the reel all the way through. Measured in seconds of a life rather than a tap, so it is the strongest thing video can earn. Raise it and video crowds text out of the feed. Lower it to rebalance toward reading.',
  follow_author:
    'The viewer followed the author because of this post, which changes what they see for months. Raise it and the feed becomes a discovery engine for new accounts. Lower it and you mostly see the accounts you already have.',
  mute_author:
    'A predicted "stop showing me this person". Drag it further down to make one prediction of that outweigh a long run of likes. Move it toward 0 and accounts that wear people out keep their reach.',
  block_author:
    'The catastrophic outcome. At -75 against a like at +1, one predicted block cancels dozens of predicted likes, which is the ceiling on how much reach engagement can buy an author people dislike.',
  report:
    'A claim that the post should not exist at all, not merely that the viewer dislikes it. It is the worst outcome the ranker can predict, so it carries the largest number in the file.',
  not_interested:
    'Explicit "not interested" feedback. It is aimed at the post rather than the person, so it sits milder than a mute. Drag it down to make a single dismissal count for more.',
  video_skip_early:
    'Scrolled past a reel in the first couple of seconds. Weak on its own, which is why the number is small, but it fires constantly, so it is the main brake on bad video. Drag it down for a stricter video feed.',
};

const RULE_LABELS: Record<keyof FeedRules, string> = {
  outOfNetworkDiscount: 'Out of network discount',
  maxConsecutiveSameAuthor: 'Author diversity cap',
  recencyHalfLifeHours: 'Recency half-life (hours)',
  candidatePoolSize: 'Candidate pool size',
  inNetworkShare: 'In network share',
  maxConsecutiveSameMedia: 'Media blending cap',
};

const RULE_NOTES: Record<keyof FeedRules, string> = {
  outOfNetworkDiscount:
    'Multiplies the score of every post from an account you do not follow. At 1 a stranger competes on equal terms with the people you chose. At 0.5 a stranger needs twice the score to hold the same slot, so the feed stays close to home. Above 1 the ranker actively prefers strangers.',
  maxConsecutiveSameAuthor:
    'The most posts by one account the feed will place back to back. Set it to 1 and nobody ever appears twice in a row. Raise it and a single prolific account can take over a whole run of the feed.',
  recencyHalfLifeHours:
    'How long a post takes to lose half its score to age. At 6 hours it is worth half as much six hours after it went up, a quarter after twelve. Raise it toward 720 and week-old posts compete with fresh ones. Set it very low and almost nothing but age matters, which turns this into a chronological feed.',
  candidatePoolSize:
    'How many posts the pipeline pulls out of the database before it ranks anything. A bigger pool means better picks and a slower feed. A smaller pool is quick and starts repeating itself sooner.',
  inNetworkShare:
    'The share of that pool reserved for accounts you already follow. At 1 you see nothing but the people you chose. At 0 every post is a discovery, whether you asked for one or not.',
  maxConsecutiveSameMedia:
    'The most posts of the same kind, video or image or text, allowed back to back. Keep it low and reels interleave with reading. Raise it and the feed runs in long blocks of one thing.',
};

const RULE_KEYS = Object.keys(FEED_RULES) as (keyof FeedRules)[];

interface Change {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function WeightTuner() {
  const [weights, setWeights] = useState<Weights | null>(null);
  const [rules, setRules] = useState<FeedRules | null>(null);
  const [didReset, setDidReset] = useState(false);

  // localStorage is not readable during render on the server, so the values
  // arrive after mount and the page renders a skeleton until they do. The read
  // is deferred by a microtask, which keeps it a plain pull from an external
  // store rather than a synchronous cascading render, and still lands before
  // the browser paints.
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      setWeights(loadWeights());
      setRules(loadRules());
    });
    return () => {
      live = false;
    };
  }, []);

  // Writes are debounced so dragging a slider does not hit localStorage on
  // every frame. Each write dispatches TUNING_CHANGED_EVENT, which is what an
  // already open feed tab listens for.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ weights?: Weights; rules?: FeedRules }>({});

  const flush = useCallback(() => {
    const next = pending.current;
    pending.current = {};
    if (next.weights) saveWeights(next.weights);
    if (next.rules) saveRules(next.rules);
  }, []);

  const scheduleSave = useCallback(
    (next: { weights?: Weights; rules?: FeedRules }) => {
      pending.current = { ...pending.current, ...next };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 200);
    },
    [flush],
  );

  // Leaving the page inside the debounce window must not lose the edit.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  function updateWeight(action: ActionName, value: number) {
    setDidReset(false);
    setWeights((current) => {
      if (!current) return current;
      const next = { ...current, [action]: value };
      scheduleSave({ weights: next });
      return next;
    });
  }

  function updateRule(key: keyof FeedRules, value: number) {
    setDidReset(false);
    setRules((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      scheduleSave({ rules: next });
      return next;
    });
  }

  function applyPreset(nextWeights: Weights, nextRules: FeedRules) {
    setDidReset(false);
    setWeights(nextWeights);
    setRules(nextRules);
    scheduleSave({ weights: nextWeights, rules: nextRules });
  }

  function handleReset() {
    if (timer.current) clearTimeout(timer.current);
    pending.current = {};
    resetTuning();
    setWeights({ ...WEIGHTS });
    setRules({ ...FEED_RULES });
    setDidReset(true);
  }

  if (!weights || !rules) return <TunerSkeleton />;

  const changes = collectChanges(weights, rules);

  return (
    <div>
      <p className="max-w-[62ch] text-[15px] leading-relaxed text-ink-muted">
        Every slider on this page is one property of the same object exported from{' '}
        <code className="font-mono text-[13px] text-ink">lib/algorithm/weights.ts</code>.
        What you change is stored in this browser only, so the file on disk and everybody
        else on this app are untouched. The feed reranks with your numbers the next time
        you open it.
      </p>

      <ChangeSummary changes={changes} />

      <div className="mt-10">
        <PresetPicker weights={weights} rules={rules} onApply={applyPreset} />
      </div>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-[17px] font-bold leading-tight">Positive actions</h2>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
          Each number is multiplied by the predicted chance of that action and the results
          are added together. Cheap actions carry small numbers, expensive ones carry large
          numbers.
        </p>
        <div className="mt-6 space-y-7">
          {POSITIVE_ACTIONS.map((action) => (
            <WeightSlider
              key={action}
              label={humanAction(action)}
              description={WEIGHT_NOTES[action]}
              value={weights[action]}
              defaultValue={WEIGHTS[action]}
              min={WEIGHT_RANGES[action].min}
              max={WEIGHT_RANGES[action].max}
              step={WEIGHT_RANGES[action].step}
              onChange={(next) => updateWeight(action, next)}
            />
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-[17px] font-bold leading-tight">Negative actions</h2>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
          These are an order of magnitude larger than the positives on purpose. That gap is
          what stops the ranker from buying attention with things that make people want to
          leave. Set them all to 0 and you have a pure engagement maximiser.
        </p>
        <div className="mt-6 space-y-7">
          {NEGATIVE_ACTIONS.map((action) => (
            <WeightSlider
              key={action}
              label={humanAction(action)}
              description={WEIGHT_NOTES[action]}
              value={weights[action]}
              defaultValue={WEIGHTS[action]}
              min={WEIGHT_RANGES[action].min}
              max={WEIGHT_RANGES[action].max}
              step={WEIGHT_RANGES[action].step}
              isNegative
              onChange={(next) => updateWeight(action, next)}
            />
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-[17px] font-bold leading-tight">Feed shaping</h2>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
          Scoring decides what is good. These decide what actually ships, after every
          candidate already has a score, because the twelve highest scoring posts are
          usually twelve posts by three people about one thing.
        </p>
        <div className="mt-6 space-y-7">
          {RULE_KEYS.map((key) => (
            <WeightSlider
              key={key}
              label={RULE_LABELS[key]}
              description={RULE_NOTES[key]}
              value={rules[key]}
              defaultValue={FEED_RULES[key]}
              min={RULE_RANGES[key].min}
              max={RULE_RANGES[key].max}
              step={RULE_RANGES[key].step}
              onChange={(next) => updateRule(key, next)}
            />
          ))}
        </div>
      </section>

      <div className="sticky bottom-[calc(56px_+_env(safe-area-inset-bottom))] z-20 -mx-4 mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-ground/90 px-4 py-3 backdrop-blur-md lg:bottom-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleReset}>
            Reset to defaults
          </Button>
          {didReset ? (
            <p
              role="status"
              className="flex items-center gap-1.5 text-[13px] text-repost"
            >
              <Check size={14} weight="bold" aria-hidden="true" />
              Back to the numbers in the file.
            </p>
          ) : null}
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-press active:translate-y-px active:bg-accent-press"
        >
          View the feed
          <ArrowRight size={15} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** The live diff against weights.ts, so a tuned feed is never a mystery. */
function ChangeSummary({ changes }: { changes: Change[] }) {
  if (changes.length === 0) {
    return (
      <p className="mt-6 rounded-[16px] border border-hairline px-4 py-3 text-[13px] text-ink-muted">
        Nothing is changed. Every number below is the number in the file.
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-[16px] bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-ink">
        Changed from the file defaults{' '}
        <span className="font-mono tabular-nums text-ink-muted">({changes.length})</span>
      </h2>
      <ul className="mt-3 space-y-1.5">
        {changes.map((change) => (
          <li
            key={change.key}
            className="flex items-baseline justify-between gap-4 text-[13px]"
          >
            <span className="min-w-0 truncate text-ink">{change.label}</span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums text-ink-muted">
              {change.from}
              <span className="sr-only">is now</span>
              <ArrowRight size={11} weight="bold" aria-hidden="true" />
              <span className="text-ink">{change.to}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function collectChanges(weights: Weights, rules: FeedRules): Change[] {
  const changes: Change[] = [];

  for (const action of [...POSITIVE_ACTIONS, ...NEGATIVE_ACTIONS]) {
    const step = WEIGHT_RANGES[action].step;
    if (Math.abs(weights[action] - WEIGHTS[action]) > 1e-9) {
      changes.push({
        key: `weight-${action}`,
        label: humanAction(action),
        from: formatTunedValue(WEIGHTS[action], step),
        to: formatTunedValue(weights[action], step),
      });
    }
  }

  for (const key of RULE_KEYS) {
    const step = RULE_RANGES[key].step;
    if (Math.abs(rules[key] - FEED_RULES[key]) > 1e-9) {
      changes.push({
        key: `rule-${key}`,
        label: RULE_LABELS[key],
        from: formatTunedValue(FEED_RULES[key], step),
        to: formatTunedValue(rules[key], step),
      });
    }
  }

  return changes;
}

/** Matches the real row shapes so the page does not jump when values land. */
function TunerSkeleton() {
  return (
    <div>
      <span className="sr-only" role="status">
        Loading your saved values.
      </span>
      <div aria-hidden="true" className="animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-full rounded-full bg-surface" />
          <div className="h-4 w-4/5 rounded-full bg-surface" />
          <div className="h-4 w-2/3 rounded-full bg-surface" />
        </div>

        <div className="mt-6 h-[46px] rounded-[16px] bg-surface" />

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-[128px] rounded-[16px] bg-surface" />
          ))}
        </div>

        {[8, 5, 6].map((rows, group) => (
          <div key={group} className="mt-10 border-t border-hairline pt-6">
            <div className="h-5 w-40 rounded-full bg-surface" />
            <div className="mt-2 h-3 w-3/4 rounded-full bg-surface" />
            <div className="mt-6 space-y-7">
              {Array.from({ length: rows }).map((_, row) => (
                <div key={row}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="h-4 w-32 rounded-full bg-surface" />
                    <div className="h-6 w-[110px] rounded-full bg-surface" />
                  </div>
                  <div className="mt-4 h-1 w-full rounded-full bg-surface" />
                  <div className="mt-4 h-3 w-full rounded-full bg-surface" />
                  <div className="mt-1.5 h-3 w-2/3 rounded-full bg-surface" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
