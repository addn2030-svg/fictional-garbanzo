export type PlatformId =
  | "twitter"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin";

export interface LiveUpdate {
  id: string;
  text: string;
  at: number;
}

export type DeliveryStatus = "queued" | "publishing" | "published" | "failed";

export interface Delivery {
  status: DeliveryStatus;
  at?: number; // when the terminal state was reached
  error?: string;
  externalId?: string; // platform-side post id (IG media id, LinkedIn share urn)
  mediaUrl?: string; // rendered card (Instagram), relative URL
  simulated?: boolean; // delivery simulated (no API credentials)
  via?: "direct" | "buffer"; // which route carried the post
}

export interface Post {
  id: string;
  author: string;
  handle: string;
  avatar: string; // emoji
  color: string; // avatar background class
  text: string;
  platforms: PlatformId[];
  at: number; // created time (ms)
  likes: number;
  comments: number;
  reposts: number;
  isLive: boolean; // currently live
  delivery: Partial<Record<PlatformId, Delivery>>;
  liveStartedAt: number | null;
  liveEndedAt: number | null;
  viewers: number;
  peakViewers: number;
  updates: LiveUpdate[];
}

export interface PlatformState {
  id: PlatformId;
  connected: boolean;
  followers: number;
  reach: number;
  posts: number;
}

export type FeedEventType =
  | "post:new"
  | "post:stats"
  | "post:delivery"
  | "post:live-update"
  | "live:started"
  | "live:ended"
  | "live:viewers"
  | "platform:change";

export interface FeedEvent {
  type: FeedEventType;
  post?: Post;
  postId?: string;
  platform?: PlatformState;
  ts: number;
}
