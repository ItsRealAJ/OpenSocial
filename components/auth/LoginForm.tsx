'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CaretDown, EnvelopeSimple } from '@phosphor-icons/react/ssr';

import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

const INPUT =
  'w-full rounded-[16px] border border-hairline bg-surface px-4 py-3 text-[15px] text-ink transition-colors hover:border-ink-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-45';

/**
 * Two ways in, because a demo needs both. The magic link is what Supabase does
 * out of the box, and the password form exists because `npm run seed` gives its
 * accounts a password and typing one is faster than opening an inbox.
 */
export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);

  const [showPassword, setShowPassword] = useState(false);
  const [passwordEmail, setPasswordEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setStatus('sending');
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
    });

    if (otpError) {
      setError(otpError.message);
      setStatus('idle');
      return;
    }

    setSentTo(address);
    setStatus('sent');
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError(null);

    const { error: pwError } = await supabase.auth.signInWithPassword({
      email: passwordEmail.trim(),
      password,
    });

    if (pwError) {
      setPasswordError(pwError.message);
      setPasswordBusy(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="mt-8">
      {status === 'sent' ? (
        <div className="rounded-[16px] border border-hairline bg-surface p-5">
          <EnvelopeSimple size={24} weight="fill" className="text-accent" />
          <h2 className="mt-3 text-[17px] font-bold">Check {sentTo}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            The email holds a one time link. Opening it on this device signs you in and drops
            you straight back into this app.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setSentTo('');
            }}
            className="mt-4 rounded-full px-3 py-1.5 text-[14px] font-semibold text-accent transition-colors hover:bg-surface-2 active:translate-y-px"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <form onSubmit={sendMagicLink}>
          <label htmlFor="login-email" className="block text-[14px] font-semibold text-ink">
            Email address
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={status === 'sending'}
            className={`mt-2 ${INPUT}`}
          />

          {error ? (
            <p role="alert" className="mt-3 text-[14px] leading-relaxed text-danger">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            loading={status === 'sending'}
            disabled={email.trim().length === 0}
            className="mt-4 w-full py-3"
          >
            {status === 'sending' ? 'Sending link' : 'Email me a sign in link'}
          </Button>
        </form>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-ink-muted">
        Magic link email is what Supabase enables by default, so that is the path above. The
        demo accounts created by <code className="font-mono text-[12px] text-ink">npm run seed</code>{' '}
        also have a password, and the seed output prints them, which is the fastest way in.
      </p>

      <button
        type="button"
        onClick={() => setShowPassword((open) => !open)}
        aria-expanded={showPassword}
        aria-controls="password-form"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full py-1.5 text-[14px] font-semibold text-ink transition-colors hover:text-accent active:translate-y-px"
      >
        Use a password instead
        <CaretDown
          size={14}
          weight="bold"
          className={`transition-transform duration-150 ${showPassword ? 'rotate-180' : ''}`}
        />
      </button>

      {showPassword ? (
        <form
          id="password-form"
          onSubmit={signInWithPassword}
          className="mt-3 rounded-[16px] border border-hairline bg-surface p-4"
        >
          <label htmlFor="password-email" className="block text-[14px] font-semibold text-ink">
            Email address
          </label>
          <input
            id="password-email"
            name="passwordEmail"
            type="email"
            required
            autoComplete="email"
            value={passwordEmail}
            onChange={(event) => setPasswordEmail(event.target.value)}
            disabled={passwordBusy}
            className={`mt-2 ${INPUT}`}
          />

          <label
            htmlFor="password-value"
            className="mt-4 block text-[14px] font-semibold text-ink"
          >
            Password
          </label>
          <input
            id="password-value"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={passwordBusy}
            className={`mt-2 ${INPUT}`}
          />

          {passwordError ? (
            <p role="alert" className="mt-3 text-[14px] leading-relaxed text-danger">
              {passwordError}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="secondary"
            loading={passwordBusy}
            disabled={passwordEmail.trim().length === 0 || password.length === 0}
            className="mt-4 w-full py-3"
          >
            Sign in
          </Button>
        </form>
      ) : null}
    </div>
  );
}
