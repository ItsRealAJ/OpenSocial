/**
 * =============================================================================
 *  GET /auth/callback
 * =============================================================================
 *
 *  Where Supabase sends the browser back after a magic link or an OAuth hop.
 *  It arrives with a one-time `code`; this route trades that code for a session
 *  and writes the auth cookies, then forwards the viewer to wherever they were
 *  headed.
 * =============================================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=Missing+sign+in+code.+Request+a+new+link.', url.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] code exchange failed:', error);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent('That sign in link did not work. Request a new one.')}`,
        url.origin,
      ),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

/**
 * Open redirect guard.
 *
 * `next` comes off the query string, so it is attacker-controlled. Only a
 * same-site path is allowed: it must start with a single slash. "//evil.test"
 * is a protocol-relative URL that browsers happily treat as another origin, so
 * it is rejected along with anything that is not a path at all.
 */
function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  // A backslash after the leading slash is normalised to a forward slash by
  // some browsers, which reopens the protocol-relative hole.
  if (raw.startsWith('/\\')) return '/';
  return raw;
}
