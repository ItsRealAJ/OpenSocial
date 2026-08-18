import { AppShell } from '@/components/ui/AppShell';
import { FeedScreen } from '@/components/feed/FeedScreen';
import { getSession } from '@/lib/data/session';
import { hasServiceRoleKey } from '@/lib/supabase/env';

/**
 * The feed page.
 *
 * The only work done on the server is answering "who is looking at this?", and
 * getSession() answers it the same way whether there is a Supabase project or
 * the in-memory demo world. Ranking happens in POST /api/feed, because the
 * weights it needs live in the viewer's localStorage and the server cannot
 * read that.
 */
export default async function HomePage() {
  const session = await getSession();

  // The other pages work on the anon key alone. The feed does not: ranking
  // needs global engagement counts, which only the service role can read. Say
  // so here rather than letting the feed render and then fail its first fetch.
  // Demo mode is exempt, because it has no keys at all and ranks in process.
  if (!session.isDemo && !hasServiceRoleKey()) {
    return (
      <AppShell username={session.username}>
        <main className="mx-auto flex min-h-[100dvh] max-w-[640px] flex-col justify-center px-6 py-16">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink">
            The ranker needs the service role key
          </h1>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
            <code className="font-mono text-[13px] text-ink">SUPABASE_SERVICE_ROLE_KEY</code> is
            missing from <code className="font-mono text-[13px] text-ink">.env.local</code>, so
            add it and restart the dev server.
          </p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell username={session.username}>
      <FeedScreen viewerId={session.viewerId} viewerUsername={session.username} />
    </AppShell>
  );
}
