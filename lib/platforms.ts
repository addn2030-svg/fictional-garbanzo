import type { PlatformId } from "./types";

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  mark: string; // short logo letter
  chip: string; // tailwind classes for the small badge
  badge: string; // tailwind classes for the big circle
  blurb: string;
}

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  twitter: {
    id: "twitter",
    name: "X / Twitter",
    mark: "𝕏",
    chip: "bg-white text-black",
    badge: "bg-white text-black",
    blurb: "Short-form updates, best for news and quick takes.",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    mark: "f",
    chip: "bg-[#1877F2] text-white",
    badge: "bg-[#1877F2] text-white",
    blurb: "Broad reach and groups, great for community events.",
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    mark: "◎",
    chip: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
    badge: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
    blurb: "Visual-first feed and stories for your audience.",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    mark: "♪",
    chip: "bg-black text-white ring-1 ring-emerald-400/60",
    badge: "bg-black text-white ring-1 ring-emerald-400/60",
    blurb: "Short video clips with explosive discovery reach.",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    mark: "in",
    chip: "bg-[#0A66C2] text-white",
    badge: "bg-[#0A66C2] text-white",
    blurb: "Professional network for company announcements.",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
