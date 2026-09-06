"use client";

import { PLATFORMS } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";

export function PlatformChips({ ids, size = "sm" }: { ids: PlatformId[]; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ids.map((id) => {
        const m = PLATFORMS[id];
        return (
          <span
            key={id}
            title={m.name}
            className={[
              "inline-flex items-center justify-center rounded-md font-bold select-none",
              m.chip,
              size === "sm" ? "h-4.5 min-w-4.5 px-0.5 text-[9px]" : "h-6 min-w-6 px-1 text-[11px]",
            ].join(" ")}
          >
            {m.mark}
          </span>
        );
      })}
    </span>
  );
}

export function LiveBadge({ ended = false, small = false }: { ended?: boolean; small?: boolean }) {
  const base = small
    ? "px-1.5 py-0.5 text-[9px]"
    : "px-2 py-0.5 text-[10px]";
  if (ended) {
    return (
      <span
        className={[
          "inline-flex items-center gap-1 rounded-full bg-neutral-800 text-neutral-400 font-semibold tracking-wider",
          base,
        ].join(" ")}
      >
        <svg viewBox="0 0 8 8" className={small ? "h-1.5 w-1.5" : "h-2 w-2"} fill="currentColor">
          <rect x="1" y="1" width="6" height="6" rx="1" />
        </svg>
        REPLAY
      </span>
    );
  }
  return (
    <span
      className={[
        "live-badge inline-flex items-center gap-1 rounded-full bg-red-500 text-white font-bold tracking-wider",
        base,
      ].join(" ")}
    >
      <span className={small ? "h-1.5 w-1.5" : "h-2 w-2"}>
        <span className="live-dot block h-full w-full rounded-full bg-white" />
      </span>
      LIVE
    </span>
  );
}
