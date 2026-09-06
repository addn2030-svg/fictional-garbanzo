import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 500) {
    return Response.json({ error: "text is too long (max 500)" }, { status: 400 });
  }

  store.ensureLoaded();
  const post = store.addLiveUpdate(id, text);
  if (!post) {
    return Response.json({ error: "Post is not live" }, { status: 404 });
  }
  return Response.json({ post });
}
