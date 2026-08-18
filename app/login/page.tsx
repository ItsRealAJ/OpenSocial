import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/LoginForm';
import { getSession } from '@/lib/data/session';

export const metadata: Metadata = {
  title: 'Sign in',
};

const COLUMN = 'mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col justify-center px-6 py-12';
const BRAND = 'text-[64px] font-black leading-none tracking-tight text-ink';

/**
 * The only page in the app that does not use AppShell. Signing in is a
 * dead end until it succeeds, so the navigation would only be noise.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // Next 16 hands both params and searchParams over as promises.
  const { error } = await searchParams;

  const session = await getSession();

  // Demo mode has no auth to talk to, so the form would be a button that can
  // only fail. Explain what is missing and point back at what does work.
  if (session.isDemo) {
    return (
      <main className={COLUMN}>
        <p aria-hidden="true" className={BRAND}>
          /
        </p>
        <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight">
          Sign in needs a Supabase project
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          This app is running on a built in demo dataset held in the memory of the dev server,
          so there is no account to sign in to. Real accounts, posts that stay put and likes
          that are saved all need the Supabase setup described in the README.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press active:translate-y-px active:bg-accent-press"
          >
            Back to the feed
          </Link>
          <Link
            href="/settings/algorithm"
            className="inline-flex w-full items-center justify-center rounded-full border border-hairline px-4 py-3 text-[15px] font-semibold text-ink transition-colors duration-150 hover:bg-surface active:translate-y-px active:bg-surface-2"
          >
            Open your algorithm
          </Link>
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-ink-muted">
          Everything in the demo is browsable and the ranking is real. Only saving is missing.
        </p>
      </main>
    );
  }

  if (session.viewerId) redirect('/');

  // /auth/callback bounces failures back here with ?error=, so surface it.
  const initialError = Array.isArray(error) ? error[0] : error;

  return (
    <main className={COLUMN}>
      <p aria-hidden="true" className={BRAND}>
        /
      </p>
      <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight">
        Sign in to Open Social
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        A feed like X, except the ranking algorithm is a config file you can read, edit and
        watch take effect.
      </p>

      <LoginForm initialError={initialError} />
    </main>
  );
}
