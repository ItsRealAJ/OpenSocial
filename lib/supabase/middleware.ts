/**
 * Session refresh for the middleware.
 *
 * Supabase access tokens are short lived. Server Components can read cookies
 * but cannot write them, so nothing on a page render is able to store a
 * refreshed token. The middleware runs before every render and can, which is
 * why it exists: it calls getUser(), lets the client refresh the token if it
 * has expired, and returns the response carrying the updated cookies.
 *
 * Skip the getUser() call and a signed-in viewer gets logged out roughly every
 * hour for no visible reason.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from './env';

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // The app has to boot before .env.local is filled in, otherwise a fresh
  // clone shows a middleware crash instead of the setup instructions.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to the request first, so anything later in this same pass
          // reads the new token, then rebuild the response around it and set
          // the cookies on the way out to the browser.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // This call is the whole point of the file. Do not remove it, and do not put
  // anything between creating the client and calling it.
  await supabase.auth.getUser();

  return response;
}
