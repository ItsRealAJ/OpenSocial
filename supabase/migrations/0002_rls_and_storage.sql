-- =============================================================================
--  0002_rls_and_storage.sql  -  who is allowed to read and write what
-- =============================================================================
--
--  Run 0001_schema.sql first, then paste this whole file into the Supabase SQL
--  editor and press Run. Like the first file, running it twice is safe.
--
--  WHAT ROW LEVEL SECURITY IS
--  Normally a database user who can read a table can read every row in it. Row
--  level security (RLS) changes that: once it is turned on for a table, every
--  query is invisibly rewritten to add the conditions below. A signed-in person
--  asking for "all engagements" gets back the public ones plus their own, and
--  there is no way to ask for more. The rule lives in the database, so a bug in
--  the app cannot leak past it.
--
--  IMPORTANT: turning RLS on with no policies means nobody can read anything.
--  Policies are the allow-list.
--
--  THE TWO FUNCTIONS YOU WILL SEE
--    auth.uid()   the id of the person making the request, or null if signed out
--    using / with check
--                 `using` filters rows that already exist (select, update,
--                 delete). `with check` validates rows on their way in
--                 (insert, update).
--
--  THE SERVICE ROLE KEY BYPASSES ALL OF THIS
--  The ranker runs server-side with the service_role key, which is exempt from
--  RLS by design. That is why the key must never reach the browser.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Turn RLS on everywhere
-- -----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.posts        enable row level security;
alter table public.engagements  enable row level security;
alter table public.follows      enable row level security;
alter table public.user_signals enable row level security;


-- -----------------------------------------------------------------------------
-- 2. profiles
-- -----------------------------------------------------------------------------
-- Profiles are public. Anyone, signed in or not, can read every profile, which
-- is what makes the feed and the profile pages work for signed-out visitors.
-- `using (true)` means "no filter, all rows match".
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles
  for select
  to public
  using (true);

-- You may only create the profile row whose id is your own. In practice the
-- signup trigger in 0001 has already made it; this covers the case where it
-- needs to be recreated.
drop policy if exists "you can create your own profile" on public.profiles;
create policy "you can create your own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- You may only edit your own profile. Both halves are required: `using` stops
-- you from selecting somebody else's row to edit, `with check` stops you from
-- editing your row into somebody else's id.
drop policy if exists "you can edit your own profile" on public.profiles;
create policy "you can edit your own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- -----------------------------------------------------------------------------
-- 3. posts
-- -----------------------------------------------------------------------------
-- Every post is public, including to signed-out visitors.
drop policy if exists "posts are readable by everyone" on public.posts;
create policy "posts are readable by everyone"
  on public.posts
  for select
  to public
  using (true);

-- You can only post as yourself. Without this check, a signed-in person could
-- hand-craft a request that puts somebody else's id in author_id.
drop policy if exists "you can post as yourself" on public.posts;
create policy "you can post as yourself"
  on public.posts
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- You can delete your own posts and nobody else's. There is deliberately no
-- update policy: posts are not editable in this app.
drop policy if exists "you can delete your own posts" on public.posts;
create policy "you can delete your own posts"
  on public.posts
  for delete
  to authenticated
  using (auth.uid() = author_id);


-- -----------------------------------------------------------------------------
-- 4. engagements  (the interesting one)
-- -----------------------------------------------------------------------------
-- Engagements are not all equally public, and the split matters.
--
-- On X, likes are public. So are replies, reposts, bookmarks in aggregate,
-- shares, profile clicks and video completions. Those are the signals that
-- produce visible counts under a post, and the ranker needs to read all of
-- them across all users to know what is popular.
--
-- Mutes, blocks, reports and "not interested" are private. Telling someone
-- that you muted them, or that you reported their post, changes the thing you
-- were trying to do. The policy below lets anyone read the public action types
-- and lets you read your own rows of any type, which means:
--
--   your like        visible to everyone
--   your mute        visible only to you
--   somebody's mute  invisible to you
--
-- The ranker still sees every row, because it uses the service_role key.
drop policy if exists "public engagement types are readable" on public.engagements;
create policy "public engagement types are readable"
  on public.engagements
  for select
  to public
  using (
    action in (
      'like',
      'reply',
      'repost',
      'bookmark',
      'share',
      'profile_click',
      'video_watch_complete',
      'video_skip_early',
      'follow_author'
    )
    or auth.uid() = user_id
  );

-- You can only record actions as yourself.
drop policy if exists "you can record your own engagements" on public.engagements;
create policy "you can record your own engagements"
  on public.engagements
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Undoing a like is deleting the row, so this is what makes toggles work. You
-- can only delete your own.
drop policy if exists "you can undo your own engagements" on public.engagements;
create policy "you can undo your own engagements"
  on public.engagements
  for delete
  to authenticated
  using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 5. follows
-- -----------------------------------------------------------------------------
-- Follower and following lists are public, the same way they are on X.
drop policy if exists "follows are readable by everyone" on public.follows;
create policy "follows are readable by everyone"
  on public.follows
  for select
  to public
  using (true);

-- You can only follow on your own behalf.
drop policy if exists "you can follow as yourself" on public.follows;
create policy "you can follow as yourself"
  on public.follows
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

-- Unfollowing is deleting the row. You can only remove follows you created,
-- which is why nobody can force someone else to unfollow them.
drop policy if exists "you can unfollow as yourself" on public.follows;
create policy "you can unfollow as yourself"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);


-- -----------------------------------------------------------------------------
-- 6. user_signals
-- -----------------------------------------------------------------------------
-- Read your own precomputed scores, nothing else.
drop policy if exists "you can read your own signals" on public.user_signals;
create policy "you can read your own signals"
  on public.user_signals
  for select
  to authenticated
  using (auth.uid() = user_id);

-- There is deliberately no insert, update or delete policy here. This table is
-- written only by the ranker, which runs on the server with the service_role
-- key and is exempt from row level security. With RLS on and no write policy,
-- a browser session cannot forge its own ranking scores no matter what it
-- sends.


-- -----------------------------------------------------------------------------
-- 7. Storage: the media bucket
-- -----------------------------------------------------------------------------
-- Supabase Storage is itself a Postgres table (storage.objects) with the same
-- policy system, so uploads follow the same rules as everything above.
--
-- Create the bucket. `public = true` means the files can be fetched by URL
-- without a signed link, which is what an <img> or <video> tag needs.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Anyone can read a file in this bucket.
drop policy if exists "media files are readable by everyone" on storage.objects;
create policy "media files are readable by everyone"
  on storage.objects
  for select
  to public
  using (bucket_id = 'media');

-- Writes are scoped to a folder named after the uploader. The app uploads to
--
--     media/<user-id>/<filename>
--
-- so `storage.foldername(name)` returns the path segments as an array and
-- [1] is the first one, which must equal the uploader's own id. The effect is
-- that a signed-in person can only add, replace or remove files inside their
-- own folder, and cannot overwrite anybody else's image.
drop policy if exists "you can upload to your own media folder" on storage.objects;
create policy "you can upload to your own media folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "you can replace files in your own media folder" on storage.objects;
create policy "you can replace files in your own media folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "you can delete files in your own media folder" on storage.objects;
create policy "you can delete files in your own media folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
