import { store } from "@/lib/store";
import { PLATFORM_IDS } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  store.ensureLoaded();
  const platforms = store.platforms();
  return Response.json({
    platforms: PLATFORM_IDS.map((id) => platforms[id]),
  });
}

export async function POST(req: Request) {
  let body: { id?: PlatformId; connect?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || !(PLATFORM_IDS as string[]).includes(body.id)) {
    return Response.json({ error: "Unknown platform" }, { status: 400 });
  }

  store.ensureLoaded();
  const p = store.setPlatformConnected(body.id, !!body.connect);
  if (!p) return Response.json({ error: "Unknown platform" }, { status: 404 });
  return Response.json({ platform: p });
}
