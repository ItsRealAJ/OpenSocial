# CLAUDE.md

Notes for AI agents working in this repo. Read this before editing anything.

## What this project is

An X-style social app whose ranking algorithm is a config file you can read and
edit. The product is the algorithm's legibility, not the social network.

**The one invariant: a person must be able to open `lib/algorithm/weights.ts`,
change a number, refresh, and watch the feed reorder.** Every decision here bends
to that. If a change makes the ranking faster but harder to follow, it is the
wrong change. Optimise for someone reading this cold.

Corollary: do not introduce a model, an embedding store, Redis, a queue, or a
separate backend. Everything runs inside Next.js plus Supabase, and demo mode
runs with neither.

## Commands

```bash
npm run dev      # localhost:3000. Works with an empty .env.local (demo mode).
npm run build    # production build. Typechecks as part of the build.
npm run lint     # eslint
npm run seed     # loads the demo world into a real Supabase project
npx tsc --noEmit --incremental false    # typecheck alone
```

There is no test suite. Verification is: typecheck, lint, build, then exercise
the routes by hand (see [Verifying a change](#verifying-a-change)).

## Architecture

Request flow for the feed, which is the only complicated path:

```
POST /api/feed  { weights, rules, seen, limit }
  -> lib/data/session.ts      who is asking, and which database
  -> lib/algorithm/home-mixer.ts
       -> candidate-pipeline.ts   ~200 eligible posts, in and out of network
       -> thunder.ts              in-memory post + count cache, 30s TTL
       -> phoenix.ts              13 action probabilities -> weighted sum
       -> back in home-mixer      visibility, dedupe, diversity, blending
  -> lib/algorithm/redact.ts   strip private counts
  -> FeedResponse
```

| Path | What lives there |
| --- | --- |
| `lib/algorithm/weights.ts` | **The point of the project.** 13 weights + 6 feed rules, one plain-English comment per line. |
| `lib/algorithm/phoenix.ts` | The ranker. 13 named predictor functions. Heavily commented on purpose. |
| `lib/algorithm/candidate-pipeline.ts` | Who competes. Never ranks the whole table. |
| `lib/algorithm/thunder.ts` | Cache. Has `invalidate(postId)`. |
| `lib/algorithm/home-mixer.ts` | Orchestrator plus the post-scoring rules. |
| `lib/algorithm/storage.ts` | Client-side tuned weights in localStorage. |
| `lib/algorithm/redact.ts` | Strips private negative counts before responses leave the server. |
| `lib/types.ts` | `ALL_ACTIONS` is the spine of the whole app. |
| `lib/data/session.ts` | `getSession()`. Every page and route starts here. |
| `lib/demo/` | The in-memory world used when Supabase is not configured. |
| `lib/supabase/` | Three clients: `client` (browser), `server` (cookies, RLS), `admin` (service role). |
| `supabase/migrations/` | Two SQL files, run in order in the Supabase SQL editor. |
| `scripts/seed.mjs` | Loads `lib/demo/dataset.ts` into a real project. |

## Landmines

These have all bitten someone already. Read them.

**1. Never `.upsert({ onConflict })` on `engagements`.**
The uniqueness rule is a *partial* index (`engagements_one_per_toggle_idx`).
Postgres cannot use a partial index as an `ON CONFLICT` arbiter unless the
statement repeats the index predicate, and PostgREST has no way to send one, so
an upsert fails with `42P10` on every call. Insert and swallow the duplicate:

```ts
const { error } = await supabase.from('engagements').insert(row);
if (error && error.code !== '23505') throw error;   // 23505 = unique_violation
```

**2. Server-only modules must never reach a `'use client'` file.**
`lib/supabase/admin.ts`, `lib/data/session.ts`, `lib/demo/store.ts`,
`lib/demo/db.ts`, `lib/demo/dataset.ts`. Importing the demo store into a client
component ships the entire dataset to the browser; importing admin leaks the
service role key. Check before you import.

**3. Anything leaving the server goes through `redact.ts`.**
The ranker reads global counts with the service role, bypassing RLS. But RLS
deliberately keeps `mute_author`, `block_author`, `report` and `not_interested`
private. `publicCounts()` and `redactFeedPosts()` strip them at the API
boundary. Remove that and you have routed around your own security policy.

**4. `notFound()` must run before any Suspense boundary.**
Once the shell has flushed, Next renders the 404 page with a **200** status.
Resolve the record in the page function, call `notFound()` there, and stream
only the secondary data. Both `app/post/[id]` and `app/profile/[username]` do
this deliberately. Do not move those lookups back inside `<Suspense>`.

**5. Never call `createClient()` unconditionally in a client component.**
`createBrowserClient` throws on empty env vars, and client components are
server-rendered, so it takes the whole page down in demo mode. Use the lazy
pattern from `Composer.tsx` and `ReplyComposer.tsx`:

```ts
const supabase = useMemo(() => (isDemo ? null : createClient()), [isDemo]);
```

**6. Foreign key constraint names are load-bearing.**
The code embeds relations by constraint name: `profiles!posts_author_id_fkey`
in `thunder.ts`, `posts!engagements_post_id_fkey` in `candidate-pipeline.ts`.
Rename a constraint in the migration and post authors stop loading.

**7. Four places must agree on the toggleable action set.**

| File | Constant |
| --- | --- |
| `app/api/engage/route.ts` | `TOGGLEABLE_ACTIONS` |
| `supabase/migrations/0001_schema.sql` | `where action in (...)` on `engagements_one_per_toggle_idx` |
| `lib/demo/db.ts` | `TOGGLEABLE` |
| `lib/demo/dataset.ts` | `TOGGLE_ACTIONS` |

Change one, change all four. They are currently identical. Drift here means a
double tap silently double-counts, which inflates that action's weight.

**8. `lib/demo/dataset.ts` is imported by `scripts/seed.mjs` from plain Node.**
That works because Node strips TypeScript types at load, and because its only
import is an `import type`, which is erased and never resolved. **Do not add a
runtime import to that file**, or `npm run seed` breaks with a module
resolution error.

**9. Next 16 gives `params` and `searchParams` as Promises.** Await them.

**10. Tailwind v4 is CSS-first.** There is no `tailwind.config`. Design tokens
are `@theme` variables in `app/globals.css`.

## How to add things

**A new engagement action.** Add it to `POSITIVE_ACTIONS` or `NEGATIVE_ACTIONS`
in `lib/types.ts`, and the compiler will point at every other place that needs
it: a weight and a `WEIGHT_RANGES` entry in `weights.ts`, a predictor function
and a `PREDICTORS` entry in `phoenix.ts`, the enum in `0001_schema.sql`, and the
RLS select policy in `0002_rls_and_storage.sql` if it should be public. Decide
whether it is a toggle (see landmine 7) and whether it is private (landmine 3).

**A new feed rule.** Add it to `FeedRules` in `lib/types.ts`, give it a default
and a `RULE_RANGES` entry in `weights.ts`, then use it in `home-mixer.ts`. The
settings page picks it up automatically.

**A new page.** Start with `const session = await getSession()` and query
through `session.db`. Never build a Supabase client directly in a page. Wrap in
`<AppShell username={session.username}>`. Confirm it works in demo mode.

**Demo content.** Edit `lib/demo/dataset.ts`. It feeds both demo mode and
`npm run seed`, so they cannot drift.

## Conventions

- **Design tokens only.** `bg-ground`, `bg-surface`, `bg-surface-2`,
  `border-hairline`, `text-ink`, `text-ink-muted`, `accent`, `like`, `repost`,
  `danger`. These are X's real "Lights out" values. No new colors.
- **One radius system.** `rounded-[16px]` for surfaces, `rounded-full` for
  anything pressable. Elevation is a tonal step, never a shadow.
- **Icons from `@phosphor-icons/react/ssr` only.** Never hand-roll SVG paths.
  `weight="fill"` for active state, `weight="regular"` otherwise.
- **No em-dash or en-dash in user-visible text.** Use a period, comma, or
  regular hyphen. This is enforced by convention, not tooling.
- **Every interactive element needs hover, `:active`, and disabled styling.**
  Every data surface needs loading, empty and error states. Skeletons should
  match the final layout rather than being a spinner.
- **Never `window.addEventListener('scroll')`.** Use `IntersectionObserver`.
  Never `h-screen`; use `h-[100dvh]` or `min-h-[100dvh]`. Never `alert()` or
  `confirm()`.
- **Comments explain why, not what.** The algorithm files are documentation as
  much as code. Match their density when editing them; do not strip comments to
  make a diff smaller.
- **Copy is plain and honest.** No marketing voice. Demo-mode copy must never
  imply data is real or that changes persist.

## Demo mode

With no Supabase configured, `getSession()` returns an in-memory world through
`lib/demo/db.ts`, a Supabase-shaped adapter. The ranking pipeline runs against
it unmodified and cannot tell the difference, which is the whole design.

This makes it the fastest way to test a ranking change: no credentials, no
network. If you add a query the adapter does not implement, it throws with a
clear message rather than returning empty, so a missing method is loud.

## Verifying a change

```bash
npx tsc --noEmit --incremental false
npx eslint .
npx next build
```

Then run it and exercise the paths you touched. With an empty `.env.local` this
needs no setup:

```bash
npm run dev
curl -s -X POST localhost:3000/api/feed -H 'Content-Type: application/json' -d '{"limit":5}'
```

Watch the dev server log, not just the status code. A throw inside a Suspense
boundary still returns 200 while printing the real error to the console. That
exact failure mode has hidden a page-breaking bug in this repo before.

Do not claim something works because it typechecks.

## What this project is not

Read the "What This Is and Isn't" section of the README before writing anything
that describes the project. It does not run X's actual Phoenix model, and the
production weights were never published. Do not add copy anywhere that implies
otherwise. The heuristics are a deliberate tradeoff of accuracy for legibility.
