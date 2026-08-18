-- =============================================================================
--  0001_schema.sql  -  tables, indexes and the new-user trigger
-- =============================================================================
--
--  HOW TO RUN THIS
--  Open your Supabase project, click "SQL Editor", click "New query", paste
--  this entire file in, and press Run. It runs top to bottom. You can run it
--  again later without breaking anything: every statement is written so that a
--  second run is a no-op rather than an error.
--
--  Run this file FIRST, then run 0002_rls_and_storage.sql.
--
--  WHAT IS IN HERE
--  Five tables. Four of them are the obvious ones for a social app: people
--  (profiles), what they post (posts), how they react (engagements), and who
--  follows whom (follows). The fifth (user_signals) is a scratchpad the ranking
--  code can write precomputed scores into.
--
--  ONE ADDITION BEYOND THE ORIGINAL TABLE LIST
--  The posts table has a `reply_to` column that was not in the original plan.
--  It is needed so the /post/[id] page can show the replies to a post. Replies
--  are not a separate table: a reply IS a post, it just has `reply_to` pointing
--  at its parent. That keeps one code path for writing, reading, liking and
--  deleting, and it is how the real thing works too. The feed filters replies
--  out with `where reply_to is null` so they do not show up twice.
--
--  A NOTE ON NAMES
--  Do not rename the foreign keys. Postgres names them automatically as
--  <table>_<column>_fkey, and the application asks Supabase for related rows
--  BY THAT NAME (for example `profiles!posts_author_id_fkey`). Rename one and
--  the app stops being able to load post authors.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto gives us gen_random_uuid(), which generates the random ids used as
-- primary keys. Supabase usually has it on already; this is here so the file
-- works on a bare Postgres too.
create extension if not exists "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
-- An enum is a column type that only accepts values from a fixed list. Storing
-- 'like' in a text column would let a typo like 'liek' into the table forever.
-- With an enum, the database rejects it at write time.
--
-- Postgres has no "create type if not exists", so each one is wrapped in a
-- small block that catches the "this type already exists" error and moves on.
-- That is what makes this file safe to re-run.

-- What kind of attachment a post has. 'none' means text only.
do $$
begin
  create type public.media_type as enum ('none', 'image', 'video');
exception
  when duplicate_object then null;
end
$$;

-- Every way a person can react to a post.
--
-- The first nine are positive or neutral signals. The last five are negative:
-- they are the ones that tell the ranker to show LESS of something. The
-- ranking config in lib/algorithm/weights.ts has one number per value in this
-- list, so this list and that file must stay in step with each other.
do $$
begin
  create type public.engagement_action as enum (
    'like',
    'reply',
    'repost',
    'bookmark',
    'share',
    'profile_click',
    'video_watch_complete',
    'follow_author',
    'mute_author',
    'block_author',
    'report',
    'not_interested',
    'video_skip_early'
  );
exception
  when duplicate_object then null;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. profiles
-- -----------------------------------------------------------------------------
-- The public half of an account. Supabase keeps the private half (email,
-- password hash, sessions) in its own `auth.users` table, which you should not
-- write to directly. This table hangs off it: same id, public columns only.
--
-- "on delete cascade" means that if the auth user is deleted, this row goes
-- with it. The same phrase appears further down and always means the same
-- thing: when the parent row dies, so does the child.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- The @handle. `unique` means the database itself guarantees no two people
  -- can hold the same one, even if two signups race each other.
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 3. posts
-- -----------------------------------------------------------------------------
-- Top-level posts and replies both live here. See the note at the top.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  media_url text,
  media_type public.media_type not null default 'none',
  -- Null for a top-level post. Set to the parent post id for a reply.
  -- Deleting a post deletes its replies too.
  reply_to uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A post has to actually contain something. Text, or media, or both, but not
  -- an empty row. A check constraint is a rule the database refuses to break,
  -- which is a much better place for a rule like this than form validation.
  constraint posts_body_or_media check (body is not null or media_url is not null)
);


-- -----------------------------------------------------------------------------
-- 4. engagements
-- -----------------------------------------------------------------------------
-- One row per thing a person did to a post. A like is a row. Undoing the like
-- deletes the row. This is the entire input to the ranking algorithm, which is
-- why it is a log of individual actions rather than a pile of counter columns:
-- counters tell you how many, rows tell you who, when, and what else they did.
create table if not exists public.engagements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  action public.engagement_action not null,
  created_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 5. follows
-- -----------------------------------------------------------------------------
-- Who follows whom. The primary key is the pair of columns, so the same follow
-- cannot be recorded twice.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  -- You cannot follow yourself. <> means "not equal to".
  constraint follows_no_self check (follower_id <> following_id)
);


-- -----------------------------------------------------------------------------
-- 6. user_signals
-- -----------------------------------------------------------------------------
-- A place to park a precomputed score for a (person, post) pair, so a heavy
-- calculation does not have to run again on the next feed refresh. Nothing
-- breaks if it is empty. The ranker writes it with the service_role key.
create table if not exists public.user_signals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  score double precision not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, post_id)
);


