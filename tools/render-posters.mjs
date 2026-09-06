/*
 * Renders the Rainy Season + Rehab-as-Prevention campaign posters
 * (3 templates x Arabic/English) and the 9:16 TikTok video frames.
 *
 *   node tools/render-posters.mjs
 *   → posters/hook-ar.png, hook-en.png, teach-ar.png, teach-en.png,
 *     publish-ar.png, publish-en.png
 *   → assets/frames/frame-1..4.png  (1080x1920)
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const A = (p) => path.join(ROOT, p);

// self-install the bundled Tajawal (Arabic) font for fontconfig, if needed
{
  const dest = path.join(process.env.HOME, ".local/share/fonts/tajawal");
  for (const f of ["Tajawal-Regular.ttf", "Tajawal-Bold.ttf"]) {
    const src = A(`assets/fonts/${f}`);
    if (fs.existsSync(src) && !fs.existsSync(path.join(dest, f))) {
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(src, path.join(dest, f));
      console.log("installed font", f);
    }
  }
}
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ORANGE = "#f97316";
const NAVY = "#0d1b2a";
const F_AR = "Tajawal, DejaVu Sans, sans-serif";
const F_EN = "DejaVu Sans, sans-serif";

function wrap(text, maxChars, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > maxChars) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) {
        cur = cur.slice(0, maxChars);
        break;
      }
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + "…";
  }
  return lines;
}

const tspan = (lines, x, y0, dy) =>
  lines
    .map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : dy}">${esc(ln)}</tspan>`)
    .join("");

const scrim = (w, h, top = 0.75, bottom = 0.7) =>
  `<defs><linearGradient id="sc" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0" stop-color="#000" stop-opacity="${top}"/>
     <stop offset="0.45" stop-color="#000" stop-opacity="0.15"/>
     <stop offset="1" stop-color="#000" stop-opacity="${bottom}"/>
   </linearGradient></defs>
   <rect width="${w}" height="${h}" fill="url(#sc)"/>`;

function svg(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

/**
 * Compose: photo base (cover-cropped to w×h) + transparent SVG text layer.
 * (librsvg <image> embedding is unreliable in this libvips build, so the
 * background is composited by sharp itself.)
 */
async function render(png, svgStr, bgFile, w = 1080, h = 1350) {
  fs.mkdirSync(path.dirname(png), { recursive: true });
  const overlay = await sharp(Buffer.from(svgStr)).png().toBuffer();
  const out = sharp(A(bgFile))
    .resize(w, h, { fit: "cover", position: "centre" })
    .composite([{ input: overlay, top: 0, left: 0 }]);
  return out.png().toFile(png);
}

/* ── shared footer (4:5 posters) ───────────────────────────────────────── */
function footer(w, ar) {
  const txt = ar ? "الجبيل الصناعية · شتاء 2026" : "Jubail Industrial City · Winter 2026";
  return `<line x1="90" y1="1230" x2="${w - 90}" y2="1230" stroke="#3a4a5d" stroke-width="3"/>
    <text x="${w / 2}" y="1290" font-family="${ar ? F_AR : F_EN}" font-size="34" fill="#c7d3e0" text-anchor="middle">${esc(txt)}</text>`;
}

/* ── HOOK ──────────────────────────────────────────────────────────────── */
function hook(en) {
  if (en) {
    const inner = `
  ${scrim(1080, 1350, 0.55, 0.65)}
  <text x="80" y="620" font-family="${F_EN}" font-size="84" font-weight="bold" fill="#fff">
${tspan(["ONE SLIP CAN END", "YOUR SHIFT."], 80, 0, 100)}
  </text>
  <rect x="84" y="790" width="150" height="10" fill="${ORANGE}"/>
  <text x="80" y="890" font-family="${F_EN}" font-size="40" fill="#dbe4ee">
${tspan(["A stronger body prevents the next", "injury. That's what rehab does."], 80, 0, 52)}
  </text>
  ${footer(1080, false)}`;
    return svg(1080, 1350, inner);
  }
  const inner = `
  ${scrim(1080, 1350, 0.55, 0.65)}
  <text x="1000" y="600" font-family="${F_AR}" font-size="96" font-weight="bold" fill="#fff" text-anchor="end">
${tspan(["زلة واحدة…", "قد تنهي ورديتك."], 1000, 0, 116)}
  </text>
  <rect x="846" y="775" width="150" height="10" fill="${ORANGE}"/>
  <text x="1000" y="880" font-family="${F_AR}" font-size="40" fill="#dbe4ee" text-anchor="end">
${tspan(["جسد أقوى… يعني إصابات أقل"], 1000, 0, 54)}
  </text>
  ${footer(1080, true)}`;
  return svg(1080, 1350, inner);
}

