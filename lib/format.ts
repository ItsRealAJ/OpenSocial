/** Small display helpers shared by every component. */

/** 1234 -> "1.2K". X-style compact counts. */
export function compactCount(n: number | undefined): string {
  const value = n ?? 0;
  if (value < 1_000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1_000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.floor(k)}K`;
  }
  const m = value / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.floor(m)}M`;
}

/** "2h", "3d", "Mar 4". X-style relative timestamps. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Absolute timestamp for the post detail page. */
export function absoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Scores print to two decimals everywhere so columns line up. */
export function formatScore(n: number): string {
  return n.toFixed(2);
}

/** Probabilities print as percentages with enough precision to be useful. */
export function formatProbability(p: number): string {
  if (p === 0) return '0%';
  if (p < 0.001) return `${(p * 100).toFixed(3)}%`;
  if (p < 0.01) return `${(p * 100).toFixed(2)}%`;
  return `${(p * 100).toFixed(1)}%`;
}

/** "video_watch_complete" -> "Video watch complete". */
export function humanAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
