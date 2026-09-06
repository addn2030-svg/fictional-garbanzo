import { store } from "./store";
import { publishPost } from "./publishers";
import type { PlatformId } from "./types";

const BOTS = [
  { author: "Sara K.", handle: "@sarak", avatar: "🦊", color: "bg-orange-500" },
  { author: "Omar T.", handle: "@omart", avatar: "🐙", color: "bg-indigo-500" },
  { author: "Lena M.", handle: "@lenam", avatar: "🦋", color: "bg-pink-500" },
  { author: "Faisal A.", handle: "@faisla", avatar: "🐺", color: "bg-sky-500" },
  { author: "Nadia R.", handle: "@nadiar", avatar: "🐝", color: "bg-amber-500" },
  { author: "Diego P.", handle: "@diegop", avatar: "🐢", color: "bg-emerald-500" },
];

const POSTS = [
  "Shipped the fix before lunch. Best feeling in the world 🚀",
  "Hot take: most meetings should be a written document instead.",
  "Testing the new live composer from my phone — this is wild.",
  "Reminder: water the plants, stretch your back, and close that 3rd coffee tab.",
  "We crossed 10k community members this week. Thank you all 🙏",
  "New feature Friday! You'll know it when you see it 👀",
  "Reading 20 pages of a book counts. Small steps, daily.",
  "The office dog has unionized the snack cupboard. Morale is at record highs.",
  "Big shoutout to our support team for closing the backlog in 48h flat.",
  "Working from the beach today. Signal is spotty, ideas are not.",
];

const LIVE_EVENTS = [
  "LIVE: City marathon finish line — following the last 20 runners 🏃",
  "LIVE: Studio open day — behind the scenes all afternoon",
  "LIVE: Growth marketing Q&A — drop your questions in the updates",
  "LIVE: Hackathon kickoff — 48 hours, one board, zero sleep",
  "LIVE: Album release party — first single dropping in 10 minutes 🎧",
];

const LIVE_UPDATES = [
  "Crowd is buzzing — 500+ strong in the room 🎉",
  "Quick poll: dark mode or light mode? The chat is split 50/50.",
  "Demo running now — watch the live feed update in real time.",
  "Milestone just hit: 50k impressions across all connected platforms.",
  "Taking questions now — the best one wins a merch pack 📦",
  "Break time: the team is having cake. It's a professional decision.",
  "Big thank-you to everyone watching from the Eastern Province 🌙",
  "Next up: the surprise announcement everyone's been guessing all week.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function somePlatforms(): PlatformId[] {
  const all: PlatformId[] = ["twitter", "facebook", "instagram", "tiktok", "linkedin"];
  const n = 1 + Math.floor(Math.random() * 3);
  const out = new Set<PlatformId>();
  while (out.size < n) out.add(pick(all));
  return [...out];
}

function tick() {
  try {
    const posts = store.posts();
    if (posts.length === 0) return;
    const livePosts = posts.filter((p) => p.isLive);
    const r = Math.random();

    if (r < 0.26) {
      // a bot posts — then the publisher ships it to its platforms
      const bot = pick(BOTS);
      const post = store.addPost({
        ...bot,
        text: pick(POSTS),
        platforms: somePlatforms(),
        isLive: false,
      });
      publishPost(post, {});
    } else if (r < 0.48) {
      // engagement on a recent post
      const recent = posts.slice(0, 12);
      const p = pick(recent);
      store.like(p.id);
      if (Math.random() < 0.3) store.like(p.id);
    } else if (r < 0.68 && livePosts.length > 0) {
      // viewer drift on a live post
      const p = pick(livePosts);
      store.tickViewers(p.id, Math.floor(Math.random() * 11) - 3);
    } else if (r < 0.8 && livePosts.length > 0) {
      // a live blog update
      const p = pick(livePosts);
      store.addLiveUpdate(p.id, pick(LIVE_UPDATES));
    } else if (r < 0.88) {
      // start a new live post (max 3 at once)
      if (livePosts.length < 3) {
        const bot = pick(BOTS);
        const post = store.addPost({
          ...bot,
          text: pick(LIVE_EVENTS),
          platforms: somePlatforms(),
          isLive: true,
        });
        publishPost(post, {});
      } else {
        store.driftPlatforms();
      }
    } else if (livePosts.length > 1) {
      // end an old live post
      const oldest = [...livePosts].sort((a, b) => (a.liveStartedAt ?? 0) - (b.liveStartedAt ?? 0))[0];
      if (Date.now() - (oldest.liveStartedAt ?? 0) > 100_000) {
        store.endLive(oldest.id);
      } else {
        store.driftPlatforms();
      }
    } else {
      store.driftPlatforms();
    }
  } catch {
    /* keep the interval alive no matter what */
  }
}

const g = globalThis as unknown as { __garbanzoSim?: boolean };

export function startSimulator() {
  if (g.__garbanzoSim) return;
  g.__garbanzoSim = true;
  // initial activity shortly after boot, then a steady rhythm
  setTimeout(tick, 4000);
  setInterval(tick, 7000);
}
