import LiveBoard from "./live-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Live now — Garbanzo" };

export default function LivePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            <span className="mr-2 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-0.5 align-middle text-[10px] font-bold tracking-wider text-white">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
              LIVE
            </span>
            Happening right now
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Live posts stream updates to everyone in real time. Start one from the
            feed with the “Go live” toggle.
          </p>
        </div>
      </div>
      <LiveBoard />
    </div>
  );
}
