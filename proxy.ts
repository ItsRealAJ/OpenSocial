/**
 * Runs before every page and API request that the matcher below allows through.
 * Its only job is keeping the Supabase session fresh. See
 * lib/supabase/middleware.ts for why that cannot happen anywhere else.
 */
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static    build output, immutable
     *   _next/image     the image optimiser
     *   favicon.ico     requested constantly, never authenticated
     *   image files     avatars and post media served from /public
     *
     * Refreshing a session on those costs a round trip and buys nothing.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
