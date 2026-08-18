/**
 * =============================================================================
 *  THE DEMO WORLD
 * =============================================================================
 *
 *  One dataset, two consumers:
 *
 *    scripts/seed.mjs   inserts it into your Supabase project, mapping these
 *                       handles and keys onto real uuids.
 *    lib/demo/store.ts  materialises it in memory when no Supabase project is
 *                       configured, so the app is browsable straight after a
 *                       clone with nothing set up.
 *
 *  Keeping it in one file means the feed you see in demo mode is the same feed
 *  you get after `npm run seed`, rather than two datasets that drift apart.
 *
 *  Node runs this file directly from seed.mjs. That works because Node 22.6+
 *  strips TypeScript types at load, and because the only import below is an
 *  `import type`, which is erased entirely and never resolved at runtime.
 * =============================================================================
 */

import type { ActionName, MediaType } from '@/lib/types';

export interface DemoAccount {
  handle: string;
  displayName: string;
  email: string;
  bio: string;
}

export interface DemoPost {
  /** Label used to attach replies and negative engagement. Never stored. */
  key: string;
  handle: string;
  hoursAgo: number;
  body: string;
  mediaType: MediaType;
  mediaUrl: string | null;
}

export interface DemoReply {
  handle: string;
  /** The `key` of the post being replied to. */
  parent: string;
  hoursAgo: number;
  body: string;
}

export interface DemoNegative {
  key: string;
  action: ActionName;
  handles: string[];
}

/** A row the generator produces, still expressed in ids the caller supplies. */
export interface DemoEngagementRow {
  user_id: string;
  post_id: string;
  action: ActionName;
  created_at: string;
}

// The cast
// -----------------------------------------------------------------------------
// Eight accounts, each with one subject they will not shut up about. The
// subjects are deliberately far apart, because that is what makes a ranked feed
// feel different from a chronological one: when the weights favour video, you
// should be able to see whose posts move up.

export const ACCOUNTS: DemoAccount[] = [
  {
    handle: 'marisolwrenches',
    displayName: 'Marisol Vega',
    email: 'marisol.vega@example.com',
    bio: 'Fixing old steel bicycles in a two car garage. Mostly mixtes and touring frames.',
  },
  {
    handle: 'sowsounds',
    displayName: 'Ibrahim Sow',
    email: 'ibrahim.sow@example.com',
    bio: 'Recording harbours, markets and rain. Sound only, no music.',
  },
  {
    handle: 'priyametallurgy',
    displayName: 'Priya Raghunathan',
    email: 'priya.raghunathan@example.com',
    bio: 'Materials engineer. Fatigue testing and failure analysis, mostly welded steel.',
  },
  {
    handle: 'karambakehouse',
    displayName: 'Dahlia Karam',
    email: 'dahlia.karam@example.com',
    bio: 'I run a small bakery. Sourdough, sesame rings, and one very stubborn oven.',
  },
  {
    handle: 'olagtfs',
    displayName: 'Ola Lindqvist',
    email: 'ola.lindqvist@example.com',
    bio: 'Transit data as a hobby. Feed parsing, headway charts, opinions about the number 4 bus.',
  },
  {
    handle: 'nikauonrock',
    displayName: 'Nikau Reweti',
    email: 'nikau.reweti@example.com',
    bio: 'Granite and sandstone. Working through a long list of unfinished projects.',
  },
  {
    handle: 'kenjikeepstime',
    displayName: 'Kenji Arakawa',
    email: 'kenji.arakawa@example.com',
    bio: 'Session drummer. Studio work during the week, small rooms on weekends.',
  },
  {
    handle: 'yewandeshoots',
    displayName: 'Yewande Adeyemi',
    email: 'yewande.adeyemi@example.com',
    bio: 'Camera operator. Short clips, available light, usually at the wrong time of day.',
  },
];

// -----------------------------------------------------------------------------
// Stand-in media
// -----------------------------------------------------------------------------
// None of this media belongs to the people above, and none of it matches what
// they are describing. It is here so the feed has something to play and show.
// The videos are Google's long-lived public sample clips. The images come from
// picsum.photos, which returns a stable photo for a given seed word, sized to
// the tall aspect ratio the reels feed uses. Replace both with real uploads to
// the `media` storage bucket when you have any.

