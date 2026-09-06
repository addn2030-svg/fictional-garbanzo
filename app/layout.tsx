import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { FeedProvider } from "@/components/FeedProvider";
import Header from "@/components/Header";
import { store } from "@/lib/store";
import { PLATFORM_IDS } from "@/lib/platforms";
import type { PlatformState, Post } from "@/lib/types";

export const metadata: Metadata = {
  title: "Garbanzo — post once, go live everywhere",
  description:
    "A multi-platform social hub with a real-time feed and live posts that keep updating in real time.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // hydrate the client with server state so the first paint is accurate
  const posts: Post[] = store.posts();
  const plat = store.platforms();
  const platforms: PlatformState[] = PLATFORM_IDS.map((id) => plat[id]);

  return (
    <html lang="en">
      <body>
        <FeedProvider initialPosts={posts} initialPlatforms={platforms}>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-neutral-600">
            Garbanzo · demo environment — platform connections are simulated,
            every update is streamed to you in real time.
          </footer>
        </FeedProvider>
      </body>
    </html>
  );
}
