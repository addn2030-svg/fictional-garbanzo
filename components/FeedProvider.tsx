"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FeedEvent, PlatformId, PlatformState, Post } from "@/lib/types";
import { PLATFORM_IDS } from "@/lib/platforms";

interface FeedContextValue {
  posts: Post[];
  platforms: PlatformState[];
  connected: boolean;
  createPost: (text: string, platforms: PlatformId[], isLive: boolean) => Promise<Post | null>;
  like: (id: string) => void;
  addLiveUpdate: (id: string, text: string) => Promise<boolean>;
  endLive: (id: string) => Promise<boolean>;
  setPlatformConnected: (id: PlatformId, connect: boolean) => void;
}

const FeedContext = createContext<FeedContextValue | null>(null);

function emptyPlatforms(): Record<PlatformId, PlatformState> {
  const out = {} as Record<PlatformId, PlatformState>;
  for (const id of PLATFORM_IDS) {
    out[id] = { id, connected: false, followers: 0, reach: 0, posts: 0 };
  }
  return out;
}

interface FeedProviderProps {
  children: ReactNode;
  initialPosts?: Post[];
  initialPlatforms?: PlatformState[];
}

export function FeedProvider({
  children,
  initialPosts,
  initialPlatforms,
}: FeedProviderProps) {
  const [posts, setPosts] = useState<Post[]>(() => initialPosts ?? []);
  const [platforms, setPlatforms] = useState<Record<PlatformId, PlatformState>>(
    () => {
      const next = emptyPlatforms();
      if (initialPlatforms) {
        for (const s of initialPlatforms) next[s.id] = s;
      }
      return next;
    }
  );
  const [connected, setConnected] = useState(false);
  const booted = useRef(false);

  // initial snapshot (only when not server-hydrated, e.g. deep reloads)
  useEffect(() => {
    if (initialPosts && initialPosts.length > 0) {
      booted.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      const [p, pl] = await Promise.all([
        fetch("/api/posts").then((r) => r.json() as Promise<{ posts: Post[] }>),
        fetch("/api/platforms").then(
          (r) => r.json() as Promise<{ platforms: PlatformState[] }>
        ),
      ]);
      if (cancelled) return;
      setPosts(p.posts ?? []);
      const next = { ...emptyPlatforms() };
      for (const s of pl.platforms ?? []) next[s.id] = s;
      setPlatforms(next);
      booted.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime stream
  useEffect(() => {
    const es = new EventSource("/api/events");

    const upsert = (post: Post) =>
      setPosts((prev) => {
        const i = prev.findIndex((p) => p.id === post.id);
        if (i === -1) return [post, ...prev].slice(0, 120);
        const copy = [...prev];
        copy[i] = post;
        return copy;
      });

    const on = (type: string) => (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as FeedEvent & { posts?: Post[] };
        if (type === "hello" && Array.isArray(data.posts)) {
          setPosts(data.posts);
          return;
        }
        if (type === "platform:change" && data.platform) {
          setPlatforms((prev) => ({ ...prev, [data.platform!.id]: data.platform! }));
          return;
        }
        if (data.post) upsert(data.post);
      } catch {
        /* ignore malformed frames */
      }
    };

    const types = [
      "hello",
      "post:new",
      "post:stats",
      "post:delivery",
      "post:live-update",
      "live:started",
      "live:ended",
      "live:viewers",
      "platform:change",
    ];
    for (const t of types) es.addEventListener(t, on(t));

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource auto-reconnects

    return () => es.close();
  }, []);

  const createPost = useCallback(
    async (text: string, selected: PlatformId[], isLive: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || selected.length === 0) return null;
      const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const optimistic: Post = {
        id: tmpId,
        author: "You",
        handle: "@you",
        avatar: "🙂",
        color: "bg-violet-500",
        text: trimmed,
        platforms: selected,
        at: Date.now(),
        likes: 0,
        comments: 0,
        reposts: 0,
        isLive,
        delivery: Object.fromEntries(
          selected.map((p) => [p, { status: "queued" as const }])
        ),
        liveStartedAt: isLive ? Date.now() : null,
        liveEndedAt: null,
        viewers: isLive ? 1 : 0,
        peakViewers: isLive ? 1 : 0,
        updates: isLive ? [{ id: tmpId, text: trimmed, at: Date.now() }] : [],
      };
      setPosts((prev) => [optimistic, ...prev]);
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, platforms: selected, isLive }),
        });
        if (!res.ok) throw new Error("post failed");
        const data = (await res.json()) as { post: Post };
        setPosts((prev) => prev.map((p) => (p.id === tmpId ? data.post : p)));
        return data.post;
      } catch {
        setPosts((prev) => prev.filter((p) => p.id !== tmpId));
        return null;
      }
    },
    []
  );

  const like = useCallback((id: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, likes: p.likes + 1 } : p))
    );
    fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "like" }),
    }).catch(() => {});
  }, []);

  const addLiveUpdate = useCallback(async (id: string, text: string) => {
    const res = await fetch(`/api/posts/${id}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  }, []);

  const endLive = useCallback(async (id: string) => {
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "endLive" }),
    });
    return res.ok;
  }, []);

  const setPlatformConnected = useCallback((id: PlatformId, connect: boolean) => {
    setPlatforms((prev) => ({ ...prev, [id]: { ...prev[id], connected: connect } }));
    fetch("/api/platforms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, connect }),
    }).catch(() => {});
  }, []);

  const value: FeedContextValue = {
    posts,
    platforms: PLATFORM_IDS.map((id) => platforms[id]),
    connected,
    createPost,
    like,
    addLiveUpdate,
    endLive,
    setPlatformConnected,
  };

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside <FeedProvider>");
  return ctx;
}
