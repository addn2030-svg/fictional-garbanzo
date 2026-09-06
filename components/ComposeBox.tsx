"use client";

import { useMemo, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";
import { useFeed } from "./FeedProvider";

const MAX = 1000;

export default function ComposeBox() {
  const { platforms, createPost } = useFeed();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<PlatformId[]>([]);
  const [goLive, setGoLive] = useState(false);
  const [busy, setBusy] = useState(false);

  // default selection: everything currently connected
  const effective = useMemo(() => {
    const connected = new Set(platforms.filter((p) => p.connected).map((p) => p.id));
    if (selected.length > 0) return selected;
    return [...connected];
  }, [platforms, selected]);

  const toggle = (id: PlatformId) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const canPost = text.trim().length > 0 && effective.length > 0 && !busy;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    const post = await createPost(text, effective, goLive);
    setBusy(false);
    if (post) {
      setText("");
      setGoLive(false);
      setSelected([]);
    }
  };

  const remaining = MAX - text.length;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xl">
          🙂
        </span>
        <div className="min-w-0 flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={3}
            placeholder={
              goLive
                ? "What's happening live? Start your live post — you can keep adding updates…"
                : "What's happening? Post to every platform at once…"
            }
            className="w-full resize-none bg-transparent text-[15px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {platforms.map((p) => {
              const on = effective.includes(p.id);
              const meta = PLATFORMS[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  disabled={!p.connected}
                  title={
                    p.connected
                      ? `Post to ${meta.name}`
                      : `${meta.name} is not connected — connect it on the Platforms page`
                  }
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                    !p.connected
                      ? "cursor-not-allowed border-white/5 text-neutral-700"
                      : on
                        ? "border-transparent text-white shadow-md"
                        : "border-white/10 bg-white/5 text-neutral-400 hover:border-white/25",
                    on && meta.chip,
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[9px] font-bold",
                      p.connected ? meta.chip : "bg-neutral-800 text-neutral-600",
                    ].join(" ")}
                  >
                    {meta.mark}
                  </span>
                  {meta.name}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
            <button
              type="button"
              onClick={() => setGoLive((v) => !v)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                goLive
                  ? "border-red-500/50 bg-red-500/15 text-red-400"
                  : "border-white/10 bg-white/5 text-neutral-400 hover:border-white/25 hover:text-white",
              ].join(" ")}
            >
              <span
                className={[
                  "h-2 w-2 rounded-full",
                  goLive ? "live-dot bg-red-500" : "bg-neutral-600",
                ].join(" ")}
              />
              {goLive ? "Going live" : "Go live"}
              <span className="hidden font-normal text-neutral-500 sm:inline">
                · keeps updating in real time
              </span>
            </button>

            <div className="flex items-center gap-3">
              {text.length > 0 && (
                <span
                  className={[
                    "text-xs tabular-nums",
                    remaining < 0 ? "text-red-400" : remaining < 100 ? "text-amber-400" : "text-neutral-500",
                  ].join(" ")}
                >
                  {remaining}
                </span>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!canPost}
                className={[
                  "rounded-full px-5 py-2 text-sm font-bold transition-all",
                  goLive
                    ? "bg-red-500 text-white hover:bg-red-400"
                    : "bg-lime-400 text-neutral-950 hover:bg-lime-300",
                  !canPost && "cursor-not-allowed opacity-40",
                ].join(" ")}
              >
                {busy ? "Posting…" : goLive ? "Go Live" : `Post to ${effective.length} ${effective.length === 1 ? "platform" : "platforms"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