/* ── TEACH ─────────────────────────────────────────────────────────────── */
const TEACH_ROWS = {
  en: [
    ["RESTORE", "full strength & mobility after injury"],
    ["CORRECT", "fix movement patterns before they hurt"],
    ["STRENGTHEN", "build a body that resists the next injury"],
  ],
  ar: [
    ["استعادة", "القوة والحركة الكاملة بعد الإصابة"],
    ["تصحيح", "أنماط الحركة الخاطئة قبل أن تتكرر"],
    ["تقوية", "بناء جسد يقاوم الإصابة القادمة"],
  ],
};
function teach(en) {
  const rows = TEACH_ROWS[en ? "en" : "ar"];
  const X_NUM = en ? 110 : 970;
  const X_TXT = en ? 250 : 830;
  const anchor = en ? "start" : "end";
  const rowY = [640, 850, 1060];
  const rowSvg = rows
    .map(
      ([t, d], i) => `
  <text x="${X_NUM}" y="${rowY[i]}" font-family="${en ? F_EN : F_AR}" font-size="96" font-weight="bold" fill="${ORANGE}" text-anchor="${anchor}">${i + 1}</text>
  <text x="${X_TXT}" y="${rowY[i] - 12}" font-family="${en ? F_EN : F_AR}" font-size="46" font-weight="bold" fill="#fff" text-anchor="${anchor}">${esc(t)}</text>
  <text x="${X_TXT}" y="${rowY[i] + 44}" font-family="${en ? F_EN : F_AR}" font-size="33" fill="#c7d3e0" text-anchor="${anchor}">${esc(d)}</text>
  ${i < 2 ? `<line x1="90" y1="${rowY[i] + 84}" x2="990" y2="${rowY[i] + 84}" stroke="#3a4a5d" stroke-width="2"/>` : ""}`
    )
    .join("");
  const title = en ? "REHAB IS PREVENTION" : "التأهيل وقاية";
  const sub = en
    ? "3 roles of rehabilitation in injury prevention"
    : "3 أدوار للتأهيل في الوقاية من الإصابات";
  const inner = `
  <rect width="1080" height="1350" fill="${NAVY}" opacity="0.45"/>
  <rect x="0" y="0" width="1080" height="14" fill="${ORANGE}"/>
  <text x="${en ? 90 : 990}" y="220" font-family="${en ? F_EN : F_AR}" font-size="${en ? 68 : 88}" font-weight="bold" fill="#fff" text-anchor="${en ? "start" : "end"}">${esc(title)}</text>
  <text x="${en ? 92 : 988}" y="290" font-family="${en ? F_EN : F_AR}" font-size="36" fill="#c7d3e0" text-anchor="${en ? "start" : "end"}">${esc(sub)}</text>
  ${rowSvg}
  ${footer(1080, !en)}`;
  return svg(1080, 1350, inner);
}

/* ── PUBLISH ───────────────────────────────────────────────────────────── */
function publish(en) {
  const L1 = en ? "RAINY SEASON" : "حملة سلامة";
  const L2 = en ? "SAFETY CAMPAIGN" : "موسم الأمطار";
  const tag = en ? "SLIPS · TRIPS · FALLS" : "الانزلاق · التعثر · السقوط";
  const bandLines = en
    ? wrap(
        "And your second line of defense: rehabilitation. It doesn't just treat injuries — it prevents the next one.",
        40,
        3
      )
    : wrap(
        "واستعد خط دفاعك الثاني: التأهيل. لا يعالج الإصابة فقط — بل يمنع الإصابة القادمة.",
        26,
        3
      );
  const bx = en ? 120 : 970;
  const anchor = en ? "start" : "end";
  const bandH = 190 + bandLines.length * 8;
  const inner = `
  ${scrim(1080, 1350, 0.7, 0.5)}
  <text x="${en ? 80 : 1000}" y="240" font-family="${en ? F_EN : F_AR}" font-size="${en ? 104 : 92}" font-weight="bold" fill="#fff" text-anchor="${en ? "start" : "end"}">${esc(L1)}</text>
  <text x="${en ? 80 : 1000}" y="352" font-family="${en ? F_EN : F_AR}" font-size="${en ? 104 : 92}" font-weight="bold" fill="#fff" text-anchor="${en ? "start" : "end"}">${esc(L2)}</text>
  <text x="${en ? 84 : 996}" y="448" font-family="${en ? F_EN : F_AR}" font-size="52" font-weight="bold" fill="${ORANGE}" text-anchor="${en ? "start" : "end"}">${esc(tag)}</text>
  <rect x="60" y="700" width="960" height="${bandH}" rx="20" fill="#000" opacity="0.6"/>
  <rect x="${en ? 60 : 1006}" y="700" width="14" height="${bandH}" fill="${ORANGE}"/>
  <text x="${bx}" y="780" font-family="${en ? F_EN : F_AR}" font-size="38" fill="#eef3f8" text-anchor="${anchor}">
${tspan(bandLines, bx, 0, 52)}
  </text>
  ${footer(1080, !en)}`;
  return svg(1080, 1350, inner);
}

