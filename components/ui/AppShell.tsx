'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House,
  PencilSimple,
  SlidersHorizontal,
  User as UserIcon,
} from '@phosphor-icons/react/ssr';

/**
 * Navigation. A left rail on wide screens and a bottom bar on phones, which is
 * what X does and what a full-height snap feed needs: the feed owns the whole
 * viewport, so navigation has to float over it rather than take space from it.
 */
const ITEMS = [
  { href: '/', label: 'Feed', Icon: House },
  { href: '/compose', label: 'Compose', Icon: PencilSimple },
  { href: '/settings/algorithm', label: 'Algorithm', Icon: SlidersHorizontal },
];

export function AppShell({
  children,
  username,
}: {
  children: React.ReactNode;
  username?: string | null;
}) {
  const pathname = usePathname();

  const items = [
    ...ITEMS,
    {
      href: username ? `/profile/${username}` : '/login',
      label: username ? 'Profile' : 'Sign in',
      Icon: UserIcon,
    },
  ];

  return (
    <div className="min-h-[100dvh]">
      {/* Wide screens: fixed rail on the left. */}
      <nav
        aria-label="Primary"
        className="fixed left-0 top-0 z-40 hidden h-[100dvh] w-[88px] flex-col items-center gap-1 border-r border-hairline bg-ground py-5 lg:flex xl:w-[240px] xl:items-start xl:px-4"
      >
        <Link
          href="/"
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl font-black tracking-tight text-ink transition-colors hover:bg-surface xl:w-auto xl:px-3"
        >
          <span aria-hidden="true">/</span>
          <span className="sr-only">Open Social home</span>
        </Link>
        {items.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex items-center gap-4 rounded-full px-3 py-3 text-ink transition-colors hover:bg-surface active:bg-surface-2"
            >
              <Icon size={26} weight={active ? 'fill' : 'regular'} />
              <span
                className={`hidden text-[19px] xl:inline ${active ? 'font-bold' : 'font-normal'}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Phones: bottom bar, floating over the feed. */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-hairline bg-ground/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {items.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 flex-col items-center gap-0.5 py-3 text-ink transition-colors active:bg-surface"
            >
              <Icon size={24} weight={active ? 'fill' : 'regular'} />
              <span className="sr-only">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="lg:pl-[88px] xl:pl-[240px]">{children}</div>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}
