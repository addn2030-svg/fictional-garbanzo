import type { Delivery, Post } from "../types";
import type { PublishCtx } from "./index";

/**
 * X (Twitter) via API v2.
 *
 * Flow:
 *   POST https://api.x.com/2/tweets   { "text": "..." }
 *   with Authorization: Bearer <OAuth 2.0 user-context token>
 *   → { "data": { "id": "123..." } }
 *
 * Needs env:
 *   X_ACCESS_TOKEN  OAuth 2.0 USER-context token with tweet.read + tweet.write
 *                   (App-Only bearer tokens cannot post — X requires user context).
 *
 * Note: X caps posts at 280 characters — longer text is truncated here.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const X_API = "https://api.x.com/2";

function hasCreds() {
  return !!process.env.X_ACCESS_TOKEN;
}

export async function publishX(
  post: Post,
  _ctx: PublishCtx
): Promise<Partial<Delivery>> {
  if (!hasCreds()) {
    // demo mode
    await sleep(700 + Math.random() * 700);
    return { simulated: true, externalId: "demo-tweet-12345" };
  }

  const res = await fetch(`${X_API}/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.X_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: post.text.slice(0, 280) }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    detail?: string;
  };
  if (res.ok && data.data?.id) {
    return { externalId: data.data.id };
  }
  throw new Error(data.detail || `X post failed (${res.status})`);
}
