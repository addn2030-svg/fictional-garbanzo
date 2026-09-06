# Automatic posting to Buffer (via GitHub Actions)

Tell Arena "post X to Buffer at time T" — the agent writes a JSON file here
and commits it. GitHub Actions (`.github/workflows/publish.yml`) detects the
new file and calls the Buffer API for you. No manual steps per post.

## One-time setup (2 minutes)

1. Get your personal API key: publish.buffer.com → **Settings → API**.
2. In this GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret**
   - Name: `BUFFER_API_KEY`
   - Value: your personal API key
   (The key lives only in GitHub's encrypted secrets — never in the repo.)
3. Find your channel ids: publish.buffer.com → **Channels** → open each
   channel; the number in the URL (`/channels/1234567890`) is the channelId.

That's it. Every post from here on is: *commit a file under `posts/` → done.*

## Post file format

```json
{
  "text": "Caption with your message. Plain text, no HTML.",
  "channelId": "1234567890",
  "mode": "customScheduled",
  "dueAt": "2026-09-07T06:00:00.000Z",
  "images": [
    "https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/main/public/posters/teach-ar.png"
  ]
}
```

- **mode**
  - `"customScheduled"` — post at an exact time (`dueAt`, required).
  - `"addToQueue"` — Buffer picks the best time for your followers.
- **dueAt** must be **UTC**. Riyadh (Asia/Riyadh) is UTC+3 →
  09:00 Riyadh = `T06:00:00.000Z`, 12:00 Riyadh = `T09:00:00.000Z`.
- **images** — Buffer downloads these URLs server-side, so they must be
  public. This repo is public, so GitHub raw URLs work:
  `https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/main/public/posters/<file>.png`
  (until this branch is merged to `main`, use the branch name in the URL).
- **One channel per file.** To post to all 3 platforms, make 3 files
  (or commit them in one commit — each gets published).
- Files starting with `example` are templates and are **never** published.
- Limits: Buffer allows 100 API requests / 15 min per key — far more than enough.

## Manual trigger

GitHub repo → **Actions** tab → *Buffer publish* → **Run workflow** →
pick the post file. Useful for re-publishing without a new commit.

## What if it fails?

Check **Actions** tab → the run's log prints Buffer's exact error.
Common ones:
- `channelId` wrong → re-find it (see above).
- `dueAt` in the past → pick a future time.
- Image URL 404 → the file must exist on that branch and the repo must be public.
