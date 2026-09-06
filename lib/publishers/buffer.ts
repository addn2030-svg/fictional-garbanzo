import type { Delivery, PlatformId, Post } from "../types";
import type { PublishCtx } from "./index";
import { renderCard } from "./card";

/**
 * Buffer — the second publishing option, one key for many networks.
 *
 * 2026 API: GraphQL at https://api.buffer.com with a personal API key
 * (Bearer). Get a key at publish.buffer.com → Settings → API.
 *
 *   mutation createPost(input: {
 *     text, channelId, schedulingType: automatic, mode: addToQueue,
 *     assets: [{ image: { url } }]   # Buffer needs public media URLs
 *   })
 *
 * Needs env:
 *   BUFFER_API_KEY                 personal key from Settings → API
 *   BUFFER_CHANNEL_<PLATFORM>      channel id per platform (optional —
 *                                  auto-resolved via the channels query)
 *
 * Supports: instagram, twitter, facebook, linkedin, tiktok.
 * Limits: 100 requests / 15 min per client; media must be pre-hosted at a
 * public URL (we use the rendered card served at /api/media/...).
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUFFER_ENDPOINT = "https://api.buffer.com";

/** Buffer's internal service names per platform id. */
const SERVICE_NAMES: Record<string, string[]> = {
  twitter: ["twitter", "x"],
  facebook: ["facebook"],
  instagram: ["instagram"],
  tiktok: ["tiktok"],
  linkedin: ["linkedin"],
};

interface BufferChannel {
  id: string;
  name?: string;
  service?: string;
  displayName?: string;
}

const g = globalThis as unknown as {
  __garbanzoBufferChannels?: BufferChannel[] | null;
};

function credentials() {
  return process.env.BUFFER_API_KEY;
}

async function graphql(key: string, query: string) {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query }),
  });
  const data = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: { message?: string }[];
  };
  if (!res.ok || data.errors?.length) {
    throw new Error(
      data.errors?.[0]?.message || `Buffer request failed (${res.status})`
    );
  }
  return data.data ?? {};
}

/** Find the Buffer channel id for a platform (env override or lookup). */
async function resolveChannelId(
  key: string,
  platform: PlatformId
): Promise<string> {
  const envName = `BUFFER_CHANNEL_${platform.toUpperCase()}`;
  if (process.env[envName]) return process.env[envName]!;

  if (!g.__garbanzoBufferChannels) {
    const data = await graphql(
      key,
      `query { channels { id name service displayName } }`
    );
    const list = (data.channels as BufferChannel[]) ?? [];
    g.__garbanzoBufferChannels = list;
    if (list.length === 0) {
      throw new Error(
        "No channels found in your Buffer account — connect one in Buffer, " +
          `or set ${envName}`
      );
    }
  }
  const names = SERVICE_NAMES[platform] ?? [platform];
  const found = g.__garbanzoBufferChannels.find((c) =>
    names.includes((c.service ?? "").toLowerCase())
  );
  if (!found) {
    throw new Error(
      `No ${platform} channel in your Buffer account — connect it in Buffer ` +
        `or set ${envName}=<channel id>`
    );
  }
  return found.id;
}

export async function publishBuffer(
  post: Post,
  ctx: PublishCtx
): Promise<Partial<Delivery>> {
  const key = credentials();

  // ---- demo mode -------------------------------------------------------------
  if (!key) {
    await sleep(1100 + Math.random() * 900);
    const extra: Partial<Delivery> = { simulated: true, externalId: "buffer-demo-post" };
    // Instagram via Buffer still wants an image — render the card for real
    if (post.platforms.includes("instagram")) {
      const card = await renderCard(post, ctx.publicBase);
      extra.mediaUrl = card.mediaUrl;
    }
    return extra;
  }

  // ---- real mode -------------------------------------------------------------
  const channelId = await resolveChannelId(key, post.platforms[0]);

  const assets: unknown[] = [];
  let mediaUrl: string | undefined;
  if (post.platforms.includes("instagram")) {
    const card = await renderCard(post, ctx.publicBase);
    mediaUrl = card.mediaUrl;
    if (card.publicUrl) {
      assets.push({ image: { url: card.publicUrl } });
    }
    // without a public URL Buffer can't fetch the image — it will report a
    // clear error, which we surface on the delivery chip.
  }

  // JSON literals are valid GraphQL string/object literals, so embedding the
  // stringified values keeps the inline-argument style from Buffer's docs.
  const mutation = `mutation CreatePost {
  createPost(input: {
    text: ${JSON.stringify(post.text.slice(0, 2200))}
    channelId: ${JSON.stringify(channelId)}
    schedulingType: automatic
    mode: addToQueue${
      assets.length ? `\n    assets: ${JSON.stringify(assets)}` : ""
    }
  }) {
    ... on PostActionSuccess { post { id text status } }
    ... on MutationError { message }
  }
}`;

  const data = (await graphql(key, mutation)) as {
    createPost?: { post?: { id?: string }; message?: string };
  };
  const result = data.createPost;
  if (result?.post?.id) {
    return { externalId: `buffer:${result.post.id}`, mediaUrl };
  }
  throw new Error(result?.message || "Buffer createPost returned no post");
}
