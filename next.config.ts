import type { NextConfig } from 'next';

/**
 * Post media comes from two places: the Supabase Storage bucket for anything
 * uploaded through /compose, and a couple of public sample hosts used by the
 * seed script. Both are allowlisted here so next/image will serve them.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Next 16 writes its own AGENTS.md and CLAUDE.md into the repo root on every
  // dev run. Turned off because this repo maintains a hand-written CLAUDE.md
  // that the generated one would overwrite.
  agentRules: false,

  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: 'https' as const, hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
        : []),
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
      { protocol: 'https', hostname: 'commondatastorage.googleapis.com' },
    ],
  },
};

export default nextConfig;
