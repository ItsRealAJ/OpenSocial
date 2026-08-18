'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

const MAX_CHARS = 500;

export function ReplyComposer({
  parentId,
  viewerId,
  viewerName,
  viewerAvatar,
  isDemo = false,
}: {
  parentId: string;
  viewerId: string | null;
  viewerName: string | null;
  viewerAvatar: string | null;
  /** Demo mode has no Supabase project, so replies go through /api/compose. */
  isDemo?: boolean;
}) {
  const router = useRouter();

  // Built lazily. createBrowserClient throws when the URL and key are empty,
  // and this component is server-rendered, so calling it unconditionally takes
  // the whole post page down in demo mode.
  const supabase = useMemo(() => (isDemo ? null : createClient()), [isDemo]);

  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [body]);

  if (!viewerId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-4">
        <p className="text-[15px] text-ink-muted">Sign in to reply to this post.</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-accent-press active:translate-y-px"
        >
          Sign in
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || submitting || !viewerId) return;

    setSubmitting(true);
    setError(null);

    // A reply writes two rows on purpose. The first is the reply itself. The
    // second is an engagement row of action 'reply' against the parent, because
    // Phoenix scores posts from the engagements table, not from the posts
    // table. Without that second row a reply would be invisible to the ranker.
    //
    // Demo mode cannot write either row from the browser, since there is no
    // Supabase to write to. The route does both writes server-side instead.
    if (isDemo || !supabase) {
      try {
        const response = await fetch('/api/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text, replyTo: parentId }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: true; error?: string }
          | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error ?? 'Your reply did not post.');
        }

        setBody('');
        setSubmitting(false);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Your reply did not post.');
        setSubmitting(false);
      }
      return;
    }

    const { error: postError } = await supabase.from('posts').insert({
      author_id: viewerId,
      body: text,
      media_url: null,
      media_type: 'none',
      reply_to: parentId,
    });

    if (postError) {
      setError(postError.message);
      setSubmitting(false);
      return;
    }

    const { error: engagementError } = await supabase.from('engagements').insert({
      user_id: viewerId,
      post_id: parentId,
      action: 'reply',
    });

    if (engagementError) {
      setError(`Your reply posted, but the ranker did not record it: ${engagementError.message}`);
      setSubmitting(false);
      router.refresh();
      return;
    }

    setBody('');
    setSubmitting(false);
    router.refresh();
  }

  const remaining = MAX_CHARS - body.length;

  return (
    <form onSubmit={submit} className="border-b border-hairline px-4 py-3">
      <div className="flex gap-3">
        <Avatar src={viewerAvatar} name={viewerName} seed={viewerId} size={40} />

        <div className="min-w-0 flex-1">
          <label htmlFor="reply-body" className="sr-only">
            Your reply
          </label>
          <textarea
            id="reply-body"
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_CHARS))}
            maxLength={MAX_CHARS}
            rows={1}
            disabled={submitting}
            placeholder="Post your reply"
            className="w-full resize-none overflow-hidden bg-transparent py-1.5 text-[17px] leading-snug text-ink outline-none placeholder:text-ink-muted disabled:opacity-45"
          />

          {error ? (
            <p role="alert" className="mt-2 text-[14px] leading-relaxed text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-3">
            {body.length > 0 ? (
              <span
                className={`text-[13px] tabular-nums ${remaining < 20 ? 'text-danger' : 'text-ink-muted'}`}
              >
                {remaining}
              </span>
            ) : null}
            <Button type="submit" loading={submitting} disabled={body.trim().length === 0}>
              Reply
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
