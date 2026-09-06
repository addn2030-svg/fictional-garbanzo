# Garbanzo 🫘

**Post once. Go live everywhere.**

Garbanzo is a multi-platform social hub with two "live" features:

- **Real-time feed** — every post, like and live update streams to all open
  browsers the instant it happens (server-sent events). No refresh, ever.
- **Live posts** — start any post with the *Go live* toggle. The post stays
  live: append updates as an event unfolds, watch viewer counts move, then end
  it to turn it into a replay with a full timeline.
- **Multi-platform publishing** — pick which networks to publish to
  (X/Twitter, Facebook, Instagram, TikTok, LinkedIn) in one composer, and see
  per-platform stats on the Platforms page.

## Stack

- **Next.js 15** (App Router, TypeScript) — pages, API routes
- **Tailwind CSS 4** — dark UI
- **Server-Sent Events** — `/api/events` pushes feed events to all clients
- **In-memory store + JSON persistence** — `data/garbanzo.json` (gitignored)
- **Activity simulator** — a background bot (`lib/simulator.ts`) keeps the
  feed, live viewer counts and platform stats moving so the realtime feel is
  visible in a single-browser demo

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

## Pages

| Route         | What you get                                                      |
| ------------- | ----------------------------------------------------------------- |
| `/`           | Composer (platform picker + Go-live toggle) and the live feed     |
| `/live`       | Everything happening right now — live timers, viewer counts,     |
|               | streaming update timelines, "add update" and "end live" controls |
| `/platforms`  | Connect/disconnect networks, per-platform reach & follower stats |

## API

| Endpoint                      | Method | Description                                   |
| ----------------------------- | ------ | --------------------------------------------- |
| `/api/posts`                  | GET    | All posts (newest first)                      |
| `/api/posts`                  | POST   | Create a post `{ text, platforms[], isLive }` |
| `/api/posts/:id`              | GET    | Single post                                   |
| `/api/posts/:id`              | PATCH  | `{ action: "like" \| "endLive" }`             |
| `/api/posts/:id/updates`      | POST   | Append a live update `{ text }` (live only)   |
| `/api/platforms`              | GET    | Platform states                               |
| `/api/platforms`              | POST   | `{ id, connect }` — connect/disconnect        |
| `/api/events`                 | GET    | SSE stream of all realtime events             |

SSE event types: `hello`, `post:new`, `post:stats`, `post:delivery`,
`post:live-update`, `live:started`, `live:ended`, `live:viewers`,
`platform:change`, `ping`.

Other: `GET /api/media/:id` serves the rendered Instagram post cards.

## How a post travels from the bot to the platforms

```
Composer (you)          Simulator (bot)
        │                      │
        ▼                      ▼
   POST /api/posts        store.addPost(...)     lib/simulator.ts
        │                      │
        ▼                      ▼
   store.addPost ── post created, every selected platform stamped
        │             delivery = queued  ─────────────► SSE post:new
        ▼
   publishPost(post)                lib/publishers/index.ts
        │  (per platform, staggered ~400 ms apart)
        │  route = PUBLISH_VIA_<PLATFORM> (default "direct", or "buffer")
        ├─ setDelivery(publishing, via) ─────────────► SSE post:delivery
        │
        ├─ direct adapters (platform's own API):
        │    LinkedIn    lib/publishers/linkedin.ts
        │      POST api.linkedin.com/v2/ugcPosts (text Share, PUBLIC) → share URN
        │    Instagram   lib/publishers/instagram.ts
        │      render text → branded 4:5 card (sharp, 1080×1350)
        │      POST graph.facebook.com/{ig-id}/media → container
        │      POST …/media_publish → media id (retries while processing)
        │    X / Twitter lib/publishers/x.ts
        │      POST api.x.com/2/tweets (280 chars, OAuth 2.0 user token)
        │
        └─ second option: Buffer     lib/publishers/buffer.ts
             GraphQL api.buffer.com, Bearer personal API key
             createPost(text, channelId, schedulingType: automatic,
                        mode: addToQueue, assets[{image:{url}}])
             one key carries instagram / x / facebook / linkedin / tiktok
        │
        ▼
   setDelivery(published | failed, externalId, via) ─► SSE post:delivery
                                                        │
                         every open browser's chips flip live:
                [𝕏][f][◎][♪][in]  →  queued → publishing → ✓ (or ! with error)
```

Every status change is persisted (`data/garbanzo.json`) and broadcast, so the
per-platform chips on each post are the live view of the pipeline. Failures
carry the platform's error message in the chip tooltip, and published chips
show which route carried the post (direct or via Buffer).

### Getting your API keys

Copy `.env.example` to `.env.local`, then follow the matching guide.
Without keys, everything still runs in **demo mode** (simulated delivery,
real card rendering).

**Instagram** (Business/Creator account required)
1. developers.facebook.com → **Create App → Business**
2. Add the **Instagram Graph API** product (and Facebook Login)
3. Graph API Explorer: generate a long-lived token with
   `instagram_basic` + `instagram_content_publish` (your FB account must be
   linked to the IG Business/Creator account)
4. Find your IG user id:
   `GET https://graph.facebook.com/v24.0/me/instagram_business_account?access_token=…`
5. Set `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_IG_USER_ID`

**X (Twitter)**
1. developer.x.com → **Projects & Apps → create an app**
2. OAuth 2.0: generate a **user-context** token with `tweet.read` +
   `tweet.write` (the portal's OAuth 2.0 Playground works for one-off tokens;
   app-only bearer tokens cannot post)
3. Set `X_ACCESS_TOKEN`. Note: the entry tier is quota-limited
   (≈50 posts/day) — check current tiers/pricing at developer.x.com

**LinkedIn**
1. linkedin.com/developers → **create app**
2. Add the **Share on LinkedIn** product (`w_member_social`)
3. OAuth 2.0 → request a token for your account
4. Set `LINKEDIN_ACCESS_TOKEN` (`LINKEDIN_URN` optional — auto-resolved)

**Buffer** (second option — one key, many networks)
1. buffer.com → sign in / create account → connect your social accounts
   (free plan: 3 channels)
2. publish.buffer.com → **Settings → API → Generate API key**
3. Set `BUFFER_API_KEY`; optionally pin `BUFFER_CHANNEL_<PLATFORM>` ids
   (else channels are auto-resolved by network name)
4. Route any platform through it: `PUBLISH_VIA_<PLATFORM>=buffer`
   (e.g. `PUBLISH_VIA_TWITTER=buffer`). Buffer's limit: 100 req/15 min, and
   media must be public URLs — the rendered card at `/api/media/…` covers that.

### Why two routes?

| | Direct | Via Buffer |
| --- | --- | --- |
| Keys needed | one per network | one key for all five |
| Facebook / TikTok | not yet built | already supported |
| Scheduling | immediate | Buffer's queue (next slot) |
| Best for | control, no middleman | getting live fast with minimal keys |

Mix and match per platform — e.g. Instagram + LinkedIn direct, X + Facebook
through Buffer.

### Standalone single-file demo

`garbanzo.html` at the repo root is the whole experience (feed, live posts,
multi-platform composer, delivery chips, rendered IG cards, bots) in one
dependency-free HTML file — open it directly in a browser or paste it
anywhere. Single-browser simulation; the Next.js app above is the full
realtime + real-API version.

## Notes

- Audience numbers (followers/reach) are **simulated** so the demo is
  self-contained; delivery status is real end-to-end — with credentials the
  adapters call the actual Meta Graph and LinkedIn APIs.
