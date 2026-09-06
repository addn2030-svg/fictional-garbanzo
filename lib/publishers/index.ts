import { store } from "../store";
import type { Delivery, PlatformId, Post } from "../types";
import { publishInstagram } from "./instagram";
import { publishLinkedin } from "./linkedin";
import { publishX } from "./x";
import { publishBuffer } from "./buffer";

export interface PublishCtx {
  /** public base URL of this app, e.g. https://3000-xxx.e2b.app (for IG image_url) */
  publicBase?: string;
}

type Handler = (post: Post, ctx: PublishCtx) => Promise<Partial<Delivery>>;

/**
 * Direct platform adapters. Each is a full implementation: real API calls
 * when credentials are present, demo simulation otherwise.
 * Facebook and TikTok are still queued for their own adapters.
 */
const DIRECT: Partial<Record<PlatformId, Handler>> = {
  instagram: publishInstagram,
  linkedin: publishLinkedin,
  twitter: publishX,
};

/** Networks Buffer can carry (one key, many channels). */
const BUFFER_SUPPORTED: PlatformId[] = [
  "instagram",
  "twitter",
  "facebook",
  "linkedin",
  "tiktok",
];

/**
 * Route selection per platform:
 *   PUBLISH_VIA_<PLATFORM>=buffer   → publish through your Buffer account
 *   (default: direct)               → publish with the platform's own API
 */
export function routeFor(platform: PlatformId): "direct" | "buffer" {
  const via = (
    process.env[`PUBLISH_VIA_${platform.toUpperCase()}`] || "direct"
  ).toLowerCase();
  return via === "buffer" && BUFFER_SUPPORTED.includes(platform)
    ? "buffer"
    : "direct";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The bot→platforms leg of the pipeline.
 *
 * Runs per platform, staggered so the delivery chips visibly progress
 * queued → publishing → published/failed on every connected browser:
 *
 *   POST /api/posts → store.addPost (delivery: queued) ─
 *                                                        │ SSE post:new
 *   publishPost() ── for each platform:                  │
 *     route: direct (platform API) or buffer (one key)   │
 *     setDelivery(publishing) ───────────────────────────┤ SSE post:delivery
 *     adapter runs the real call                         │
 *     setDelivery(published | failed) ───────────────────┘ SSE post:delivery
 */
export function publishPost(post: Post, ctx: PublishCtx): void {
  void (async () => {
    await sleep(400); // let post:new land first
    for (const platform of post.platforms) {
      const route = routeFor(platform);
      const handler =
        route === "buffer" ? publishBuffer : DIRECT[platform];
      if (!handler) {
        // no adapter yet — flag it instead of sitting in "queued" forever
        store.setDelivery(post.id, platform, {
          status: "failed",
          at: Date.now(),
          via: route,
          error:
            route === "buffer"
              ? "Buffer has no channel for this platform"
              : "Adapter in development — route it via Buffer (PUBLISH_VIA_*=buffer)",
        });
        continue;
      }
      store.setDelivery(post.id, platform, {
        status: "publishing",
        via: route,
      });
      await sleep(300 + Math.random() * 600); // stagger platform calls
      try {
        const d = await handler(post, ctx);
        store.setDelivery(post.id, platform, {
          status: "published",
          at: Date.now(),
          via: route,
          externalId: d.externalId,
          mediaUrl: d.mediaUrl,
          simulated: d.simulated,
        });
      } catch (e) {
        store.setDelivery(post.id, platform, {
          status: "failed",
          at: Date.now(),
          via: route,
          error: (e as Error).message,
        });
      }
    }
  })();
}
