"use client";

import Link from "next/link";
import type { Post } from "@/lib/types";
import { compact, elapsed, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { LiveBadge } from "./badges";
import { DeliveryChips } from "./DeliveryChips";
import { useFeed } from "./FeedProvider";

export default function PostCard({ post }: { post: Post }) {
  const { like } = useFeed();
  const now = useNow(15_000);
  const latestUpdates = post.updates.slice(-3);

  return (
    <article className="card post-in p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${post.color} text-xl`}
        >
          {post.avatar}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{post.author}</span>
            <span className="truncate text-xs text-neutral-500">{post.handle}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{timeAgo(post.at, now)}</span>
            <span className="text-neutral-700">·</span>
            {post.isLive && (
              <span className="font-semibold text-red-400">
                live for {elapsed(post.liveStartedAt, now)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {post.isLive ? (
            <Link href="/live">
              <LiveBadge />
            </Link>
          ) : post.liveEndedAt ? (
            <Link href="/live">
              <LiveBadge ended />
            </Link>
          ) : null}
          <DeliveryChips platforms={post.platforms} delivery={post.delivery} />
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-200">
        {post.text}
      </p>

      {post.updates.length > 0 && (
        <div
          className={[
            "mt-3 rounded-xl border p-3",
            post.isLive ? "border-red-500/25 bg-red-500/[0.04]" : "border-white/10 bg-white/[0.03]",
          ].join(" ")}
        >
          <div className="mb-2 flex items-center justify-between text-xs">
            <span
              className={[
                "font-semibold",
                post.isLive ? "text-red-400" : "text-neutral-400",
              ].join(" ")}
            >
              {post.isLive
                ? `● ${post.updates.length} live update${post.updates.length === 1 ? "" : "s"}`
                : `Live ended — ${post.updates.length} update${post.updates.length === 1 ? "" : "s"}${post.peakViewers ? ` · peak ${compact(post.peakViewers)} viewers` : ""}`}
            </span>
            <Link href="/live" className="text-neutral-500 transition-colors hover:text-white">
              Watch on Live →
            </Link>
          </div>
          <ul className="space-y-1.5">
            {latestUpdates.map((u) => (
              <li key={u.id} className="flex gap-2 text-[13px] leading-snug text-neutral-300">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400/80" />
                <span className="min-w-0">
                  {u.text}{" "}
                  <span className="whitespace-nowrap text-xs text-neutral-600">
                    · {timeAgo(u.at, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center gap-5 text-sm text-neutral-500">
        <button
          type="button"
          onClick={() => like(post.id)}
          className="group inline-flex items-center gap-1.5 transition-colors hover:text-pink-400"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px] transition-transform group-hover:scale-110"
            fill="currentColor"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          <span className="tabular-nums">{compact(post.likes)}</span>
        </button>
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
          <span className="tabular-nums">{compact(post.comments)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
            <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" />
          </svg>
          <span className="tabular-nums">{compact(post.reposts)}</span>
        </span>
        {post.isLive && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-red-400">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" />
            </svg>
            <span className="tabular-nums">{compact(post.viewers)} watching</span>
          </span>
        )}
      </div>
    </article>
  );
}
