"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFeed } from "./FeedProvider";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/live", label: "Live" },
  { href: "/platforms", label: "Platforms" },
];

export default function Header() {
  const pathname = usePathname();
  const { connected, posts } = useFeed();
  const liveCount = posts.filter((p) => p.isLive).length;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-lime-400 text-lg">
            🫘
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            Garbanzo
            <span className="ml-2 hidden text-[10px] font-semibold uppercase tracking-widest text-lime-400 sm:inline">
              post once · go live everywhere
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-neutral-400 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {item.label}
                {item.href === "/live" && liveCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {liveCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className={[
            "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider md:flex",
            connected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-neutral-700 bg-neutral-900 text-neutral-500",
          ].join(" ")}
        >
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            )}
            <span
              className={[
                "relative inline-flex h-2 w-2 rounded-full",
                connected ? "bg-emerald-400" : "bg-neutral-600",
              ].join(" ")}
            />
          </span>
          {connected ? "REALTIME ON" : "RECONNECTING…"}
        </div>
      </div>
    </header>
  );
}
