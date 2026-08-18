import type { Metadata } from 'next';
import { WeightTuner } from '@/components/settings/WeightTuner';
import { AppShell } from '@/components/ui/AppShell';
import { BackHeader } from '@/components/ui/BackHeader';
import { getSession } from '@/lib/data/session';

export const metadata: Metadata = {
  title: 'Your algorithm',
  description:
    'Every weight the ranker uses, as a slider. The same numbers that live in lib/algorithm/weights.ts.',
};

/**
 * The point of the whole project, as a page. Nothing here needs the database:
 * the tuner reads and writes localStorage, so it works before Supabase is
 * connected. The only server work is finding out who is signed in, for the nav.
 */
export default async function AlgorithmSettingsPage() {
  // Goes through the same seam as every other page, so the nav shows the same
  // identity here as it does everywhere else. Doing its own lookup made this
  // the one page where the fourth nav item flipped to "Sign in" in demo mode.
  const { username } = await getSession();

  return (
    <AppShell username={username}>
      <div className="mx-auto max-w-[680px] pb-32">
        <BackHeader
          title="Your algorithm"
          subtitle="Every number here is a line in lib/algorithm/weights.ts"
        />
        <main className="px-4 pt-6">
          <WeightTuner />
        </main>
      </div>
    </AppShell>
  );
}
