import { Warning, X as CloseIcon } from '@phosphor-icons/react/ssr';
import { Button } from '@/components/ui/Button';

/**
 * =============================================================================
 *  THE SETUP NOTICE
 * =============================================================================
 *
 *  This used to be a full page: with no Supabase project configured there was
 *  nothing else to show. That is no longer true. The app now falls back to the
 *  in-memory demo world, so the situation is not "broken", it is "running on
 *  data that is not yours". That is a modal, not a wall.
 *
 *  So this component is now the panel INSIDE the dialog. DemoGate owns the
 *  dialog element itself (portal, role, focus, Escape, backdrop) because that
 *  behaviour has to live in one place, and this file keeps the one job it is
 *  good at: saying what is going on and how to fix it.
 *
 *  It returns three siblings rather than one wrapper, so DemoGate's panel can
 *  be a flex column with a pinned header, a scrolling body, and pinned buttons.
 *  That is what keeps "Keep looking around" reachable on a short window.
 * =============================================================================
 */

/** DemoGate points aria-labelledby at this, so both files agree on the id. */
export const SETUP_NOTICE_TITLE_ID = 'setup-notice-title';

export function SetupNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      {/* --- Header, pinned ------------------------------------------------ */}
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 pb-4 pt-5">
        <div className="min-w-0">
          <Warning size={26} weight="fill" className="mb-3 text-accent" />
          <h2
            id={SETUP_NOTICE_TITLE_ID}
            className="text-[20px] font-bold leading-tight tracking-tight"
          >
            You are looking at demo data
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close the setup instructions"
          className="-mr-2 -mt-1 rounded-full p-2 text-ink transition-[background-color,transform] duration-150 hover:bg-surface-2 active:translate-y-px active:bg-hairline disabled:pointer-events-none"
        >
          <CloseIcon size={18} weight="bold" />
        </button>
      </div>

      {/* --- Body, scrolls -------------------------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">
        <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
          No Supabase project is configured, so the app is serving a built-in
          dataset out of server memory. The feed is genuinely ranked by the real
          algorithm and the sliders on the algorithm page really do reorder it.
          Nothing is saved, though. There are no real accounts, and every post,
          like and follow you leave here disappears when the server restarts.
        </p>

        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Connect your own project
        </p>

        <ol className="mt-4 space-y-4 text-[15px] leading-relaxed">
          <li className="border-l-2 border-hairline pl-4">
            Create a project at{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-accent transition-colors hover:underline active:text-accent-press"
            >
              supabase.com/dashboard
            </a>
            .
          </li>
          <li className="border-l-2 border-hairline pl-4">
            Open the SQL editor and run both files from{' '}
            <code className="font-mono text-[13px] text-ink">
              supabase/migrations/
            </code>{' '}
            in order.
          </li>
          <li className="border-l-2 border-hairline pl-4">
            Check that a public Storage bucket named{' '}
            <code className="font-mono text-[13px] text-ink">media</code>{' '}
            exists, and create one if it does not.
          </li>
          <li className="border-l-2 border-hairline pl-4">
            Copy <code className="font-mono text-[13px] text-ink">.env.example</code>{' '}
            to <code className="font-mono text-[13px] text-ink">.env.local</code>{' '}
            and paste in the Project URL, the anon key and the service_role key
            from Project Settings, then API.
          </li>
          <li className="border-l-2 border-hairline pl-4">
            Restart <code className="font-mono text-[13px] text-ink">npm run dev</code>.
          </li>
          <li className="border-l-2 border-hairline pl-4">
            Optional: run{' '}
            <code className="font-mono text-[13px] text-ink">npm run seed</code>{' '}
            to load this same demo content into your own project.
          </li>
        </ol>
      </div>

      {/* --- Footer, pinned ------------------------------------------------- */}
      <div className="border-t border-hairline px-6 pb-6 pt-4">
        <Button type="button" onClick={onDismiss} className="w-full sm:w-auto">
          Keep looking around
        </Button>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          Full walkthrough in the README at the root of the repo. This notice
          comes back on the next page load.
        </p>
      </div>
    </>
  );
}
