/**
 * =============================================================================
 *  seed.mjs  -  fill an empty database with people, posts and engagement
 * =============================================================================
 *
 *  Run it with:      npm run seed
 *  which expands to: node --env-file=.env.local scripts/seed.mjs
 *
 *  Run the two SQL files in supabase/migrations first. This script assumes the
 *  tables, the enums and the signup trigger already exist.
 *
 *  WHY SEED AT ALL
 *  The point of this project is that you can see a ranking algorithm change its
 *  mind when you move a weight. An empty feed cannot show you that, and neither
 *  can twelve identical posts made in the same minute. So this script builds a
 *  small world with the properties the ranker needs to be interesting:
 *
 *    - eight people with distinct subjects, so "more like this" means something
 *    - posts spread over the last 72 hours, so the recency decay is visible
 *    - a lopsided follow graph, so in-network and out-of-network differ
 *    - engagement that is unevenly distributed, so some posts are genuinely hot
 *    - a handful of negative actions, so the negative weights have something
 *      to bite on when you turn them up
 *
 *  It is safe to run more than once. The first thing it does is delete the
 *  posts, engagements and follows belonging to the demo accounts, then rebuild
 *  them. Anything you posted from your own account is left alone.
 *
 *  It uses the service_role key, which bypasses row level security. That is
 *  fine here because it runs on your machine from a file that is gitignored.
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js';

// The demo world itself lives in lib/demo/dataset.ts, shared with the app so
// that browsing without Supabase shows the same posts this script inserts.
// Node strips the TypeScript types at load, so importing a .ts file here works
// with no build step.
import {
  ACCOUNTS,
  POSTS,
  REPLIES,
  FOLLOWS,
  buildEngagementRows,
} from '../lib/demo/dataset.ts';


// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Shared by every demo account, printed at the end so you can sign in. */
const DEMO_PASSWORD = 'demo-password-1234';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    [
      '',
      'Cannot seed: the database credentials are missing.',
      '',
      'This script needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      'Copy .env.example to .env.local, then open your Supabase project and go to',
      'Project Settings, then API. Paste the "Project URL" into',
      'NEXT_PUBLIC_SUPABASE_URL and the "service_role" secret into',
      'SUPABASE_SERVICE_ROLE_KEY. That second key can read and write everything,',
      'so keep it in .env.local only and never put it in client code. Then run',
      'npm run seed again.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -----------------------------------------------------------------------------


function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** Supabase rejects very large inserts, so send them in batches. */
function chunk(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Print the failure and stop. A half seeded database is worse than none. */
function fail(step, error) {
  console.error(`\nFailed while ${step}:`);
  console.error(error.message ?? error);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Step 1: accounts
// -----------------------------------------------------------------------------
// createUser fails if the email is already registered, and it should: two
// accounts with the same email would be a real problem. So instead of creating
// blindly and catching the error, list what already exists first and only
// create the missing ones. Re-running the script then reuses the same eight
// people and the same ids.

async function ensureAccounts() {
  const existingByEmail = new Map();
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail('listing existing users', error);
    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email) existingByEmail.set(user.email.toLowerCase(), user);
    }
    if (users.length < 200) break;
    page += 1;
  }

  const idByHandle = new Map();
  let created = 0;
  let reused = 0;

  for (const account of ACCOUNTS) {
    const existing = existingByEmail.get(account.email.toLowerCase());

    if (existing) {
      idByHandle.set(account.handle, existing.id);
      reused += 1;
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });
    if (error) fail(`creating the account for ${account.email}`, error);

    idByHandle.set(account.handle, data.user.id);
    created += 1;
  }

  return { idByHandle, created, reused };
}

// -----------------------------------------------------------------------------
// Step 2: profiles
// -----------------------------------------------------------------------------
// The signup trigger has already made a profile row for each new account, with
// a handle derived from the email. This overwrites it with the handle, name and
// bio we actually want. avatar_url stays null on purpose so the Avatar
// component falls back to its initial, which is one less thing to load.

async function upsertProfiles(idByHandle) {
  const rows = ACCOUNTS.map((account) => ({
    id: idByHandle.get(account.handle),
    username: account.handle,
    display_name: account.displayName,
    avatar_url: null,
    bio: account.bio,
  }));

  const { error } = await supabase.from('profiles').upsert(rows, { onConflict: 'id' });
  if (error) fail('writing the demo profiles', error);

  return rows.length;
}

// -----------------------------------------------------------------------------
// Step 3: clear out the previous run
// -----------------------------------------------------------------------------
// Only rows belonging to the eight demo accounts. Deleting their posts also
// deletes the replies underneath them and any engagement on them, because the
// foreign keys cascade.