const VIDEO_BASE: string = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';
const video = (file: string): string => `${VIDEO_BASE}/${file}`;
const image = (slug: string): string => `https://picsum.photos/seed/${slug}/1080/1350`;

// -----------------------------------------------------------------------------
// The posts
// -----------------------------------------------------------------------------
// `hoursAgo` is written out per post rather than randomised, because the whole
// point is to be able to look at the feed and check that a 2 hour old post with
// modest engagement can still beat a 60 hour old post with a lot of it. Spread:
// roughly 37% video, 25% image, 37% text only.
//
// `key` is just a label used further down to attach replies and the negative
// engagement to specific posts. It is not stored anywhere.

export const POSTS: DemoPost[] = [
  // Marisol Vega, bicycles
  {
    key: 'freewheel',
    handle: 'marisolwrenches',
    hoursAgo: 51,
    body: 'The freewheel finally broke loose after twenty minutes of penetrating oil and swearing. Sound on for the click.',
    mediaType: 'video',
    mediaUrl: video('BigBuckBunny.mp4'),
  },
  {
    key: 'hub-grease',
    handle: 'marisolwrenches',
    hoursAgo: 30,
    body: 'Repacked the hubs on the touring bike. Forty year old grease on the left, new on the right.',
    mediaType: 'image',
    mediaUrl: image('bicycle-hub-bearings-repack'),
  },
  {
    key: 'brazing',
    handle: 'marisolwrenches',
    hoursAgo: 20,
    body: 'Brazed a rack mount onto the fork tonight. The first attempt looked like a bird nest, the second one is holding.',
    mediaType: 'video',
    mediaUrl: video('ForBiggerBlazes.mp4'),
  },
  {
    key: 'sold-bike-returns',
    handle: 'marisolwrenches',
    hoursAgo: 9,
    body: 'A bike I sold last spring came back for a tune up with 4000 km on it. That is the best review I am going to get.',
    mediaType: 'none',
    mediaUrl: null,
  },

  // Ibrahim Sow, field recording
  {
    key: 'fish-landing',
    handle: 'sowsounds',
    hoursAgo: 64,
    body: 'Six in the morning at the fish landing. The winches sit on a low note and everybody just shouts over it.',
    mediaType: 'video',
    mediaUrl: video('ElephantsDream.mp4'),
  },
  {
    key: 'rain-roof',
    handle: 'sowsounds',
    hoursAgo: 44,
    body: 'Rain on a tin roof is the recording people ask me for most and the hardest one to get clean. One drip near the mic ruins the take.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'mic-rig',
    handle: 'sowsounds',
    hoursAgo: 26,
    body: 'Rig for tonight. Two omnis on a bar, wind cover, and a lot of standing still.',
    mediaType: 'image',
    mediaUrl: image('two-omni-microphones-on-bar'),
  },
  {
    key: 'ferry-idle',
    handle: 'sowsounds',
    hoursAgo: 6,
    body: 'Ferry engine idling at the dock, taken from the lower deck. Headphones if you have them.',
    mediaType: 'video',
    mediaUrl: video('Sintel.mp4'),
  },

  // Priya Raghunathan, materials engineering
  {
    key: 'fatigue-cycles',
    handle: 'priyametallurgy',
    hoursAgo: 70,
    body: 'The fatigue rig ran 2.1 million cycles before the crack showed up on the fillet radius, which is exactly where the model put it.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'fracture-scope',
    handle: 'priyametallurgy',
    hoursAgo: 47,
    body: 'Fracture surface under the scope this morning. You can read the whole failure in those beach marks.',
    mediaType: 'image',
    mediaUrl: image('steel-fracture-surface-beach-marks'),
  },
  {
    key: 'bend-test',
    handle: 'priyametallurgy',
    hoursAgo: 23,
    body: 'Three point bend on the sample that failed inspection. It holds well past the spec and then lets go all at once.',
    mediaType: 'video',
    mediaUrl: video('TearsOfSteel.mp4'),
  },
  {
    key: 'steel-warns',
    handle: 'priyametallurgy',
    hoursAgo: 11,
    body: 'People think steel fails suddenly. It almost never does. It tells you for months first, and usually nobody is looking.',
    mediaType: 'none',
    mediaUrl: null,
  },

  // Dahlia Karam, bakery
  {
    key: 'oven-hot',
    handle: 'karambakehouse',
    hoursAgo: 66,
    body: 'The oven has been running eleven degrees hot since Tuesday and I only worked it out because the sesame rings kept darkening on one side.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'first-bake',
    handle: 'karambakehouse',
    hoursAgo: 40,
    body: 'First bake out at 4:40. Steam for the first ten minutes, then the crust does the rest.',
    mediaType: 'video',
    mediaUrl: video('ForBiggerJoyrides.mp4'),
  },
  {
    key: 'levain',
    handle: 'karambakehouse',
    hoursAgo: 18,
    body: 'The levain doubled in five hours today, which is fast even for this kitchen in August.',
    mediaType: 'image',
    mediaUrl: image('sourdough-levain-rising-in-jar'),
  },
  {
    key: 'olive-loaf',
    handle: 'karambakehouse',
    hoursAgo: 4,
    body: 'Sold out of the olive loaf by nine again. Every week I say I will make more of it and every week I do not.',
    mediaType: 'none',
    mediaUrl: null,
  },

  // Ola Lindqvist, transit data
  {
    key: 'route4-bunching',
    handle: 'olagtfs',
    hoursAgo: 60,
    body: 'Pulled a month of arrival times for route 4. The bunching starts at 07:20 and never really recovers until mid afternoon.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'headway-chart',
    handle: 'olagtfs',
    hoursAgo: 36,
    body: 'Headway chart for the 4, one dot per bus. The gaps are the part riders actually feel.',
    mediaType: 'image',
    mediaUrl: image('bus-headway-scatter-plot'),
  },
  {
    key: 'timetable-gap',
    handle: 'olagtfs',
    hoursAgo: 15,
    body: 'The printed timetable and the realtime feed disagree by about ninety seconds on average. That gap is most of what people mean when they say the bus is unreliable.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'two-buses',
    handle: 'olagtfs',
    hoursAgo: 2,
    body: 'Two buses at the same stop thirty seconds apart, then nothing for nineteen minutes. This is what the chart looks like from the pavement.',
    mediaType: 'video',
    mediaUrl: video('ForBiggerEscapes.mp4'),
  },

  // Nikau Reweti, climbing
  {
    key: 'weather-window',
    handle: 'nikauonrock',
    hoursAgo: 58,
    body: 'Drove four hours for a weather window that shut before we finished racking up. Slept in the car and came home.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'wide-crack',
    handle: 'nikauonrock',
    hoursAgo: 33,
    body: 'Second pitch on the granite route, the wide crack nobody in the group wanted.',
    mediaType: 'video',
    mediaUrl: video('ForBiggerFun.mp4'),
  },
  {
    key: 'rack-tailgate',
    handle: 'nikauonrock',
    hoursAgo: 21,
    body: 'Rack laid out on the tailgate. Doubles in the mid sizes, because that crack eats gear.',
    mediaType: 'image',
    mediaUrl: image('climbing-rack-on-truck-tailgate'),
  },
  {
    key: 'boulder-sent',
    handle: 'nikauonrock',
    hoursAgo: 7,
    body: 'Finally did the boulder problem I have been failing on since March. It took a shoe change and a colder morning, nothing else.',
    mediaType: 'video',
    mediaUrl: video('SubaruOutbackOnStreetAndDirt.mp4'),
  },

  // Kenji Arakawa, session drumming
  {
    key: 'eleven-takes',
    handle: 'kenjikeepstime',
    hoursAgo: 55,
    body: 'Eleven takes of the same chorus today. Take three was the one and everyone in the room knew it while it was happening.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'ride-warmup',
    handle: 'kenjikeepstime',
    hoursAgo: 29,
    body: 'Warming up before the session. Ride and hi hat only, for about ten minutes.',
    mediaType: 'video',
    mediaUrl: video('ForBiggerMeltdowns.mp4'),
  },
  {
    key: 'click-94',
    handle: 'kenjikeepstime',
    hoursAgo: 13,
    body: 'The click was at 96 and the song clearly wanted 94. Nobody could explain why until we just tried it.',
    mediaType: 'none',
    mediaUrl: null,
  },
  {
    key: 'studio-kit',
    handle: 'kenjikeepstime',
    hoursAgo: 3,
    body: 'Kit for the week. Small kick, coated heads, one crash, and the engineer asking me to play quieter.',
    mediaType: 'image',
    mediaUrl: image('studio-drum-kit-coated-heads'),
  },

  // Yewande Adeyemi, camera work
  {
    key: 'zoom-wide-open',
    handle: 'yewandeshoots',
    hoursAgo: 62,
    body: 'Handheld test with the old zoom wide open. The focus breathing is terrible and I like it more than the sharp lens.',
    mediaType: 'video',
    mediaUrl: video('VolkswagenGTIReview.mp4'),
  },
  {
    key: 'golden-hour',
    handle: 'yewandeshoots',
    hoursAgo: 34,
    body: 'Golden hour lasted about nine minutes and we got two of the four setups. The other two are now a night scene.',
    mediaType: 'video',
    mediaUrl: video('WeAreGoingOnBullrun.mp4'),
  },
  {
    key: 'rooftop-grab',
    handle: 'yewandeshoots',
    hoursAgo: 16,
    body: 'Frame grab from the rooftop scene, before anyone has touched the colour.',
    mediaType: 'image',
    mediaUrl: image('rooftop-film-frame-grab'),
  },
  {
    key: 'cracked-monitor',
    handle: 'yewandeshoots',
    hoursAgo: 1,
    body: 'Shot all day on a monitor with a cracked corner. You stop noticing after an hour, which is the dangerous part.',
    mediaType: 'none',
    mediaUrl: null,
  },
];