/* ── 9:16 video frames (Arabic) ────────────────────────────────────────── */
const W = 1080, H = 1920;
function frame1() {
  const inner = `
  ${scrim(W, H, 0.6, 0.7)}
  <text x="1000" y="880" font-family="${F_AR}" font-size="120" font-weight="bold" fill="#fff" text-anchor="end">
${tspan(["زلة واحدة…", "قد تنهي ورديتك."], 1000, 0, 138)}
  </text>
  <rect x="830" y="1075" width="160" height="12" fill="${ORANGE}"/>
  <text x="1000" y="1190" font-family="${F_AR}" font-size="46" fill="#dbe4ee" text-anchor="end">
${tspan(["موسم الأمطار قادم… هل ممراتك جاهز؟"], 1000, 0, 62)}
  </text>
  <text x="1000" y="1800" font-family="${F_AR}" font-size="38" fill="#c7d3e0" text-anchor="end">${esc("الجبيل الصناعية")}</text>`;
  return svg(W, H, inner);
}
function frame2() {
  const tips = ["انظر قبل أن تخطو", "حذاء مضاد للانزلاق", "أبلغ عن أي ممر مبلل"];
  const y = [880, 1090, 1300];
  const rows = tips
    .map(
      (t, i) => `
  <text x="960" y="${y[i]}" font-family="${F_AR}" font-size="104" font-weight="bold" fill="${ORANGE}" text-anchor="end">${i + 1}</text>
  <text x="820" y="${y[i] - 8}" font-family="${F_AR}" font-size="52" font-weight="bold" fill="#fff" text-anchor="end">${esc(t)}</text>
  ${i < 2 ? `<line x1="120" y1="${y[i] + 70}" x2="960" y2="${y[i] + 70}" stroke="#3a4a5d" stroke-width="3"/>` : ""}`
    )
    .join("");
  const inner = `
  <rect width="${W}" height="${H}" fill="${NAVY}" opacity="0.45"/>
  <rect x="0" y="0" width="${W}" height="16" fill="${ORANGE}"/>
  <text x="1000" y="620" font-family="${F_AR}" font-size="104" font-weight="bold" fill="#fff" text-anchor="end">3 عادات تحميك</text>
  ${rows}
  <text x="1000" y="1760" font-family="${F_AR}" font-size="38" fill="#c7d3e0" text-anchor="end">${esc("الجبيل الصناعية · شتاء 2026")}</text>`;
  return svg(W, H, inner);
}
function frame3() {
  const inner = `
  ${scrim(W, H, 0.6, 0.7)}
  <text x="1000" y="820" font-family="${F_AR}" font-size="118" font-weight="bold" fill="#fff" text-anchor="end">التأهيل وقاية</text>
  <rect x="830" y="890" width="160" height="12" fill="${ORANGE}"/>
  <text x="1000" y="1010" font-family="${F_AR}" font-size="48" fill="#dbe4ee" text-anchor="end">
${tspan(["جسد أقوى بعد الإصابة…", "يعني إصابات أقل قادمة"], 1000, 0, 66)}
  </text>
  <text x="1000" y="1800" font-family="${F_AR}" font-size="38" fill="#c7d3e0" text-anchor="end">${esc("الجبيل الصناعية")}</text>`;
  return svg(W, H, inner);
}
function frame4() {
  const inner = `
  <rect width="${W}" height="${H}" fill="${NAVY}" opacity="0.6"/>
  <rect x="0" y="0" width="${W}" height="16" fill="${ORANGE}"/>
  <text x="${W / 2}" y="820" font-family="${F_AR}" font-size="150" font-weight="bold" fill="#fff" text-anchor="middle">تابعنا</text>
  <rect x="${W / 2 - 80}" y="880" width="160" height="12" fill="${ORANGE}"/>
  <text x="${W / 2}" y="1000" font-family="${F_AR}" font-size="52" fill="#dbe4ee" text-anchor="middle">نصائح السلامة · الجبيل الصناعية</text>
  <text x="${W / 2}" y="1100" font-family="${F_EN}" font-size="46" font-weight="bold" fill="${ORANGE}" text-anchor="middle">@add30nkt</text>`;
  return svg(W, H, inner);
}

/* ── run ───────────────────────────────────────────────────────────────── */
const jobs = [
  ["posters/hook-en.png", hook(true), "assets/bg-hook.png"],
  ["posters/hook-ar.png", hook(false), "assets/bg-hook.png"],
  ["posters/teach-en.png", teach(true), "assets/bg-teach.png"],
  ["posters/teach-ar.png", teach(false), "assets/bg-teach.png"],
  ["posters/publish-en.png", publish(true), "assets/bg-publish.png"],
  ["posters/publish-ar.png", publish(false), "assets/bg-publish.png"],
  ["assets/frames/frame-1.png", frame1(), "assets/bg-hook.png", W, H],
  ["assets/frames/frame-2.png", frame2(), "assets/bg-teach.png", W, H],
  ["assets/frames/frame-3.png", frame3(), "assets/bg-publish.png", W, H],
  ["assets/frames/frame-4.png", frame4(), "assets/bg-teach.png", W, H],
];

for (const [out, s, bgf, w, h] of jobs) {
  await render(A(out), s, bgf, w ?? 1080, h ?? 1350);
  console.log("✓", out);
}
console.log("done");
