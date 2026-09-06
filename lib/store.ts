import fs from "fs";
import path from "path";
import type {
  FeedEvent,
  PlatformId,
  PlatformState,
  Post,
} from "./types";
import { PLATFORM_IDS } from "./platforms";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "garbanzo.json");

type Listener = (e: FeedEvent) => void;

function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function emptyPlatforms(): Record<PlatformId, PlatformState> {
  const out = {} as Record<PlatformId, PlatformState>;
  for (const id of PLATFORM_IDS) {
    out[id] = { id, connected: false, followers: 0, reach: 0, posts: 0 };
  }
  return out;
}

export interface AddPostInput {
  author: string;
  handle: string;
  avatar: string;
  color: string;
  text: string;
  platforms: PlatformId[];
  isLive: boolean;
}

function makeStore() {
  let state: {
    posts: Post[];
    platforms: Record<PlatformId, PlatformState>;
  } = { posts: [], platforms: emptyPlatforms() };
  let loaded = false;
  const listeners = new Set<Listener>();

  function load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        const posts = (Array.isArray(raw.posts) ? raw.posts : []).map((p: Post) => ({
          ...p,
          platforms: Array.isArray(p.platforms) ? p.platforms : [],
          updates: Array.isArray(p.updates) ? p.updates : [],
          delivery: p.delivery ?? {},
        }));
        state = {
          posts,
          platforms: { ...emptyPlatforms(), ...(raw.platforms ?? {}) },
        };
      }
    } catch {
      /* corrupted file — start fresh */
    }
    loaded = true;
  }

  function persist() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch {
      /* ignore write failures */
    }
  }

  function emit(e: FeedEvent) {
    for (const l of [...listeners]) {
      try {
        l(e);
      } catch {
        /* never let a listener kill the store */
      }
    }
  }

  function ensureLoaded() {
    if (!loaded) {
      load();
      if (state.posts.length === 0) seed();
    }
  }

  function snapshot(post: Post): Post {
    return { ...post, platforms: [...post.platforms], updates: post.updates.map((u) => ({ ...u })) };
  }

  function findPost(id: string): Post | undefined {
    return state.posts.find((p) => p.id === id);
  }

  function seed() {
    const now = Date.now();
    const min = 60_000;
    const mk = (
      partial: Partial<Post> & { author: string; handle: string; avatar: string; color: string; text: string; platforms: PlatformId[]; at: number }
    ): Post => ({
      id: uid(),
      likes: 0,
      comments: 0,
      reposts: 0,
      isLive: false,
      delivery: {},
      liveStartedAt: null,
      liveEndedAt: null,
      viewers: 0,
      peakViewers: 0,
      updates: [],
      ...partial,
    });

    const livePost = mk({
      author: "Garbanzo Team",
      handle: "@garbanzo",
      avatar: "🫘",
      color: "bg-lime-500",
      text: " We are LIVE — the Garbanzo 2.0 launch event! Updates, demos and surprises rolling in as they happen.",
      platforms: ["twitter", "facebook", "instagram"],
      at: now - 26 * min,
      likes: 128,
      comments: 42,
      reposts: 31,
      isLive: true,
      liveStartedAt: now - 26 * min,
      viewers: 84,
      peakViewers: 96,
      updates: [
        { id: uid(), text: "Doors open — 200+ people in the room and 3x more watching online 🎉", at: now - 20 * min },
        { id: uid(), text: "Demo #1: the new multi-platform composer. One post, five networks.", at: now - 12 * min },
        { id: uid(), text: "Announcement: live viewer counts ship to all plans this month.", at: now - 4 * min },
      ],
    });

    const seeds: Post[] = [
      livePost,
      mk({
        author: "Sara K.",
        handle: "@sarak",
        avatar: "🦊",
        color: "bg-orange-500",
        text: "Just wrapped the Q3 design review — the new onboarding flow is 40% faster. Team did incredible work 🎉",
        platforms: ["twitter", "linkedin"],
        at: now - 14 * min,
        likes: 64,
        comments: 9,
        reposts: 12,
      }),
      mk({
        author: "Omar T.",
        handle: "@omart",
        avatar: "🐙",
        color: "bg-indigo-500",
        text: "PSA: you don't need 12 browser tabs to plan a launch. You need one good checklist.",
        platforms: ["facebook", "twitter"],
        at: now - 47 * min,
        likes: 210,
        comments: 33,
        reposts: 45,
      }),
      mk({
        author: "Lena M.",
        handle: "@lenam",
        avatar: "🦋",
        color: "bg-pink-500",
        text: "Golden hour from the rooftop studio ☀️ New lookbook drops Friday — you'll love it.",
        platforms: ["instagram", "tiktok"],
        at: now - 63 * min,
        likes: 342,
        comments: 27,
        reposts: 18,
      }),
      mk({
        author: "Faisal A.",
        handle: "@faisla",
        avatar: "🐺",
        color: "bg-sky-500",
        text: "Hiring: senior platform engineer, remote-friendly, flexible hours. If you love building realtime systems, DM me.",
        platforms: ["linkedin", "twitter"],
        at: now - 95 * min,
        likes: 88,
        comments: 14,
        reposts: 21,
      }),
      mk({
        author: "Nadia R.",
        handle: "@nadiar",
        avatar: "🐝",
        color: "bg-amber-500",
        text: "The best growth hack? Answering your own support tickets for one week straight. I was wrong about so many things.",
        platforms: ["twitter", "facebook", "linkedin"],
        at: now - 2 * 60 * min,
        likes: 512,
        comments: 61,
        reposts: 97,
      }),
      mk({
        author: "Diego P.",
        handle: "@diegop",
        avatar: "🐢",
        color: "bg-emerald-500",
        text: "Day 3 of the developer conference and my note app is officially full of ideas I can't keep up with 💡",
        platforms: ["twitter"],
        at: now - 3 * 60 * min,
        likes: 45,
        comments: 6,
        reposts: 4,
      }),
    ];

    state.posts = seeds;
    // seeded posts already "published" to their platforms (demo history)
    for (const s of seeds) {
      for (const p of s.platforms) {
        s.delivery[p] = { status: "published", at: s.at, simulated: true };
      }
    }

    const plat = emptyPlatforms();
    plat.twitter = { id: "twitter", connected: true, followers: 12840, reach: 154_000, posts: 214 };
    plat.facebook = { id: "facebook", connected: true, followers: 8620, reach: 92_000, posts: 87 };
    plat.instagram = { id: "instagram", connected: true, followers: 21470, reach: 203_000, posts: 164 };
    plat.tiktok = { id: "tiktok", connected: true, followers: 33210, reach: 480_000, posts: 58 };
    plat.linkedin = { id: "linkedin", connected: false, followers: 0, reach: 0, posts: 0 };
    state.platforms = plat;

    for (const s of seeds) {
      for (const p of s.platforms) state.platforms[p].posts += 1;
    }
    persist();
  }

  const api = {
    ensureLoaded,

    posts(): Post[] {
      ensureLoaded();
      return [...state.posts].sort((a, b) => b.at - a.at);
    },

    platforms(): Record<PlatformId, PlatformState> {
      ensureLoaded();
      return state.platforms;
    },

    addPost(input: AddPostInput): Post {
      ensureLoaded();
      const now = Date.now();
      const post: Post = {
        id: uid(),
      author: input.author,
      handle: input.handle,
      avatar: input.avatar,
      color: input.color,
      text: input.text,
      platforms: input.platforms,
      at: now,
      likes: 0,
      comments: 0,
      reposts: 0,
      isLive: input.isLive,
      delivery: Object.fromEntries(input.platforms.map((p) => [p, { status: "queued" as const }])),
      liveStartedAt: input.isLive ? now : null,
        liveEndedAt: null,
        viewers: input.isLive ? 1 : 0,
        peakViewers: input.isLive ? 1 : 0,
        updates: input.isLive ? [{ id: uid(), text: input.text, at: now }] : [],
      };
      state.posts = [post, ...state.posts];
      for (const p of post.platforms) state.platforms[p].posts += 1;
      persist();
      emit({ type: post.isLive ? "live:started" : "post:new", post: snapshot(post), ts: now });
      return post;
    },

    like(id: string): Post | null {
      ensureLoaded();
      const post = findPost(id);
      if (!post) return null;
      post.likes += 1;
      if (Math.random() < 0.35) post.comments += 1;
      persist();
      emit({ type: "post:stats", post: snapshot(post), ts: Date.now() });
      return post;
    },

    /** Update the per-platform delivery state and broadcast it. */
    setDelivery(
      id: string,
      platform: PlatformId,
      patch: Partial<import("./types").Delivery>
    ): Post | null {
      ensureLoaded();
      const post = findPost(id);
      if (!post) return null;
      post.delivery = post.delivery ?? {};
      post.delivery[platform] = { ...(post.delivery[platform] ?? { status: "queued" }), ...patch };
      persist();
      emit({ type: "post:delivery", post: snapshot(post), ts: Date.now() });
      return post;
    },

    addLiveUpdate(id: string, text: string): Post | null {
      ensureLoaded();
      const post = findPost(id);
      if (!post || !post.isLive) return null;
      const trimmed = text.trim();
      if (!trimmed) return null;
      post.updates.push({ id: uid(), text: trimmed, at: Date.now() });
      post.viewers = Math.max(1, post.viewers + Math.floor(Math.random() * 4));
      post.peakViewers = Math.max(post.peakViewers, post.viewers);
      persist();
      emit({ type: "post:live-update", post: snapshot(post), ts: Date.now() });
      return post;
    },

    endLive(id: string): Post | null {
      ensureLoaded();
      const post = findPost(id);
      if (!post || !post.isLive) return null;
      post.isLive = false;
      post.liveEndedAt = Date.now();
      post.viewers = 0;
      persist();
      emit({ type: "live:ended", post: snapshot(post), ts: Date.now() });
      return post;
    },

    tickViewers(id: string, delta: number): Post | null {
      ensureLoaded();
      const post = findPost(id);
      if (!post || !post.isLive) return null;
      post.viewers = Math.max(0, post.viewers + delta);
      post.peakViewers = Math.max(post.peakViewers, post.viewers);
      persist();
      emit({ type: "live:viewers", post: snapshot(post), ts: Date.now() });
      return post;
    },

    setPlatformConnected(id: PlatformId, connected: boolean): PlatformState | null {
      ensureLoaded();
      const p = state.platforms[id];
      if (!p) return null;
      p.connected = connected;
      if (connected && p.followers === 0) {
        p.followers = 1000 + Math.floor(Math.random() * 20_000);
        p.reach = p.followers * (4 + Math.floor(Math.random() * 8));
      }
      if (!connected) {
        p.reach = Math.floor(p.reach * 0.5);
      }
      persist();
      emit({ type: "platform:change", platform: { ...p }, ts: Date.now() });
      return p;
    },

    /** Used by the simulator: nudge reach/followers so numbers feel alive. */
    driftPlatforms() {
      ensureLoaded();
      let changed = false;
      for (const id of PLATFORM_IDS) {
        const p = state.platforms[id];
        if (!p.connected) continue;
        p.followers += Math.floor(Math.random() * 7);
        p.reach += Math.floor(Math.random() * 220);
        changed = true;
      }
      if (changed) persist();
    },

    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };

  return api;
}

const g = globalThis as unknown as { __garbanzoStore?: ReturnType<typeof makeStore> };
export const store: ReturnType<typeof makeStore> =
  g.__garbanzoStore ?? (g.__garbanzoStore = makeStore());