// -----------------------------------------------------------------------------
// Replies
// -----------------------------------------------------------------------------
// A reply is a post with reply_to set, so these go into the same table. They
// give /post/[id] something to show, and each one also gets a 'reply' row in
// engagements, because that is the signal the ranker reads.

export const REPLIES: DemoReply[] = [
  {
    handle: 'marisolwrenches',
    parent: 'fatigue-cycles',
    hoursAgo: 68,
    body: '2.1 million cycles is more patience than I have. Does the radius change where it starts, or only how long it takes?',
  },
  {
    handle: 'karambakehouse',
    parent: 'route4-bunching',
    hoursAgo: 58,
    body: 'The 4 is how my morning staff get in. 07:20 is exactly when they start texting me.',
  },
  {
    handle: 'priyametallurgy',
    parent: 'oven-hot',
    hoursAgo: 63,
    body: 'Eleven degrees is well inside what a cheap probe drifts by in a year. Worth checking the thermocouple before you blame the oven.',
  },
  {
    handle: 'kenjikeepstime',
    parent: 'freewheel',
    hoursAgo: 49,
    body: 'That click is almost exactly in time with the track I recorded yesterday. I am going to sample it.',
  },
  {
    handle: 'yewandeshoots',
    parent: 'fracture-scope',
    hoursAgo: 45,
    body: 'I would hang that on a wall. What magnification is it?',
  },
  {
    handle: 'nikauonrock',
    parent: 'first-bake',
    hoursAgo: 38,
    body: 'Watching this at 5am in a car park waiting for enough light to climb. Not helping.',
  },
  {
    handle: 'marisolwrenches',
    parent: 'weather-window',
    hoursAgo: 56,
    body: 'The four hours each way is the part nobody puts in the photos.',
  },
  {
    handle: 'nikauonrock',
    parent: 'zoom-wide-open',
    hoursAgo: 60,
    body: 'The breathing makes it feel like the camera is out of breath, which suits the subject.',
  },
  {
    handle: 'olagtfs',
    parent: 'ferry-idle',
    hoursAgo: 5,
    body: 'The ferry keeps a better headway than any bus route in this city, and it is a boat.',
  },
];

