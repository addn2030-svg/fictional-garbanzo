"use client";

import { useFeed } from "@/components/FeedProvider";
import PostCard from "@/components/PostCard";

export default function Feed() {
  const { posts } = useFeed();

  if (posts.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <span className="text-3xl">🫘</span>
        <p className="text-sm font-medium text-neutral-300">
          Your live feed is warming up…
        </p>
        <p className="text-xs text-neutral-500">
          Posts from every connected platform stream in here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
