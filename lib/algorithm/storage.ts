/**
 * Reads and writes the viewer's tuned weights in localStorage.
 *
 * The feed sends whatever it finds here to /api/feed on every load, so editing
 * a slider on /settings/algorithm and going back to the feed reorders it. If
 * nothing is stored, the server falls back to the defaults in weights.ts.
 */
'use client';

import type { FeedRules, Weights } from '@/lib/types';
import { FEED_RULES, WEIGHTS } from './weights';

const WEIGHTS_KEY = 'open-social:weights';
const RULES_KEY = 'open-social:rules';

/** Fires whenever weights change, so an open feed tab can refetch. */
export const TUNING_CHANGED_EVENT = 'open-social:tuning-changed';

export function loadWeights(): Weights {
  return readJson(WEIGHTS_KEY, WEIGHTS);
}

export function loadRules(): FeedRules {
  return readJson(RULES_KEY, FEED_RULES);
}

export function saveWeights(weights: Weights): void {
  writeJson(WEIGHTS_KEY, weights);
}

export function saveRules(rules: FeedRules): void {
  writeJson(RULES_KEY, rules);
}

export function resetTuning(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(WEIGHTS_KEY);
  window.localStorage.removeItem(RULES_KEY);
  window.dispatchEvent(new Event(TUNING_CHANGED_EVENT));
}

/** True when the viewer has changed anything away from the file defaults. */
export function hasCustomTuning(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.localStorage.getItem(WEIGHTS_KEY) !== null ||
    window.localStorage.getItem(RULES_KEY) !== null
  );
}

function readJson<T extends object>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return { ...fallback };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as Partial<T>;
    const merged = { ...fallback };
    for (const [k, v] of Object.entries(parsed)) {
      if (k in merged && typeof v === 'number' && Number.isFinite(v)) {
        (merged as Record<string, number>)[k] = v;
      }
    }
    return merged;
  } catch {
    // Corrupted localStorage should never take the feed down.
    return { ...fallback };
  }
}

function writeJson(key: string, value: object): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(TUNING_CHANGED_EVENT));
  } catch {
    // Private browsing mode, quota exceeded. The defaults still work.
  }
}
