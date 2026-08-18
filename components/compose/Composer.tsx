'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageSquare, X as CloseIcon } from '@phosphor-icons/react/ssr';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import type { MediaType } from '@/lib/types';

const MAX_CHARS = 500;
const MAX_BYTES = 50 * 1024 * 1024;

export function Composer({
  userId,
  displayName,
  avatarUrl,
  canUploadMedia,
  isDemo,
}: {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** False in demo mode, where there is no storage bucket to upload into. */
  canUploadMedia: boolean;
  /** True when the app is running on the in-memory demo world. */
  isDemo: boolean;
}) {
  const router = useRouter();

  // Built only when there is a project to talk to. The browser client throws on
  // an empty URL, and in demo mode the post goes to /api/compose instead.
  const supabase = useMemo(() => (isDemo ? null : createClient()), [isDemo]);

  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Grow the textarea to fit its content instead of showing an inner scrollbar.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [body]);

  // Object URLs leak until they are revoked, so tie each one to its own render.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const remaining = MAX_CHARS - body.length;
  const isVideo = file?.type.startsWith('video/') ?? false;
  const busy = uploading || submitting;
  const canPost = (body.trim().length > 0 || file !== null) && !busy;

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    // Reset the input so picking the same file twice still fires a change.
    event.target.value = '';
    if (!picked) return;

    if (!picked.type.startsWith('image/') && !picked.type.startsWith('video/')) {
      setError('Attachments have to be an image or a video.');
      return;
    }

    if (picked.size > MAX_BYTES) {
      const megabytes = (picked.size / (1024 * 1024)).toFixed(1);
      setError(`That file is ${megabytes}MB. The limit for an attachment here is 50MB.`);
      return;
    }

    setError(null);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  function removeFile() {
    setFile(null);
    setPreview(null);
    setProgress(0);
  }

  async function uploadMedia(target: File): Promise<{ url: string; type: MediaType }> {
    if (!supabase) throw new Error('Uploading media needs a Supabase storage bucket.');

    const rawExt = target.name.includes('.') ? target.name.split('.').pop() : null;
    const ext = (rawExt ?? target.type.split('/')[1] ?? 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    // The storage client does not report byte progress, so the bar eases toward
    // the end of the request and snaps shut when the upload actually returns.
    setProgress(6);
    const tick = window.setInterval(() => {
      setProgress((value) => Math.min(value + (92 - value) * 0.14, 92));
    }, 220);

    try {
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(path, target, { cacheControl: '3600', contentType: target.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('media').getPublicUrl(path);
      setProgress(100);

      return {
        url: data.publicUrl,
        type: target.type.startsWith('video/')
          ? 'video'
          : target.type.startsWith('image/')
            ? 'image'
            : 'none',
      };
    } finally {
      window.clearInterval(tick);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canPost) return;

    setError(null);
    setSubmitting(true);

    try {
      if (isDemo) {
        // No Supabase, so no browser insert. The route writes the post into the
        // same in-memory world the feed is ranking.
        const response = await fetch('/api/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: body.trim() }),
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error ?? 'That post did not go through.');
        }

        router.push('/');
        router.refresh();
        return;
      }

      if (!supabase) throw new Error('Posting needs a Supabase project.');

      let mediaUrl: string | null = null;
      let mediaType: MediaType = 'none';

      if (file) {
        setUploading(true);
        const uploaded = await uploadMedia(file);
        mediaUrl = uploaded.url;
        mediaType = uploaded.type;
        setUploading(false);
      }

      const { error: insertError } = await supabase.from('posts').insert({
        author_id: userId,
        body: body.trim() || null,
        media_url: mediaUrl,
        media_type: mediaType,
      });

      if (insertError) throw insertError;

      router.push('/');
      router.refresh();
    } catch (caught) {
      setUploading(false);
      setSubmitting(false);
      setProgress(0);
      setError(caught instanceof Error ? caught.message : 'That post did not go through.');
    }
  }

  return (
    <form onSubmit={submit} className="px-4 py-4">
      <div className="flex gap-3">
        <Avatar src={avatarUrl} name={displayName} seed={userId} size={48} />

        <div className="min-w-0 flex-1">
          <label htmlFor="composer-body" className="sr-only">
            Post text
          </label>
          <textarea
            id="composer-body"
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_CHARS))}
            maxLength={MAX_CHARS}
            rows={3}
            disabled={submitting}
            placeholder="What is happening?"
            className="w-full resize-none overflow-hidden bg-transparent text-[19px] leading-snug text-ink outline-none placeholder:text-ink-muted disabled:opacity-45"
          />

          {preview && file ? (
            <div className="relative mt-2 overflow-hidden rounded-[16px] border border-hairline">
              {isVideo ? (
                <video
                  src={preview}
                  controls
                  muted
                  loop
                  playsInline
                  className="max-h-[420px] w-full bg-black object-contain"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={preview}
                  alt={`Selected attachment, ${file.name}`}
                  className="max-h-[420px] w-full bg-black object-contain"
                />
              )}

              <button
                type="button"
                onClick={removeFile}
                disabled={busy}
                aria-label={`Remove ${file.name}`}
                className="absolute right-2 top-2 rounded-full bg-ground/80 p-2 text-ink backdrop-blur-md transition-colors hover:bg-ground active:translate-y-px disabled:pointer-events-none disabled:opacity-45"
              >
                <CloseIcon size={16} weight="bold" />
              </button>
            </div>
          ) : null}

          {uploading && file ? (
            <div className="mt-3">
              <p className="text-[13px] text-ink-muted">Uploading {file.name}</p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-[14px] leading-relaxed text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
            <div className="flex min-w-0 items-center gap-1">
              {canUploadMedia ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={pickFile}
                    className="sr-only"
                    id="composer-media"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-full px-3 py-2 text-[14px] font-semibold text-accent transition-colors hover:bg-accent/10 active:translate-y-px disabled:pointer-events-none disabled:opacity-45"
                  >
                    <ImageSquare size={20} weight="regular" />
                    {file ? 'Replace media' : 'Add image or video'}
                  </button>
                </>
              ) : (
                /* A disabled button with no reason next to it is just a dead
                   control, so say what is missing instead. */
                <p className="max-w-[40ch] text-[13px] leading-relaxed text-ink-muted">
                  Image and video upload needs a Supabase storage bucket. Text posts still work.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span
                aria-live="polite"
                className={`text-[13px] tabular-nums ${remaining < 20 ? 'text-danger' : 'text-ink-muted'}`}
              >
                {remaining}
              </span>
              <Button type="submit" loading={submitting} disabled={!canPost}>
                Post
              </Button>
            </div>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
            A new post carries no engagement history, so the ranker scores it from the priors
            in phoenix.ts until people start reacting to it.
          </p>

          {isDemo ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
              This post is kept in server memory only. Nothing is saved, and it disappears when
              the dev server restarts.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
