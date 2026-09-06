# LivePost — live social media publishing

A self-hosted web dashboard that publishes **one post simultaneously to X (Twitter), Facebook, Instagram and LinkedIn** through their **official APIs** — with live per-platform previews, instant publishing, and a full post history showing per-platform status (post id, permalink, errors).

```
npm install
npm start          # → http://localhost:3000
```

> Node.js 18+ required. All credentials are stored locally in `data/settings.json` (gitignored).

---

## How it works

1. **Connections tab** — connect each platform once (keys or OAuth login, with step-by-step instructions in each card).
2. **Compose tab** — write text, optionally add a public image URL, toggle platforms, see live previews + character counters.
3. **Publish now** — the post goes out in parallel to every selected platform. Per-platform results (✓ permalink / ✕ error) appear immediately.
4. **History tab** — every post with per-platform status chips and links to the live posts.

## What each platform needs

| Platform | Auth | Post target | Setup |
|---|---|---|---|
| **X (Twitter)** | OAuth 1.0a — paste 4 keys | Your account's timeline | [developer.x.com](https://developer.x.com) app, **Read and write** permission |
| **Facebook** | OAuth 2.0 (in-app Connect) or pasted Page token | A **Facebook Page** (profiles are not supported by the Graph API) | [developers.facebook.com](https://developers.facebook.com) app + Facebook Login product |
| **Instagram** | OAuth 2.0 (in-app Connect) or pasted long-lived token | Your **Professional** account (Business/Creator) | Meta app + **Instagram** product ("API setup with Instagram login") |
| **LinkedIn** | OAuth 2.0 (in-app Connect) or pasted token | Your personal profile feed | [linkedin.com/developers](https://www.linkedin.com/developers) app + **Share on LinkedIn** + **Sign In with LinkedIn using OpenID Connect** products |

The Connections tab shows the exact **Redirect URI** to register for each OAuth flow (e.g. `https://your-host/oauth/facebook/callback`), and each card contains numbered setup steps.

### Image posts

- Provide a **publicly reachable image URL** (https). Facebook and Instagram pass the URL straight to their APIs; X and LinkedIn download and re-upload the bytes automatically.
- Instagram **requires** a JPEG image (aspect ratio 4:5–1.91:1, ≤8MB).
- X images: JPEG/PNG/GIF/WebP, ≤5MB. LinkedIn: ≤10MB.

### Rules & limits (enforced per platform)

- X: 280 chars · LinkedIn: 3,000 chars (text required) · Instagram: 2,200 char caption (image required) · Facebook: 63,206 chars
- X free tier allows a limited number of posts per day/month; Instagram & LinkedIn tokens last ~60 days (the UI shows days remaining; hit Test/Connect again to refresh).

## Configuration

| Environment variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `PUBLIC_BASE_URL` | Override the base URL used to build OAuth redirect URIs (useful behind proxies). Defaults to the request's origin. |

Runtime data lives in `data/` (auto-created): `settings.json` (credentials — **keep this private**), `posts.json` (history).

## API

The dashboard uses a small JSON API you can also call directly:

```
GET    /api/status                  # connection state per platform
GET    /api/settings                # credentials (secrets masked)
PUT    /api/settings/:platform      # save credentials (blank = keep existing)
POST   /api/connect/:platform       # save + verify credentials
POST   /api/test/:platform          # re-verify a connection
POST   /api/disconnect/:platform    # clear stored tokens
GET    /api/posts                   # post history
POST   /api/publish                 # { text, imageUrl?, platforms: ["twitter","facebook","instagram","linkedin"] }
```

Example:

```bash
curl -X POST http://localhost:3000/api/publish \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from LivePost!","platforms":["twitter","linkedin"]}'
```

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS with `npm start`, Docker…). Notes:

- Set `PUBLIC_BASE_URL` to your public HTTPS URL so OAuth redirects are built correctly.
- Facebook/Instagram/LinkedIn app consoles must have the exact redirect URI registered (HTTPS, except `http://localhost` for local dev).
- Persist the `data/` directory if you want credentials and history to survive restarts.

## Security notes

- Credentials never leave your server except to the platform APIs themselves; the UI only ever receives masked values.
- `data/` is gitignored — don't commit it.
- Put the app behind authentication/reverse proxy if exposed publicly; anyone with access to the dashboard can post to your connected accounts.

## Project structure

```
server/
  index.js             # Express app, API routes, OAuth flows
  store.js             # JSON storage (settings + history)
  publish.js           # fan-out orchestrator
  http.js              # fetch helpers, image download, multipart
  oauth1.js            # OAuth 1.0a signer (X)
  platforms/           # twitter.js, facebook.js, instagram.js, linkedin.js
public/                # dashboard (vanilla JS SPA)
data/                  # runtime storage (gitignored)
```
