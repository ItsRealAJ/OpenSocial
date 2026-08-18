'use client';

import { useId, useState } from 'react';

/**
 * One tunable number. Used for every entry in WEIGHTS and every entry in
 * FEED_RULES, which is why it takes its bounds as props instead of looking
 * them up: WEIGHT_RANGES and RULE_RANGES have different shapes of value.
 */
export interface WeightSliderProps {
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  /** Paints the thumb red via the global .is-negative rule. */
  isNegative?: boolean;
  onChange: (next: number) => void;
}

/** How many decimals a step implies. 0.05 -> 2, 0.5 -> 1, 1 -> 0, 10 -> 0. */
function decimalPlaces(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * Prints a tuned number at the precision its step implies, so a column of
 * weights lines up. Values typed by hand can be finer than the step (a preset
 * uses 0.001), so anything the step cannot express keeps its own precision.
 */
export function formatTunedValue(value: number, step: number): string {
  const fixed = value.toFixed(decimalPlaces(step));
  if (Number(fixed) === value) return fixed;
  return String(Number(value.toFixed(4)));
}

export function WeightSlider({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step,
  isNegative = false,
  onChange,
}: WeightSliderProps) {
  const uid = useId();
  const sliderId = `range-${uid}`;
  const numberId = `number-${uid}`;
  const descriptionId = `about-${uid}`;

  // The number field keeps a draft while it is being typed into, so half
  // finished values like "-" or "0." survive a keystroke. null means "just
  // mirror the value", which is what makes a preset or a reset land in the
  // field with no syncing effect.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatTunedValue(value, step);

  const changed = Math.abs(value - defaultValue) > 1e-9;

  function handleTyping(raw: string) {
    setDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    // Live update only while the typed value is already in range. Anything
    // out of range waits for blur, where it gets clamped.
    if (parsed >= min && parsed <= max) onChange(parsed);
  }

  function commit() {
    const raw = draft;
    setDraft(null);
    if (raw === null) return;
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, parsed));
    if (Math.abs(clamped - value) > 1e-9) onChange(clamped);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={sliderId} className="text-[15px] font-semibold leading-tight">
          {label}
        </label>

        <div className="flex shrink-0 items-center gap-2">
          {changed ? (
            <span className="font-mono text-[12px] tabular-nums text-ink-muted">
              default {formatTunedValue(defaultValue, step)}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={`font-mono text-[15px] tabular-nums ${
              isNegative && value < 0 ? 'text-danger' : 'text-ink'
            }`}
          >
            {formatTunedValue(value, step)}
          </span>
          {/* The range enforces the step. This field is the escape hatch for
              an exact number, so it takes anything inside the bounds. */}
          <input
            id={numberId}
            type="number"
            inputMode="decimal"
            value={shown}
            min={min}
            max={max}
            step="any"
            aria-label={`${label}, exact value`}
            aria-describedby={descriptionId}
            onChange={(event) => handleTyping(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            className="w-[74px] rounded-full border border-hairline bg-surface px-2.5 py-1 text-right font-mono text-[13px] tabular-nums text-ink transition-colors hover:border-ink-muted hover:bg-surface-2 focus:border-accent active:bg-surface-2 disabled:opacity-45"
          />
        </div>
      </div>

      <input
        id={sliderId}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`mt-2 w-full disabled:opacity-45 ${isNegative ? 'is-negative' : ''}`}
      />

      <p
        id={descriptionId}
        className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted"
      >
        {description}
      </p>
    </div>
  );
}
