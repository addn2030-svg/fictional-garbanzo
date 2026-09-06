"use client";

import { useFeed } from "@/components/FeedProvider";
import { PLATFORMS } from "@/lib/platforms";
import { compact } from "@/lib/format";

export default function PlatformsBoard() {
  const { platforms, setPlatformConnected } = useFeed();
  const connected = platforms.filter((p) => p.connected);
  const totalReach = connected.reduce((s, p) => s + p.reach, 0);
  const totalFollowers = connected.reduce((s, p) => s + p.followers, 0);
  const totalPosts = connected.reduce((s, p) => s + p.posts, 0);

  return (
    <>
      <div className="card grid grid-cols-3 divide-x divide-white/5">
        <Stat label="Connected" value={`${connected.length} / ${platforms.length}`} />
        <Stat label="Total reach" value={compact(totalReach)} />
        <Stat label="Posts published" value={compact(totalPosts)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {platforms.map((p) => {
          const meta = PLATFORMS[p.id];
          return (
            <div
              key={p.id}
              className={[
                "card flex items-center gap-4 p-4 transition-opacity",
                !p.connected ? "opacity-70" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-bold shadow",
                  meta.badge,
                ].join(" ")}
              >
                {meta.mark}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-white">
                    {meta.name}
                  </h2>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      p.connected
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-white/5 text-neutral-500",
                    ].join(" ")}
                  >
                    {p.connected ? "CONNECTED" : "OFFLINE"}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-neutral-500">{meta.blurb}</p>
                {p.connected && (
                  <div className="mt-2 flex gap-4 text-xs tabular-nums text-neutral-400">
                    <span>
                      <strong className="text-neutral-200">{compact(p.followers)}</strong>{" "}
                      followers
                    </span>
                    <span>
                      <strong className="text-neutral-200">{compact(p.reach)}</strong>{" "}
                      reach
                    </span>
                    <span>
                      <strong className="text-neutral-200">{compact(p.posts)}</strong>{" "}
                      posts
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPlatformConnected(p.id, !p.connected)}
                className={[
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  p.connected
                    ? "border border-white/15 text-neutral-400 hover:border-red-500/50 hover:text-red-400"
                    : "bg-lime-400 text-neutral-950 hover:bg-lime-300",
                ].join(" ")}
              >
                {p.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-neutral-600">
        Demo note: connections and audience numbers are simulated so you can feel
        the live data flow. To go real, drop your API credentials into{" "}
        <code className="rounded bg-white/5 px-1 py-0.5 text-neutral-400">
          lib/platforms.ts
        </code>{" "}
        and wire the publisher in{" "}
        <code className="rounded bg-white/5 px-1 py-0.5 text-neutral-400">
          lib/store.ts
        </code>
        .
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-lg font-bold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
    </div>
  );
}