// -----------------------------------------------------------------------------
// The follow graph
// -----------------------------------------------------------------------------
// Deliberately lopsided. If everyone followed everyone, every candidate would
// be in-network and the out-of-network discount would never fire. Yewande and
// Marisol are followed by most people, Priya by very few.

export const FOLLOWS: Record<string, string[]> = {
  marisolwrenches: ['sowsounds', 'karambakehouse', 'nikauonrock', 'yewandeshoots'],
  sowsounds: ['marisolwrenches', 'yewandeshoots', 'kenjikeepstime', 'olagtfs'],
  priyametallurgy: ['marisolwrenches', 'olagtfs', 'nikauonrock'],
  karambakehouse: ['marisolwrenches', 'olagtfs', 'sowsounds'],
  olagtfs: ['priyametallurgy', 'karambakehouse', 'yewandeshoots'],
  nikauonrock: ['marisolwrenches', 'priyametallurgy', 'yewandeshoots'],
  kenjikeepstime: ['sowsounds', 'yewandeshoots', 'marisolwrenches'],
  yewandeshoots: ['sowsounds', 'kenjikeepstime', 'nikauonrock', 'olagtfs'],
};

// -----------------------------------------------------------------------------
// Negative engagement, written by hand
// -----------------------------------------------------------------------------
// Everything else is generated, but these are chosen, because they are the
// reason the negative weights in weights.ts have anything to act on. Turn
// `not_interested` from -74 down to 0 in the tuner and these two posts should
// visibly climb back up the feed.
//
// Marisol's account is left free of mutes and blocks on purpose: it is the
// account most people will sign in as first, and a muted author would vanish
// from her feed with no explanation on screen for why.

