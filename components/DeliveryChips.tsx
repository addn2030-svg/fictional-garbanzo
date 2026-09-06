"use client";

import { PLATFORMS } from "@/lib/platforms";
import type { Delivery, PlatformId } from "@/lib/types";

/**
 * Per-platform delivery chips. These are the live view of the
 * bot→platforms pipeline: queued → publishing → published/failed,
 * driven by `post:delivery` SSE events.
 */
export function DeliveryChips({
  platforms,
  delivery,
}: {
  platforms: PlatformId[];
  delivery?: Partial<Record<PlatformId, Delivery>>;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {platforms.map((id) => {
        const m = PLATFORMS[id];
        const d = delivery?.[id];
        const status = d?.status ?? "queued";
        const title = describe(m.name, status, d);
        const size = "h-4.5 min-w-4.5 px-0.5 text-[9px]";

        const inner = (
          <span
            title={title}
            className={[
              "inline-flex items-center justify-center gap-0.5 rounded-md font-bold select-none transition-all",
              size,
              status === "published"
                ? m.chip
                : status === "publishing"
                  ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40"
                  : status === "failed"
                    ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/50"
                    : "bg-neutral-800 text-neutral-500 ring-1 ring-white/10",
            ].join(" ")}
          >
            {status === "publishing" ? (
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" />
            ) : (
              m.mark
            )}
            {status === "published" && (
              <span className="text-[8px] leading-none">✓</span>
            )}
            {status === "failed" && <span className="text-[8px] leading-none">!</span>}
          </span>
        );

        // published Instagram cards link to the rendered image
        if (status === "published" && id === "instagram" && d?.mediaUrl) {
          return (
            <a
              key={id}
              href={d.mediaUrl}
              target="_blank"
              rel="noreferrer"
              title={`${title} — click to see the rendered card`}
            >
              {inner}
            </a>
          );
        }
        return <span key={id}>{inner}</span>;
      })}
    </span>
  );
}

function describe(
  name: string,
  status: string,
  d?: Delivery
): string {
  const via = d?.via === "buffer" ? " via Buffer" : "";
  switch (status) {
    case "publishing":
      return `Publishing to ${name}${via}…`;
    case "published":
      return d?.simulated
        ? `${name}${via} · published (demo mode — add API keys for real delivery)`
        : `${name}${via} · published${d?.externalId ? ` · ${d.externalId}` : ""}`;
    case "failed":
      return `${name}${via} · ${d?.error ?? "failed"}`;
    default:
      return `${name}${via} · queued`;
  }
}
