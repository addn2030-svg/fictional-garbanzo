import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  store.ensureLoaded();
  const posts = store.posts();
  const post = posts.find((p) => p.id === id);
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
  return Response.json({ post });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  store.ensureLoaded();

  if (body.action === "like") {
    const post = store.like(id);
    if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
    return Response.json({ post });
  }

  if (body.action === "endLive") {
    const post = store.endLive(id);
    if (!post) return Response.json({ error: "Post is not live" }, { status: 404 });
    return Response.json({ post });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
