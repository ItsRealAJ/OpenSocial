'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Warning } from '@phosphor-icons/react/ssr';
import { SetupNotice, SETUP_NOTICE_TITLE_ID } from '@/components/ui/SetupNotice';

/**
 * =============================================================================
 *  THE DEMO GATE
 * =============================================================================
 *
 *  Mounted once in the root layout. When Supabase is configured it renders
 *  nothing at all and costs nothing. When it is not, it puts the setup notice
 *  on screen as a dismissible dialog over a fully usable app.
 *
 *  ---------------------------------------------------------------------------
 *  THE DISMISSAL IS DELIBERATELY NOT PERSISTED. DO NOT "FIX" THIS.
 *  ---------------------------------------------------------------------------
 *  There is no localStorage, no sessionStorage and no cookie here on purpose.
 *  `open` is plain React state in a component mounted at the root, so:
 *
 *    - closing it keeps it closed while you navigate the app client-side,
 *      which is what makes the app browsable, and
 *    - it comes back on every hard load, refresh and new tab, because a fresh
 *      React tree means a fresh useState(true).
 *
 *  That combination is the whole point. Demo mode means the data is fake and
 *  nothing you do is saved, and someone who has been clicking around for ten
 *  minutes needs to be told that again rather than allowed to forget it.
 *  Persisting the dismissal would silence the warning permanently after one
 *  click, which is exactly the failure this is designed to avoid.
 * =============================================================================
 */
/**
 * createPortal needs document.body, which does not exist during the server
 * render of the root layout. useSyncExternalStore is the sanctioned way to ask
 * "am I on the client yet" without a setState inside an effect: the server
 * snapshot is false, the client snapshot is true, and nothing ever changes
 * after hydration, so the store never needs to notify.
 */
const subscribeNever = () => () => {};

export function DemoGate({ isDemo }: { isDemo: boolean }) {
  const [open, setOpen] = useState(true);
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  /** True only for a close the user performed, so focus goes back to the pill. */
  const returnFocus = useRef(false);
  const reduced = useReducedMotion();

  const dismiss = useCallback(() => {
    returnFocus.current = true;
    setOpen(false);
  }, []);

  const reopen = useCallback(() => setOpen(true), []);

  // Escape closes.
  useEffect(() => {
    if (!isDemo || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDemo, open, dismiss]);

  // Focus lands on the panel so a keyboard user is inside the dialog.
  useEffect(() => {
    if (!isDemo || !open || !mounted) return;
    panelRef.current?.focus();
  }, [isDemo, open, mounted]);

  // On close, focus goes to the pill that replaced the dialog. The pill only
  // exists after the first dismissal, so this runs after that render rather
  // than inside the click handler.
  useEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    pillRef.current?.focus();
  }, [open]);

  // Nothing behind the dialog should scroll while it is up.
  useEffect(() => {
    if (!isDemo || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isDemo, open]);

  if (!isDemo) return null;

  if (!open) {
    return (
      <button
        ref={pillRef}
        type="button"
        onClick={reopen}
        aria-label="Reopen the setup instructions for demo mode"
        className="fixed bottom-[calc(72px_+_env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-ink active:translate-y-px active:bg-hairline disabled:pointer-events-none lg:bottom-6 lg:right-6"
      >
        <Warning size={16} weight="fill" className="text-accent" />
        Demo data
      </button>
    );
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-[2px]"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Centring lives on this wrapper, not on the panel: motion writes an
          inline transform, which would fight a translate-based centre. The
          wrapper ignores pointer events so a click beside the panel still
          reaches the backdrop above. */}
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={SETUP_NOTICE_TITLE_ID}
          tabIndex={-1}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
          className="pointer-events-auto flex max-h-[85dvh] w-full max-w-[560px] flex-col rounded-[16px] border border-hairline bg-surface outline-none"
        >
          <SetupNotice onDismiss={dismiss} />
        </motion.div>
      </div>
    </>,
    document.body,
  );
}
