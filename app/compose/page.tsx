import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Composer } from '@/components/compose/Composer';
import { AppShell } from '@/components/ui/AppShell';
import { BackHeader } from '@/components/ui/BackHeader';
import { getSession } from '@/lib/data/session';

export const metadata: Metadata = {
  title: 'Compose',
};

export default async function ComposePage() {
  const session = await getSession();

  // Demo mode hands out a viewer, so composing is reachable there. Only a
  // genuinely signed out visitor gets sent to /login.
  const viewerId = session.viewerId;
  if (viewerId === null) redirect('/login');

  const { data: profile } = await session.db
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', viewerId)
    .maybeSingle();

  return (
    <AppShell username={profile?.username ?? null}>
      <div className="mx-auto min-h-[100dvh] max-w-[640px] pb-24 lg:border-x lg:border-hairline">
        <BackHeader title="New post" subtitle={profile?.username ? `@${profile.username}` : undefined} />
        <Composer
          userId={viewerId}
          displayName={profile?.display_name ?? profile?.username ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          canUploadMedia={session.canUploadMedia}
          isDemo={session.isDemo}
        />
      </div>
    </AppShell>
  );
}
