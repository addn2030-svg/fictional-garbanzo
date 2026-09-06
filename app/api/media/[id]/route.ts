import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the rendered post cards (Instagram uploads). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return new Response("Bad id", { status: 400 });
  }
  const file = path.join(process.cwd(), "data", "media", `${id}.png`);
  if (!fs.existsSync(file)) {
    return new Response("Not found", { status: 404 });
  }
  const buf = fs.readFileSync(file);
  return new Response(buf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