export const NEGATIVES: DemoNegative[] = [
  { key: 'golden-hour', action: 'not_interested', handles: ['priyametallurgy', 'olagtfs', 'karambakehouse'] },
  { key: 'golden-hour', action: 'video_skip_early', handles: ['priyametallurgy', 'olagtfs', 'kenjikeepstime', 'marisolwrenches'] },
  { key: 'golden-hour', action: 'mute_author', handles: ['karambakehouse'] },
  { key: 'brazing', action: 'not_interested', handles: ['kenjikeepstime', 'yewandeshoots'] },
  { key: 'brazing', action: 'report', handles: ['olagtfs'] },
  { key: 'brazing', action: 'block_author', handles: ['yewandeshoots'] },
];

// -----------------------------------------------------------------------------
// A small deterministic random number generator
// -----------------------------------------------------------------------------
// Math.random() would give a different feed on every run, which makes it hard
// to tell whether the feed changed because you moved a weight or because the
// seed data moved under you. This is mulberry32: same seed, same sequence,
// every time.

export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

/** An ISO timestamp for "this many hours before now". */

// Step 6: engagement
// -----------------------------------------------------------------------------
// This is the part the ranker actually eats.
//
// Three rules shape it, and all three matter for the feed to look real:
//
//  1. Attention is uneven. Each post gets a `heat` multiplier, so a few posts
//     collect most of the likes and the rest collect a handful. A feed where
//     every post has eleven likes teaches you nothing.
//  2. Engagement follows the follow graph. If you follow someone you are much
//     more likely to like their post, which is what gives in-network posts
//     their natural advantage before any weight is applied.
//  3. Actions come in bundles. Reposting without liking happens, but liking
//     first is far more common, so reposts and bookmarks are rolled only for
//     people who already liked the post.
//
// The unique index from 0001 means the same person cannot like the same post
// twice, so every toggle action is checked against `seen` before being added.
// share, profile_click, video_watch_complete and video_skip_early are exempt
// from that index and are allowed to repeat, which is why the generator can
// roll them more than once for the same pair.

export const TOGGLE_ACTIONS = new Set<ActionName>([
  'like',
  'repost',
  'bookmark',
  'not_interested',
  'mute_author',
  'block_author',
  'report',
  'follow_author',
]);