async function clearPreviousSeed(ids) {
  const steps = [
    ['engagements', supabase.from('engagements').delete().in('user_id', ids)],
    ['posts', supabase.from('posts').delete().in('author_id', ids)],
    ['follows', supabase.from('follows').delete().in('follower_id', ids)],
    ['follows', supabase.from('follows').delete().in('following_id', ids)],
  ];

  for (const [table, query] of steps) {
    const { error } = await query;
    if (error) fail(`clearing old ${table}`, error);
  }
}

// -----------------------------------------------------------------------------
// Step 4: posts and replies
// -----------------------------------------------------------------------------
// Ids are generated here rather than by the database, so replies and
// engagements can point at posts before anything has been inserted.

async function insertPosts(idByHandle) {
  const idByKey = new Map();

  const postRows = POSTS.map((post) => {
    const id = crypto.randomUUID();
    idByKey.set(post.key, id);
    return {
      id,
      author_id: idByHandle.get(post.handle),
      body: post.body,
      media_url: post.mediaUrl,
      media_type: post.mediaType,
      reply_to: null,
      created_at: hoursAgoIso(post.hoursAgo),
    };
  });

  const { error: postError } = await supabase.from('posts').insert(postRows);
  if (postError) fail('inserting posts', postError);

  // Replies go in second, because reply_to has to point at a row that exists.
  const replyRows = REPLIES.map((reply) => ({
    id: crypto.randomUUID(),
    author_id: idByHandle.get(reply.handle),
    body: reply.body,
    media_url: null,
    media_type: 'none',
    reply_to: idByKey.get(reply.parent),
    created_at: hoursAgoIso(reply.hoursAgo),
  }));

  const { error: replyError } = await supabase.from('posts').insert(replyRows);
  if (replyError) fail('inserting replies', replyError);

  return { idByKey, postCount: postRows.length, replyCount: replyRows.length };
}

// -----------------------------------------------------------------------------
// Step 5: follows
// -----------------------------------------------------------------------------

async function insertFollows(idByHandle) {
  const rows = [];

  for (const [follower, targets] of Object.entries(FOLLOWS)) {
    for (const target of targets) {
      rows.push({
        follower_id: idByHandle.get(follower),
        following_id: idByHandle.get(target),
        created_at: hoursAgoIso(72 + rows.length),
      });
    }
  }

  const { error } = await supabase.from('follows').insert(rows);
  if (error) fail('inserting follows', error);

  return rows.length;
}

// -----------------------------------------------------------------------------


async function insertEngagements(rows) {
  for (const batch of chunk(rows, 200)) {
    const { error } = await supabase.from('engagements').insert(batch);
    if (error) fail('inserting engagements', error);
  }
  return rows.length;
}

// -----------------------------------------------------------------------------
// Run it
// -----------------------------------------------------------------------------

async function main() {
  console.log('Seeding the demo world.');

  const { idByHandle, created, reused } = await ensureAccounts();
  console.log(`Accounts: ${created} created, ${reused} already existed and were reused.`);

  const profileCount = await upsertProfiles(idByHandle);

  const ids = [...idByHandle.values()];
  console.log('Clearing posts, replies, engagements and follows from the previous seed run.');
  await clearPreviousSeed(ids);

  const { idByKey, postCount, replyCount } = await insertPosts(idByHandle);
  const followCount = await insertFollows(idByHandle);
  const engagementRows = buildEngagementRows(idByHandle, idByKey);
  const engagementCount = await insertEngagements(engagementRows);

  const byAction = engagementRows.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] ?? 0) + 1;
    return acc;
  }, {});
  const negativeCount = ['mute_author', 'block_author', 'report', 'not_interested', 'video_skip_early']
    .reduce((total, action) => total + (byAction[action] ?? 0), 0);

  console.log('');
  console.log('Done.');
  console.log(`  profiles      ${profileCount}`);
  console.log(`  posts         ${postCount} spread over the last 72 hours`);
  console.log(`  replies       ${replyCount}`);
  console.log(`  follows       ${followCount}`);
  console.log(`  engagements   ${engagementCount}, of which ${negativeCount} are negative signals`);
  console.log('');
  console.log('Sign in with any of these. They all share one password.');
  for (const account of ACCOUNTS) {
    console.log(`  ${account.email.padEnd(32)} @${account.handle}`);
  }
  console.log('');
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log('');
  console.log(`Start with ${ACCOUNTS[0].email}. That account follows four of the others,`);
  console.log('so the feed has a clear in-network and out-of-network mix to look at.');
}

main().catch((error) => {
  console.error('\nSeeding stopped with an unexpected error:');
  console.error(error);
  process.exit(1);
});
