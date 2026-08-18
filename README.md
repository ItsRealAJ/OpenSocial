<p align="center">
  <img alt="Open Social" src=".github/assets/logo-light.png" width="520">
</p>

<h1 align="center">Open Social</h1>

<p align="center">
  A social feed whose ranking algorithm is a config file you can read and edit.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black.svg">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-optional-3ecf8e.svg">
</p>

A working X-style social app with a full-screen vertical reels feed, where the ranking
algorithm is a config file you can read in ten minutes and edit in ten seconds. Open
`lib/algorithm/weights.ts`, change one number, refresh the feed, and the order changes.
That is the entire point of this project. Most feeds are ranked by a model nobody outside
the company can inspect, and often nobody inside it can explain either. This one is ranked
by thirteen small functions and thirteen numbers, all of which are in this repo, and every
post in the app will tell you exactly why it landed where it did if you tap the score chip
in its corner.

**You can look at it before setting anything up.** Clone, `npm install`, `npm run dev`, and the app
runs against a built-in demo dataset held in server memory. The feed is genuinely ranked by the real
algorithm, the score panels show real numbers, and the sliders really do reorder it. A dismissible
notice explains what you are looking at. Fill in the three Supabase keys when you want accounts,
uploads and data that survives a restart.

The architecture is modelled directly on xAI's open-source X recommendation system
([github.com/xai-org/x-algorithm](https://github.com/xai-org/x-algorithm)): the same
four-module pipeline, the same multi-action prediction, the same weighted sum, and the same
property where a single predicted block outweighs dozens of predicted likes. What it does
not do is run X's actual model. Read [What This Is and Isn't](#what-this-is-and-isnt)
before you tell anyone otherwise.

---

## Contents

1. [Run it with no setup](#0-run-it-with-no-setup)
2. [Set up Supabase](#1-set-up-supabase)
3. [Run it locally](#2-run-it-locally)
4. [How the Algorithm Works](#how-the-algorithm-works)
5. [Tuning Your Feed](#tuning-your-feed)
6. [Deploy to Vercel](#deploy-to-vercel)
7. [What This Is and Isn't](#what-this-is-and-isnt)
8. [Project layout](#project-layout)
9. [License](#license)

---

## 0. Run it with no setup

```bash
npm install
npm run dev
```

That is it. No account, no keys, no database. Open
[http://localhost:3000](http://localhost:3000) and the feed is there.

With no Supabase project configured the app falls back to **demo mode**: eight accounts, thirty-two
posts spread across the last three days, a lopsided follow graph, and a few hundred engagement rows,
all held in the memory of the dev server. A notice explains this on every load. You can dismiss it and
keep browsing; it comes back next time you open the site, because it is a thing you should fix rather
than a thing to ignore forever.

What is real in demo mode:

- The ranking. `candidate-pipeline` to `thunder` to `phoenix` to `home-mixer` runs unmodified. Demo
  mode is a database adapter, not a different code path, and the pipeline cannot tell the difference.
- The score panel on every post, including the probabilities, the weights, and the shaping notes.
- The sliders on `/settings/algorithm`. Change a weight, go back to the feed, watch it reorder.
- Likes, reposts, bookmarks, mutes, blocks and follows. They write to the in-memory store, so counts
  and scores move as you tap.

What is not real:

- Persistence. Everything lives in one server process. Restart it and your likes are gone.
- Accounts. There is no auth. You browse as a synthetic viewer who follows four of the eight authors,
  which is what makes the in-network and out-of-network split visible in the score panel.
- Uploads. There is no storage bucket, so `/compose` accepts text posts only.
- Isolation. Anyone hitting the same server process shares the same store.

The demo data is the same data `npm run seed` inserts into a real project. Both read
`lib/demo/dataset.ts`, so what you see before setup is what you get after it.

Demo mode turns itself off the moment `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are set. There is no flag to remember.

---

## 1. Set up Supabase

Supabase is a hosted Postgres database with authentication and file storage attached. This
app keeps everything there: accounts, posts, uploaded video, and the engagement rows the
ranker reads. The free tier is enough. If you have never used it, follow these steps
literally and nothing here assumes prior knowledge.

### 1.1 Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project**. Give it any name. Pick a region near you.
3. Set a database password when asked and save it somewhere. You will not need it for this
   app, but Supabase will not let you continue without one.
4. Wait for the project to finish provisioning. It takes a minute or two.

### 1.2 Run the two migration files

1. In the left sidebar click **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0001_schema.sql` from this repo. Copy the whole file, paste it
   into the editor, and click **Run**. It creates the five tables, the two enums, the
   indexes, and a trigger that creates a profile row whenever someone signs up.
3. Open a new query. Copy the whole of `supabase/migrations/0002_rls_and_storage.sql`,
   paste, and **Run**. This turns on Row Level Security, writes the access policies, and
   creates the storage bucket.

Both files are safe to run more than once.

### 1.3 Check the storage bucket

Click **Storage** in the sidebar. You should see a bucket named `media` marked public. The
second migration creates it. If it is not there, click **New bucket**, name it exactly
`media`, and toggle **Public bucket** on.

Public matters: the feed loads video and images by URL straight from this bucket. Uploads
are still restricted, since the storage policy only lets a signed-in user write to a folder
named after their own user id.

### 1.4 Copy your three keys

1. Click the gear icon, then **Project Settings**, then **API**.
2. You need three values from that page:

| Value on the Supabase page | Goes in `.env.local` as | Safe in the browser? |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes, Row Level Security protects the data |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **No. Never.** |

The `service_role` key bypasses every security policy in the database. It exists in this
app for one reason: the ranker has to count engagements across all users to know that a
post has 400 likes, and Row Level Security deliberately stops the browser from doing that.
It is used only inside server-side route handlers. It is never sent to the client, and the
`.gitignore` keeps `.env.local` out of version control. Do not paste it anywhere else.

---

## 2. Run it locally

You need Node 18.18 or newer. Node 20 or 24 is fine.

```bash
git clone <your-fork-url>
cd <the-folder>
npm install

cp .env.example .env.local
# open .env.local and paste in the three values from step 1.4

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If you have not filled in `.env.local` yet, nothing breaks. The app runs in
[demo mode](#0-run-it-with-no-setup) and shows a dismissible notice saying so, so you can
start the dev server first and sort the keys out afterwards.

### Load some demo content

A ranking algorithm with nothing to rank is not very convincing. This loads the same eight
demo accounts, thirty-two posts, follow graph and engagement rows that demo mode serves from
memory, except into your own project where they persist:

```bash
npm run seed
```

It prints the demo account emails and a shared password when it finishes, so you can sign
in as one of them and see an in-network feed rather than a cold-start one.

### Sign in

`/login` sends a magic link by email, which is Supabase's default and needs no extra setup.
The seeded demo accounts also have a password, so if you would rather not wait for an
email, use the password form on the same page with the credentials the seed script printed.

---

## How the Algorithm Works

Four modules, in `lib/algorithm/`. They run in this order on every feed request:

```
                       POST /api/feed
                    { weights, rules, seen }
                             |
                             v
        +--------------------------------------------+
        |          home-mixer.ts                     |
        |          the orchestrator                  |
        +--------------------------------------------+
                             |
        1. who is this person?
                             v
        +--------------------------------------------+
        |     candidate-pipeline.ts                  |
        |                                            |
        |  IN-NETWORK        accounts you follow     |
        |  OUT-OF-NETWORK    authors you have        |
        |                    engaged with, plus      |
        |                    recent popular posts    |
        |                                            |
        |  ~200 candidates. Never the whole table.   |
        +--------------------------------------------+
                             |
        2. hand me those posts, fast
                             v
        +--------------------------------------------+
        |          thunder.ts                        |
        |  in-memory Map, 30s TTL, holds posts       |
        |  and their engagement counts so the        |
        |  ranker is not re-querying per post        |
        +--------------------------------------------+
                             |
        3. score every one of them
                             v
        +--------------------------------------------+
        |          phoenix.ts                        |
        |                                            |
        |  For each post, predict 13 probabilities:  |
        |    like, reply, repost, bookmark, share,   |
        |    profile_click, video_watch_complete,    |
        |    follow_author,                          |
        |    mute_author, block_author, report,      |
        |    not_interested, video_skip_early        |
        |                                            |
        |  score = SUM( P(action) x WEIGHTS[action] )|
        +--------------------------------------------+
                             |
        4. now make it an actual feed
                             v
        +--------------------------------------------+
        |     back in home-mixer.ts                  |
        |                                            |
        |  visibility   drop blocked, muted,         |
        |               dismissed                    |
        |  dedupe       drop what you already saw    |
        |  diversity    max 2 in a row per author    |
        |  blending     interleave reels and text    |
        +--------------------------------------------+
                             |
                             v
                     ordered feed to the UI
```

### 1. `candidate-pipeline.ts` - what are we even ranking?

Ranking is expensive, so you never rank the whole database. This file pulls roughly 200
posts that stand a chance and hands them on.

Two kinds of source, the same split the real system uses. **In-network** is posts by
accounts you follow. **Out-of-network** is everything else, and it comes from two places:
authors you have liked or replied to before but do not follow (the "you keep engaging with
this person" signal), and recent posts with broad engagement (the cold-start fallback that
carries a brand-new account's entire feed).

The real system finds out-of-network candidates with embedding search and engagement-graph
clustering. Neither fits inside a route handler, so this is the readable approximation of
the same intuition. Nothing here scores anything; it only decides who competes.

### 2. `thunder.ts` - the in-memory post store

In the real system Thunder is a Rust service holding recent posts in memory for
sub-millisecond lookup. Here it is a `Map` with timestamps and a 30 second TTL.

Same job. Without it, every feed refresh would run one count query per post. With a warm
cache it runs zero. It also exposes `invalidate(postId)`, which the engagement route calls
so your own like shows up immediately instead of waiting out the TTL.

### 3. `phoenix.ts` - the ranker

The most important file in the project, and the most heavily commented. Read it top to
bottom and you will know everything about how this feed is ordered.

For every candidate it predicts a probability for each of thirteen actions, then combines
them:

```
score = SUM over every action of ( P(action) x WEIGHTS[action] )
```

Every predictor is the same three steps:

1. **Base rate.** How often does this action actually happen on this post? Engagements over
   estimated impressions, smoothed toward a prior so that one like on two views does not
   read as a 50% like rate.
2. **Multipliers.** Adjust for this viewer and this moment. Do they follow the author, have
   they engaged with this author before, how old is the post, is it a video.
3. **Clamp** back into 0 to 1, because it is a probability.

Each of the thirteen lives in its own named function: `predictLike`, `predictReply`,
`predictBlockAuthor`, and so on. If you disagree with how the feed treats replies, there is
exactly one eight-line function to argue with.

A few of them are worth reading closely because their structure carries real decisions:

- `predictFollowAuthor` returns 0 when you already follow the author. That is what makes
  its `+24` weight a discovery lever rather than a loyalty bonus.
- `predictVideoWatchComplete` returns 0 for anything that is not a video, which is what
  makes a weight of `20.0` safe: text posts are not punished by a signal they cannot emit.
- The negative predictors barely decay with time, and they invert the relationship
  multiplier. You do not block accounts you chose to follow. You block strangers something
  pushed at you.

### 4. `home-mixer.ts` - the orchestrator

Calls the other three in order, then fixes what pure scoring gets wrong. The twelve
highest-scoring posts are almost always twelve posts by three people about one thing.

- **Visibility filtering** runs *before* scoring, not after. There is no point spending
  compute on a post that is not allowed to appear, and no score is high enough to override
  a block. Keeping "how good is this" and "is this allowed" as separate questions is one of
  the real system's better ideas.
- **Dedupe** against the post ids the client has already rendered this session.
- **Author diversity** caps how many posts in a row one account can hold.
- **Blending** caps consecutive reels so video and text interleave.

Selection is greedy: walk the score-sorted list and take the best post that does not break a
rule. If everything left breaks a rule, take the best one anyway and note it in the
breakdown, because a rule that can empty your timeline is not a rule, it is a bug.

### Seeing it in the product

Every card in the feed has a score chip in its corner. Tap it and you get the final score,
the top three actions that produced it with their probabilities and weights, all thirteen
contributions if you expand them, the raw signals the ranker saw, and any shaping the mixer
applied. That panel is the pitch: the algorithm is not a black box you read about in the
README, it is a thing you can interrogate one post at a time.

---

## Tuning Your Feed

Everything tunable is in one file: **`lib/algorithm/weights.ts`**. It exports two objects.

`WEIGHTS` is one number per action. Positives are small for cheap actions and large for
expensive ones: a like costs a thumb twitch, a reply costs a sentence, a follow changes what
you see for months. Negatives are an order of magnitude larger than any positive, which is
the single most important property of the file. A platform that optimises for engagement
alone will happily show you things that make you want to leave, because outrage is engaging.
Making one predicted block cost more than seventy predicted likes is how a ranker optimises
for someone still being here next month.

`FEED_RULES` is the shaping applied after scoring: the out-of-network discount, the author
diversity cap, the recency half-life, the candidate pool size, the in-network share, and the
media blending cap.

Two ways to change them:

- **Edit the file.** Change a number, save, refresh the feed. This is the version that
  affects everyone using your deployment.
- **Use the sliders.** `/settings/algorithm` has a control for every weight and every rule,
  with a plain-English caption on each. Your values are stored in `localStorage` and posted
  to the ranker with each feed request, so they only affect your browser. There is a reset
  button, and four presets matching the worked examples below.

### Worked example 1: a chronological feed

Turn ranking off. Make every action worth nothing, so no post can out-score another on
engagement, and make the recency decay so aggressive that ordering collapses to newest
first.

```ts
export const WEIGHTS: Weights = {
  like: 0.001,          // a hair above zero, so ties still break by recency
  reply: 0,
  repost: 0,
  bookmark: 0,
  share: 0,
  profile_click: 0,
  video_watch_complete: 0,
  follow_author: 0,
  mute_author: 0,
  block_author: 0,
  report: 0,
  not_interested: 0,
  video_skip_early: 0,
};

export const FEED_RULES: FeedRules = {
  outOfNetworkDiscount: 1.0,     // strangers and friends ranked identically
  maxConsecutiveSameAuthor: 10,  // do not reorder for diversity
  recencyHalfLifeHours: 0.5,     // 30 minutes: recency dominates everything
  candidatePoolSize: 200,
  inNetworkShare: 1.0,           // only accounts you follow
  maxConsecutiveSameMedia: 20,   // do not reorder for blending either
};
```

Worth doing once. It is a useful reminder of how much work the ranker was doing.

### Worked example 2: maximum engagement

The configuration a company builds when the only number on the dashboard is time spent.
Push every cheap positive up, and delete the brakes entirely.

```ts
export const WEIGHTS: Weights = {
  like: 12.0,                 // chase mass appeal
  reply: 20.0,                // arguments are engagement too
  repost: 18.0,
  bookmark: 2.0,              // private saves do not generate sessions
  share: 6.0,
  profile_click: 3.0,
  video_watch_complete: 40.0, // watch time above all
  follow_author: 5.0,
  mute_author: 0,             // every brake removed
  block_author: 0,
  report: 0,
  not_interested: 0,
  video_skip_early: 0,
};

export const FEED_RULES: FeedRules = {
  outOfNetworkDiscount: 1.2,     // push strangers harder than friends
  maxConsecutiveSameAuthor: 6,   // let a hit account run
  recencyHalfLifeHours: 72,      // a viral post keeps earning for days
  candidatePoolSize: 400,
  inNetworkShare: 0.2,
  maxConsecutiveSameMedia: 20,
};
```

Try it for a minute and then read the score panels. Posts that people muted and reported
are now ranked purely on how many other people reacted to them, because you deleted the
only term that was counting the damage. This is the configuration the defaults exist to
avoid, and it is included here because seeing it is more convincing than being told.

### Worked example 3: conversation over reach

Rank on whether a post started a conversation rather than on how far it travelled. Keep the
negatives intact, because a feed built to provoke replies is exactly the feed that needs
them.

```ts
export const WEIGHTS: Weights = {
  like: 0.5,                  // popularity barely counts
  reply: 40.0,                // the whole feed is built on this number
  repost: 2.0,                // reach is not the goal
  bookmark: 8.0,              // useful posts still deserve reach
  share: 3.0,
  profile_click: 6.0,         // interesting people over interesting posts
  video_watch_complete: 6.0,  // video rarely starts a conversation
  follow_author: 20.0,
  mute_author: -50.0,         // brakes stay on, harder than the defaults
  block_author: -90.0,
  report: -120.0,
  not_interested: -35.0,
  video_skip_early: -8.0,
};

export const FEED_RULES: FeedRules = {
  outOfNetworkDiscount: 0.7,     // conversations happen with people you know
  maxConsecutiveSameAuthor: 1,   // never the same voice twice in a row
  recencyHalfLifeHours: 3,       // a live conversation, not yesterday's
  candidatePoolSize: 200,
  inNetworkShare: 0.7,
  maxConsecutiveSameMedia: 2,
};
```

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. At [vercel.com/new](https://vercel.com/new), import the repository. Vercel detects
   Next.js on its own, so leave the build settings alone.
3. Before the first deploy, open **Environment Variables** and add all three from your
   `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Add each to Production, Preview and Development. The first two are public by design. The
   third must stay a Vercel environment variable and must never be prefixed with
   `NEXT_PUBLIC_`, or it would be bundled into the browser build.
4. Deploy.
5. In Supabase, go to **Authentication**, then **URL Configuration**, and add your Vercel
   URL as the Site URL, plus `https://your-app.vercel.app/auth/callback` under Redirect
   URLs. Magic links will not work until you do this.

One thing to know about Thunder in production: it is per-process memory, so each serverless
instance keeps its own cache and a cold start begins with an empty one. That is fine, and it
is the honest version of the tradeoff. Fixing it properly is what Redis is for, and this
project deliberately does not add Redis.

---

## What This Is and Isn't

Read this section before describing this project to anyone.

**This mirrors the architecture of X's open-source recommendation system.** The four-module
pipeline (candidate sourcing, in-memory store, ranking, mixing), the multi-action prediction
structure, the weighted-sum scoring, the out-of-network discount, the author diversity
decay, and the property that negative signals outweigh positive ones by an order of
magnitude. Those are all real structural properties of the published system, and they are
faithfully reproduced here.

**This does not run X's actual Phoenix model.** Phoenix is a Grok-derived JAX transformer
distributed as a multi-gigabyte artifact. It cannot run inside a Next.js app, it cannot run
on Vercel, and it would not run on your laptop. What this project calls Phoenix is thirteen
hand-written heuristic functions with the same input and output shape as the real ranker.
Same interface, entirely different machinery.

**The production weights were not part of the open-source release.** The numbers that
determine actual distribution on X were not published. No project, including this one, can
replicate real X ranking behaviour, and any project claiming to is either mistaken or
lying. The numbers in `weights.ts` were chosen by hand to make the relationships between
actions legible, and the priors in `phoenix.ts` are plausible values, not measured ones.

**The scoring here is heuristic and completely readable, and that is the trade this project
is making.** A trained model would predict better than these functions ever will. But
nobody, including the people who trained it, can tell you why it ranked a specific post
seventh. Here you can, and the app shows you: every post carries a breakdown of its own
score. Legibility was chosen over accuracy on purpose, because legibility is the thing the
project is for.

**Demo mode is a demo of the algorithm, not of a product.** The dataset it serves is invented. The
eight accounts are not real people, the posts are written to give the ranker something with texture to
sort, and the attached video and images are public sample files that have nothing to do with what the
posts describe. The engagement numbers are generated from a fixed random seed. None of it is measured
from anything. What is real is the ranking applied to it.

**Also worth stating plainly:** this is a demo, not a production social network. There is no
content moderation beyond the visibility filters, no rate limiting, no spam defence, no
abuse reporting workflow behind the report button, and no notion of impressions (the ranker
estimates them, and `estimateImpressions` in `phoenix.ts` says exactly how). Do not put real
users on it without addressing all of that.

---

## Project layout

```
app/
  page.tsx                     the feed
  compose/page.tsx             write a post, upload image or video
  post/[id]/page.tsx           one post and its replies
  profile/[username]/page.tsx  an account and its posts
  settings/algorithm/page.tsx  a slider for every weight
  login/page.tsx               magic link, or password for seeded accounts
  api/feed/route.ts            runs the pipeline, takes your weights in the body
  api/engage/route.ts          writes one row to engagements, invalidates Thunder
  api/follow/route.ts          follow and unfollow
  auth/callback/route.ts       magic link lands here

lib/algorithm/
  weights.ts                   THE FILE. 13 numbers and 6 rules.
  candidate-pipeline.ts        who is eligible
  thunder.ts                   in-memory post and count cache
  phoenix.ts                   13 predictors and the weighted sum
  home-mixer.ts                orchestration, filtering, diversity, blending
  redact.ts                    strips private negative counts before they
                               leave the server
  storage.ts                   your tuned weights in localStorage

lib/demo/
  dataset.ts                   the demo world. Shared with scripts/seed.mjs, so
                               demo mode and `npm run seed` show the same posts.
  store.ts                     materialises it in memory
  db.ts                        a Supabase-shaped adapter over that store, so the
                               ranker never learns demo mode exists

lib/data/session.ts            one place that answers "who is asking, and what
                               do I query": real Supabase or the demo world

CLAUDE.md                      orientation for AI agents: the invariants, the
                               landmines, and how to extend the template

supabase/migrations/           run these two files in the Supabase SQL editor
scripts/seed.mjs               npm run seed
```

The engagements table is the input to all of it. Every tap in the feed writes one row, and
that table is the only thing the ranker learns from. There is no hidden state anywhere else.

---

## License

MIT. Do whatever you want with it: use it, change it, ship it, sell it, teach
from it, fork it and never mention this repo again. No permission needed and no
attribution expected beyond keeping the license file with the code.

If you build something interesting on top of it, saying so in the Discord would
be nice, but it is not a condition of anything.

---

Want a deeper version of this build, with real embedding-based retrieval, a trained ranking
model instead of heuristics, or help extending it? Ask in the Discord:
**[Join the Discord](https://bit.ly/BuildersAI)**