/**
 * Builds the whole engagement log from the follow graph and a fixed random
 * seed, in terms of whatever ids the caller hands over.
 *
 * `nowMs` is injected rather than read from the clock so that the demo store
 * and the seed script can both anchor "N hours ago" to the same instant, and
 * so a test can pin it.
 */
export function buildEngagementRows(
  idByHandle: Map<string, string>,
  idByKey: Map<string, string>,
  nowMs: number = Date.now(),
): DemoEngagementRow[] {
  const random = makeRandom(20260817);
  const rows: DemoEngagementRow[] = [];
  const seen = new Set();
  /** Follow pairs already credited to a post, so nobody follows twice. */
  const followedFrom = new Set();

  const hoursAgoIso = (hours: number): string =>
    new Date(nowMs - hours * 3_600_000).toISOString();

  function add(
    handle: string,
    postId: string | undefined,
    action: ActionName,
    hoursAgo: number,
  ): boolean {
    const userId = idByHandle.get(handle);
    if (!userId || !postId) return false;

    const fingerprint = `${userId}:${postId}:${action}`;
    if (TOGGLE_ACTIONS.has(action) && seen.has(fingerprint)) return false;
    seen.add(fingerprint);

    rows.push({
      user_id: userId,
      post_id: postId,
      action,
      created_at: hoursAgoIso(Math.max(0.1, hoursAgo)),
    });
    return true;
  }

  // Every reply that exists as a post also counts as a reply engagement on its
  // parent. Without this the reply count under a post would always read zero.
  for (const reply of REPLIES) {
    add(reply.handle, idByKey.get(reply.parent), 'reply', reply.hoursAgo);
  }

  // The hand-picked negatives, added before the generated positives so a
  // trimmed run can never lose them.
  for (const entry of NEGATIVES) {
    const post = POSTS.find((p) => p.key === entry.key);
    const postId = idByKey.get(entry.key);
    for (const handle of entry.handles) {
      add(handle, postId, entry.action, Math.max(0.5, (post?.hoursAgo ?? 12) - 1));
    }
  }

  // Now the generated positives, post by post.
  for (const post of POSTS) {
    const postId = idByKey.get(post.key);
    // Heat between about 0.35 and 1.15. Two or three posts per run land near
    // the top of that range and become the obviously popular ones.
    const heat = 0.35 + random() * 0.8;
    const isVideo = post.mediaType === 'video';

    for (const account of ACCOUNTS) {
      if (account.handle === post.handle) continue; // nobody likes their own post

      const follows = (FOLLOWS[account.handle] ?? []).includes(post.handle);
      const affinity = follows ? 1.45 : 0.75;
      // Engagement lands somewhere between the post going up and now.
      const when = post.hoursAgo * random();

      const liked = random() < 0.55 * heat * affinity;
      if (liked) {
        add(account.handle, postId, 'like', when);
        if (random() < 0.24) add(account.handle, postId, 'repost', when);
        if (random() < 0.22) add(account.handle, postId, 'bookmark', when);
        if (random() < 0.18) add(account.handle, postId, 'share', when);
      }

      if (random() < 0.24 * heat * affinity) {
        add(account.handle, postId, 'profile_click', when);
      }

      if (isVideo) {
        // Video completions repeat legitimately, so a keen viewer can watch a
        // clip through more than once.
        if (random() < 0.5 * heat * affinity) {
          add(account.handle, postId, 'video_watch_complete', when);
        }
        if (random() < 0.22 * heat) {
          add(account.handle, postId, 'video_watch_complete', when * 0.6);
        }
        if (random() < 0.16) {
          add(account.handle, postId, 'video_skip_early', when);
        }
      }

      // Following someone from a post is the strongest positive signal in the
      // weights file, so it should be rare and it should agree with the follow
      // graph above. These rows say "this is the post that won them over", so
      // they are only written for pairs that really do follow, and only once
      // per pair no matter how many of that author's posts they saw.
      const pair = `${account.handle}->${post.handle}`;
      if (follows && !followedFrom.has(pair) && random() < 0.16 * heat) {
        followedFrom.add(pair);
        add(account.handle, postId, 'follow_author', when);
      }
    }
  }

  return rows;
}
