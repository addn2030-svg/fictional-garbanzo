import type { Delivery } from "../types";
import type { Post } from "../types";
import { renderCard } from "./card";
import type { PublishCtx } from "./index";

/**
 * Instagram via the Meta Graph API (Business/Creator accounts only).
 *
 * Flow:
 *   1. POST /{ig-user-id}/media        → creates a media container
 *      (text posts have no text-only API, so we render a branded 4:5 card)
 *   2. POST /{ig-user-id}/media_publish → publishes the container
 *
 * Needs env:
 *   INSTAGRAM_ACCESS_TOKEN   long-lived user token (instagram_content_publish,
 *                            instagram_basic via Facebook Login)
 *   INSTAGRAM_IG_USER_ID     the Instagram Business/Creator user id
 *   GRAPH_API_VERSION        optional, default v24.0
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function credentials() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_IG_USER_ID;
  return token && igUserId ? { token, igUserId } : null;
}

function graphBase() {
  const v = process.env.GRAPH_API_VERSION || "v24.0";
  return `https://graph.facebook.com/${v}`;
}

export async function publishInstagram(
  post: Post,
  ctx: PublishCtx
): Promise<Partial<Delivery>> {
  const creds = credentials();

  // ---- demo mode: no credentials ------------------------------------------------
  if (!creds) {
    // still render the real card, so you can see exactly what IG would receive
    const card = await renderCard(post, ctx.publicBase);
    await sleep(1400 + Math.random() * 900); // simulate upload + processing
    return {
      simulated: true,
      externalId: "demo-container",
      mediaUrl: card.mediaUrl,
    };
  }

  // ---- real mode ----------------------------------------------------------------
  const { token, igUserId } = creds;
  const base = graphBase();
  const card = await renderCard(post, ctx.publicBase);
  const caption = post.text.slice(0, 2200);

  // 1) create the media container
  let containerId: string;
  if (card.publicUrl) {
    // simplest path: point the Graph API at the publicly reachable card
    const res = await fetch(`${base}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: card.publicUrl,
        caption,
        access_token: token,
      }),
    });
    const data = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) {
      throw new Error(data.error?.message || `IG media container failed (${res.status})`);
    }
    containerId = data.id;
  } else {
    // no public URL available → multipart binary upload
    const form = new FormData();
    form.append("media_type", "IMAGE");
    form.append("caption", caption);
    form.append("access_token", token);
    form.append("media", new Blob([new Uint8Array(card.buffer)], { type: "image/png" }), "garbanzo-card.png");
    const res = await fetch(`${base}/${igUserId}/media`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) {
      throw new Error(data.error?.message || `IG media upload failed (${res.status})`);
    }
    containerId = data.id;
  }

  // 2) publish the container (retry while Meta is still processing it)
  let lastError: Error = new Error("IG media_publish never succeeded");
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt === 0 ? 1500 : 2500);
    try {
      const res = await fetch(`${base}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: containerId, access_token: token }),
      });
      const data = (await res.json()) as { id?: string; error?: { message?: string } };
      if (res.ok && data.id) {
        return { externalId: data.id, mediaUrl: card.mediaUrl };
      }
      lastError = new Error(data.error?.message || `IG media_publish failed (${res.status})`);
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError;
}
