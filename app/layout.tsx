import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { DemoGate } from '@/components/ui/DemoGate';
import { isDemoMode } from '@/lib/supabase/env';
import './globals.css';

/**
 * X ships a proprietary face called Chirp. Inter is the closest thing that is
 * actually licensable: same grotesque skeleton, same tall x-height, same
 * behaviour at 13px in a dense timeline. JetBrains Mono carries every number
 * the algorithm produces, so scores and probabilities line up in columns.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-face',
  display: 'swap',
});

export const metadata: Metadata = {
  // The template means every page title ends up branded: /compose renders as
  // "Compose | Open Social" without each page having to repeat the name.
  title: {
    default: 'Open Social',
    template: '%s | Open Social',
  },
  description:
    'A social feed whose ranking algorithm is a config file you can read and edit.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-ground text-ink antialiased">
        {children}
        <DemoGate isDemo={isDemoMode()} />
      </body>
    </html>
  );
}
