'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react/ssr';

/** Sticky header used by every page except the feed, matching X's post view. */
export function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-6 border-b border-hairline bg-ground/85 px-4 py-3 backdrop-blur-md">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        className="-ml-2 rounded-full p-2 text-ink transition-colors hover:bg-surface active:bg-surface-2"
      >
        <ArrowLeft size={20} weight="bold" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold leading-tight">{title}</h1>
        {subtitle ? (
          <p className="truncate text-[13px] text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
