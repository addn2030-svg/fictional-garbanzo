"use client";

import { useState } from "react";
import type { Post } from "@/lib/types";
import { compact, elapsed, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { LiveBadge } from "./badges";
import { DeliveryChips } from "./DeliveryChips";
import { useFeed } from "./FeedProvider";

export default function LiveCard({ post }: { post: Post }) {
  const { addLiveUpdate, endLive } = useFeed();
  const now = useNow(1000);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [endedConfirm, setEndedConfirm] = useState(false);

  const updates = [...post.updates].sort((a, b) => b.at - a.at);

  const submitUpdate = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const ok = await addLiveUpdate(post.id, text);
    setBusy(false);
    if (ok) setDraft("");
  };

  const handleEnd = async () => {
    if (!endedConfirm) {
      setEndedConfirm(true);
      setTimeout(() => setEndedConfirm(false), 3000);
      return;
    }
    await endLive(post.id);
    setEndedConfirm(false);
  };

  return (
    <div
      className={[
        "card overflow-hidden",
        post.isLive ? "ring-1 ring-red-500/30" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-3">
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
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            {post.isLive ? (
              <span className="font-semibold tabular-nums text-red-400">
                LIVE · {elapsed(post.liveStartedAt, now)}
              </span>
            ) : (
              <span className="text-neutral-500">
                Ended {timeAgo(post.liveEndedAt ?? post.at, now)}
              </span>
            )}
            {post.isLive && (
              <span className="inline-flex items-center gap-1 text-neutral-400">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" />
                </svg>
                <span className="tabular-nums">{compact(post.viewers)} watching</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {post.isLive ? <LiveBadge /> : <LiveBadge ended />}
          <DeliveryChips platforms={post.platforms} delivery={post.delivery} />
        </div>
      </div>

      <div className="p-4">
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-200">
          {post.text}
        </p>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <span>
              Live updates ({post.updates.length})
            </span>
            {post.peakViewers > 0 && (
              <span className="font-normal normal-case tracking-normal">
                peak {compact(post.peakViewers)} viewers
              </span>
            )}
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {updates.length === 0 && (
              <li className="text-sm text-neutral-600">No updates yet.</li>
            )}
            {updates.map((u, i) => (
              <li
                key={u.id}
                className={[
                  "flex gap-2.5 rounded-lg border px-3 py-2 text-sm leading-snug",
                  i === 0 && post.isLive
                    ? "post-in border-red-500/25 bg-red-500/[0.06] text-neutral-100"
                    : "border-white/5 bg-white/[0.02] text-neutral-400",
                ].join(" ")}
              >
                <span
                  className={[
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    i === 0 && post.isLive ? "live-dot bg-red-500" : "bg-neutral-700",
                  ].join(" ")}
                />
                <span className="min-w-0 flex-1">
                  {u.text}
                  <span className="ml-2 whitespace-nowrap text-xs text-neutral-600">
                    {timeAgo(u.at, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {post.isLive && (
          <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-4">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitUpdate();
              }}
              placeholder="Add a live update…"
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitUpdate}
              disabled={!draft.trim() || busy}
              className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : "Update"}
            </button>
            <button
              type="button"
              onClick={handleEnd}
              className={[
                "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                endedConfirm
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-red-500/40 text-red-400 hover:bg-red-500/10",
              ].join(" ")}
            >
              {endedConfirm ? "Confirm end?" : "End live"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
