"use client";

import { useFeed } from "@/components/FeedProvider";
import LiveCard from "@/components/LiveCard";

export default function LiveBoard() {
  const { posts } = useFeed();
  const live = posts
    .filter((p) => p.isLive)
    .sort((a, b) => (b.liveStartedAt ?? 0) - (a.liveStartedAt ?? 0));
  const ended = posts
    .filter((p) => !p.isLive && p.liveEndedAt)
    .sort((a, b) => (b.liveEndedAt ?? 0) - (a.liveEndedAt ?? 0))
    .slice(0, 3);

  return (
    <>
      {live.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <span className="text-3xl">🎬</span>
          <p className="text-sm font-medium text-neutral-300">
            Nothing live at the moment
          </p>
          <p className="max-w-sm text-xs text-neutral-500">
            New live posts appear here the instant anyone goes live. Head to the
            feed and hit “Go live” on your next post.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {live.map((p) => (
            <LiveCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <div className="pt-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Recently ended
          </h2>
          <div className="space-y-4">
            {ended.map((p) => (
              <LiveCard key={p.id} post={p} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
