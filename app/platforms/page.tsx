import PlatformsBoard from "./platforms-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Platforms — Garbanzo" };

export default function PlatformsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Connected platforms</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Garbanzo fans out each post to every platform you pick. Connect or
          disconnect a network and watch your stats update live.
        </p>
      </div>
      <PlatformsBoard />
    </div>
  );
}
