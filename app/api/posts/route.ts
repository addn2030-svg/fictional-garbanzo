import { store } from "@/lib/store";
import { publishPost } from "@/lib/publishers";
import { PLATFORM_IDS } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";

/** Public base URL of this app as seen by the caller (for IG image_url). */
function publicBase(req: Request): string | undefined {
  const host = req.headers.get("host");
  if (!host) return undefined;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  store.ensureLoaded();
  return Response.json({ posts: store.posts() });
}

export async function POST(req: Request) {
  store.ensureLoaded();
  let body: {
    text?: string;
    platforms?: PlatformId[];
    isLive?: boolean;
    author?: string;
    handle?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 1000) {
    return Response.json({ error: "text is too long (max 1000)" }, { status: 400 });
  }

  const platforms = (body.platforms ?? [])
    .filter((p) => (PLATFORM_IDS as string[]).includes(p)) as PlatformId[];
  if (platforms.length === 0) {
    return Response.json(
      { error: "Pick at least one platform" },
      { status: 400 }
    );
  }

  const post = store.addPost({
    author: body.author?.trim() || "You",
    handle: body.handle?.trim() || "@you",
    avatar: "🙂",
    color: "bg-violet-500",
    text,
    platforms,
    isLive: !!body.isLive,
  });

  // fire-and-forget: the publisher pipeline reports back via SSE
  publishPost(post, { publicBase: publicBase(req) });

  return Response.json({ post }, { status: 201 });
}
