import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { Post } from "../types";

export interface RenderedCard {
  /** relative URL inside this app, e.g. /api/media/card-abc123 */
  mediaUrl: string;
  /** publicly reachable URL, when the app is reachable at `publicBase` */
  publicUrl?: string;
  buffer: Buffer;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap text into lines of at most `maxChars`, capped at `maxLines`. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > maxChars) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) {
        cur = cur.slice(0, maxChars);
        break;
      }
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, maxChars - 1).trimEnd() + "…";
    return kept;
  }
  return lines;
}

/**
 * Render a branded 1080x1350 (4:5) post card — the exact image that would be
 * uploaded to Instagram for a text post (the Graph API has no text-only posts).
 */
export async function renderCard(
  post: Post,
  publicBase?: string
): Promise<RenderedCard> {
  const id = `card-${post.id}`;
  const dir = path.join(process.cwd(), "data", "media");
  fs.mkdirSync(dir, { recursive: true });

  const lines = wrap(post.text, 30, 9);
  const textBlock = lines
    .map(
      (ln, i) =>
        `<tspan x="90" dy="${i === 0 ? 0 : 76}">${escapeXml(ln)}</tspan>`
    )
    .join("");
  const textY = 560 - Math.floor((lines.length - 1) * 38);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#a3e635" stop-opacity="0.22"/>
      <stop offset="55%" stop-color="#a3e635" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1350" fill="#0b0b0c"/>
  <rect width="1080" height="1350" fill="url(#glow)"/>
  <rect x="0" y="0" width="1080" height="14" fill="#a3e635"/>
  <rect x="90" y="130" width="110" height="110" rx="28" fill="#a3e635"/>
  <text x="145" y="212" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="76" font-weight="bold" fill="#0b0b0c" text-anchor="middle">G</text>
  <text x="230" y="196" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="52" font-weight="bold" fill="#f5f5f4">GARBANZO</text>
  <text x="232" y="232" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="26" fill="#737373" letter-spacing="4">POST ONCE · GO LIVE EVERYWHERE</text>
  <text x="90" y="${textY}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="56" fill="#e5e5e4">
${textBlock}
  </text>
  <line x1="90" y1="1150" x2="990" y2="1150" stroke="#262626" stroke-width="2"/>
  <text x="90" y="1225" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="34" font-weight="bold" fill="#a3e635">${escapeXml(post.handle)}</text>
  <text x="90" y="1272" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="28" fill="#737373">${escapeXml(post.author)} · via Garbanzo</text>
  <text x="990" y="1272" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="28" fill="#525252" text-anchor="end">garbanzo.social</text>
</svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const file = path.join(dir, `${id}.png`);
  fs.writeFileSync(file, buffer);

  // keep the media folder bounded
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    if (files.length > 60) {
      for (const { f } of files.slice(0, files.length - 50)) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {
    /* cleanup is best-effort */
  }

  const mediaUrl = `/api/media/${id}`;
  let publicUrl: string | undefined;
  const base = (publicBase || process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  if (base) publicUrl = `${base}${mediaUrl}`;

  return { mediaUrl, publicUrl, buffer };
}
