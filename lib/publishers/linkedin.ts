import type { Delivery, Post } from "../types";
import type { PublishCtx } from "./index";

/**
 * LinkedIn via the official REST API (v2 ugcPosts).
 *
 * Flow:
 *   POST https://api.linkedin.com/v2/ugcPosts
 *   - text-only "Share" (no media) — LinkedIn supports plain-text posts
 *   - 201 Created → the `Location` header carries the share URN
 *
 * Needs env:
 *   LINKEDIN_ACCESS_TOKEN  member or org token with w_member_social
 *   LINKEDIN_URN           optional owner, e.g. urn:li:person:abc123.
 *                          If omitted it is resolved from the token via /v2/userinfo.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const API = "https://api.linkedin.com/v2";

function hasCreds() {
  return !!process.env.LINKEDIN_ACCESS_TOKEN;
}

async function resolveAuthor(): Promise<string> {
  if (process.env.LINKEDIN_URN) return process.env.LINKEDIN_URN;
  const res = await fetch(`${API}/userinfo`, {
    headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Could not resolve LinkedIn author (${res.status}) — set LINKEDIN_URN`);
  }
  const data = (await res.json()) as { sub?: string };
  if (!data.sub) throw new Error("LinkedIn /v2/userinfo returned no sub claim");
  return `urn:li:person:${data.sub}`;
}

export async function publishLinkedin(
  post: Post,
  _ctx: PublishCtx
): Promise<Partial<Delivery>> {
  if (!hasCreds()) {
    // demo mode: simulate the round-trip
    await sleep(900 + Math.random() * 800);
    return { simulated: true, externalId: "urn:li:share:(demo-12345)" };
  }

  const token = process.env.LINKEDIN_ACCESS_TOKEN!;
  const author = await resolveAuthor();

  const body = {
    author,
    lifecycleState: "PUBLISHED",
    visibility: { code: "PUBLIC" },
    regenerativeMediaLikelyness: "NONE",
    specificContent: {
      "com.linkedin.v2.uniform.media.Share": {
        shareCommentary: { text: post.text.slice(0, 3000) },
        shareMediaCategory: "NONE",
      },
    },
  };

  const res = await fetch(`${API}/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 201) {
    return { externalId: res.headers.get("location") ?? "posted" };
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(data.message || `LinkedIn post failed (${res.status})`);
}
