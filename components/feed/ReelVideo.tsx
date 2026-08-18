'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  VideoCameraSlash,
} from '@phosphor-icons/react/ssr';

/**
 * A reel.
 *
 * Two of the thirteen weighted actions are produced here rather than by a
 * button: video_watch_complete when the viewer stays to the end, and
 * video_skip_early when they leave in the first three seconds. Those are the
 * only signals in the app the user never consciously sends, so the rules for
 * firing them are deliberately strict and each one fires at most once a view.
 */
export function ReelVideo({
  src,
  isActive,
  onWatchComplete,
  onSkipEarly,
}: {
  src: string;
  isActive: boolean;
  onWatchComplete?: () => void;
  onSkipEarly?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [flashSpeaker, setFlashSpeaker] = useState(false);

  // Per-view bookkeeping. Refs, not state, because none of it should re-render.
  const completedRef = useRef(false);
  const playedSecondsRef = useRef(0);
  const lastTimeRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callbacks live in refs so changing them never restarts playback.
  const completeRef = useRef(onWatchComplete);
  const skipRef = useRef(onSkipEarly);

  useEffect(() => {
    completeRef.current = onWatchComplete;
    skipRef.current = onSkipEarly;
  }, [onWatchComplete, onSkipEarly]);

  /* --- play, pause, and the skip-early verdict ---------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      completedRef.current = false;
      playedSecondsRef.current = 0;
      lastTimeRef.current = 0;
      try {
        video.currentTime = 0;
      } catch {
        // Seeking before metadata lands throws in some browsers. Harmless.
      }
      if (barRef.current) barRef.current.style.width = '0%';
      const started = video.play();
      if (started) {
        // Autoplay can be refused. That is a policy decision, not an error.
        started.catch(() => {});
      }
      return;
    }

    video.pause();

    // Left before three seconds and never finished: that is a skip.
    if (
      !completedRef.current &&
      playedSecondsRef.current > 0 &&
      playedSecondsRef.current < 3
    ) {
      skipRef.current?.();
    }

    playedSecondsRef.current = 0;
    lastTimeRef.current = 0;
    try {
      video.currentTime = 0;
    } catch {
      // See above.
    }
    if (barRef.current) barRef.current.style.width = '0%';
  }, [isActive]);

  /* --- mute is set on the element, not just the attribute ----------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  /* --- progress and the completion signal --------------------------------- */

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const duration = video.duration;
    const current = video.currentTime;

    // Accumulate real playback time. Loops and seeks produce a negative or
    // oversized delta, which we drop rather than count.
    const delta = current - lastTimeRef.current;
    if (delta > 0 && delta < 1) playedSecondsRef.current += delta;
    lastTimeRef.current = current;

    if (!Number.isFinite(duration) || duration <= 0) return;

    const fraction = Math.min(1, current / duration);
    // Written straight to the DOM. timeupdate fires several times a second and
    // none of those ticks are worth a React render.
    if (barRef.current) barRef.current.style.width = `${fraction * 100}%`;

    if (!completedRef.current && fraction >= 0.9) {
      completedRef.current = true;
      completeRef.current?.();
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((value) => !value);
    setFlashSpeaker(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashSpeaker(false), 1000);
  }, []);

  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ground px-8 text-center">
        <VideoCameraSlash size={26} weight="regular" className="text-ink-muted" />
        <p className="text-[14px] text-ink-muted">
          This video could not be played.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted
        loop
        preload="metadata"
        className="h-full w-full object-cover"
        onCanPlay={() => setReady(true)}
        onLoadedData={() => setReady(true)}
        onError={() => setFailed(true)}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Tap target for mute. Sits under the text overlay and the rail. */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute video' : 'Mute video'}
        aria-pressed={muted}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent transition-colors duration-150 active:bg-black/10"
      >
        <span className="sr-only">{muted ? 'Unmute video' : 'Mute video'}</span>
      </button>

      {/* Speaker confirmation, about a second, then gone. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-ink transition-opacity duration-300 ${flashSpeaker ? 'opacity-100' : 'opacity-0'}`}
      >
        {muted ? (
          <SpeakerSimpleSlash size={26} weight="fill" />
        ) : (
          <SpeakerSimpleHigh size={26} weight="fill" />
        )}
      </span>

      {/* Persistent reminder that there is sound to turn on. */}
      {muted ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-[calc(58px_+_env(safe-area-inset-top))] inline-flex items-center gap-1.5 rounded-full bg-ground/55 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur-md"
        >
          <SpeakerSimpleSlash size={13} weight="fill" />
          Muted
        </span>
      ) : null}

      {/* First frame is not up yet. */}
      {ready ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-b from-surface via-ground to-surface"
        />
      )}

      {/* Playhead, clear of the phone nav. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[calc(60px_+_env(safe-area-inset-bottom))] h-[2px] bg-white/15 lg:bottom-0"
      >
        <div ref={barRef} className="h-full bg-accent" style={{ width: '0%' }} />
      </div>
    </div>
  );
}
