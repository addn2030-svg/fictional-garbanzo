import ComposeBox from "@/components/ComposeBox";
import PostCard from "@/components/PostCard";
import Feed from "./feed-client";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <ComposeBox />
        <Feed />
      </div>

      <aside className="hidden space-y-4 lg:block">
        <TrendingPanel />
      </aside>
    </div>
  );
}

function TrendingPanel() {
  return (
    <div className="card p-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
        Why Garbanzo
      </h2>
      <ul className="mt-3 space-y-3 text-[13px] leading-snug text-neutral-400">
        <li className="flex gap-2">
          <span className="text-base">⚡</span>
          <span>
            <strong className="text-neutral-200">One composer, every platform.</strong>{" "}
            Pick where to publish and post once.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-base">🔴</span>
          <span>
            <strong className="text-neutral-200">Live posts.</strong> Keep a post
            live and append updates as events unfold — viewers follow along.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-base">📡</span>
          <span>
            <strong className="text-neutral-200">Real-time feed.</strong> Everything
            streams in as it happens — no refresh, ever.
          </span>
        </li>
      </ul>
    </div>
  );
}