-- -----------------------------------------------------------------------------
-- 7. Indexes
-- -----------------------------------------------------------------------------
-- An index is a lookup structure the database maintains so it does not have to
-- read the whole table to answer a query. Each one below matches a query the
-- app actually makes. Adding indexes nobody queries just makes writes slower,
-- so the list is short on purpose.

-- The feed: newest posts first.
create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

-- A profile page: newest posts by one author first.
create index if not exists posts_author_created_at_idx
  on public.posts (author_id, created_at desc);

-- The post page: find the replies to a given post.
create index if not exists posts_reply_to_idx
  on public.posts (reply_to);

-- Counting the likes, reposts and so on for a batch of posts.
create index if not exists engagements_post_id_idx
  on public.engagements (post_id);

-- Building the viewer context: everything one person has done, recent first.
create index if not exists engagements_user_created_at_idx
  on public.engagements (user_id, created_at desc);

-- Both directions of the follow graph: "who do I follow" and "who follows me".
create index if not exists follows_follower_idx
  on public.follows (follower_id);

create index if not exists follows_following_idx
  on public.follows (following_id);


-- -----------------------------------------------------------------------------
-- 8. The one clever index: no double-counting toggles
-- -----------------------------------------------------------------------------
-- Some actions are toggles. You either like a post or you do not. If a flaky
-- network made the client send the same like twice, the post would show two
-- likes from one person and the ranker would believe it. This unique index
-- makes that impossible: the second insert is rejected by the database.
--
-- Other actions are not toggles and genuinely repeat. You can share a post on
-- Monday and again on Friday. You can open someone's profile ten times. You
-- can watch a video to the end more than once, or skip past it more than once.
-- Those are real, separate events and each one should be its own row.
--
-- So the uniqueness rule only applies to part of the table. That is what a
-- PARTIAL index is: the `where` clause at the end limits which rows the rule
-- covers. The excluded actions are share, profile_click,
-- video_watch_complete, video_skip_early and reply.
--
-- follow_author IS covered. You can only start following someone once from a
-- given post, and follow_author carries the largest positive weight in
-- weights.ts (24.0), so a double tap creating two rows would hand that post
-- twice the reach it earned.
--
-- Dropped first rather than `if not exists`, so that re-running this file
-- after the action list changes actually rebuilds the index instead of
-- silently leaving the old one in place.
drop index if exists public.engagements_one_per_toggle_idx;

create unique index engagements_one_per_toggle_idx
  on public.engagements (user_id, post_id, action)
  where action in (
    'like',
    'repost',
    'bookmark',
    'not_interested',
    'mute_author',
    'block_author',
    'report',
    'follow_author'
  );


-- -----------------------------------------------------------------------------
-- 9. Give every new signup a profile
-- -----------------------------------------------------------------------------
-- When someone signs up, Supabase writes a row into auth.users. It does not
-- know anything about our profiles table. Without the trigger below, a brand
-- new account would have no username and no display name, and every page that
-- joins to profiles would come back empty.
--
-- The function builds a starting handle out of the email address:
--   ada.lovelace+test@example.com  ->  adalovelace + a short random suffix
-- Everything before the @ is taken, lowercased, and stripped of anything that
-- is not a letter or a number. The random suffix is what stops two people with
-- similar emails from colliding, and the loop below re-rolls it in the very
-- unlikely event that it does collide. Users can change their handle later.
--
-- "security definer" means the function runs with the permissions of whoever
-- created it, not whoever triggered it. It has to: the person signing up does
-- not exist yet as far as our tables are concerned, so they cannot insert
-- their own profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  candidate text;
  attempt int := 0;
begin
  -- Everything before the @, lowercased, letters and digits only.
  base_handle := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9]', '', 'g'));

  -- Emails are optional for some sign-in methods (phone, for instance), so
  -- fall back to something sane rather than producing an empty handle.
  if base_handle is null or base_handle = '' then
    base_handle := 'member';
  end if;

  -- Keep the readable part short so the finished handle stays handle-sized.
  base_handle := left(base_handle, 20);

  -- Try a few random suffixes. In practice the first one always works.
  loop
    candidate := base_handle || substr(md5(random()::text || new.id::text || attempt::text), 1, 4);
    exit when not exists (select 1 from public.profiles p where p.username = candidate);
    attempt := attempt + 1;
    exit when attempt >= 5;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate,
    -- If the signup form sent a display name, use it. Otherwise show the handle.
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), candidate)
  )
  -- If a profile row somehow already exists for this id, leave it alone rather
  -- than failing the signup.
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Drop first so this file can be run twice without a "trigger already exists"
-- error, then wire the function to the signup event.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 10. Permissions
-- -----------------------------------------------------------------------------
-- Two things control access in Supabase and they are easy to confuse.
--
--   GRANT decides whether a role may touch a table at all.
--   ROW LEVEL SECURITY decides which rows it may touch. That is file 0002.
--
-- `anon` is a signed-out visitor, `authenticated` is a signed-in user. Supabase
-- normally issues these grants for you when a table is created; they are
-- repeated here so this file stands on its own.
grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.posts, public.engagements, public.follows to anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.posts to authenticated;
grant select, insert, delete on public.engagements to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select on public.user_signals to authenticated;

-- Reminder: none of the grants above let anyone read or write rows that the
-- policies in 0002_rls_and_storage.sql do not allow. Run that file next.
