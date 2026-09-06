#!/usr/bin/env python3
"""
Garbanzo → Buffer one-shot test
Posts the "Rainy Season Safety" campaign (Jubail Industrial City, Winter 2026)
to your three Buffer channels: TikTok, LinkedIn, Instagram.

Run it on ANY machine with internet (laptop, or your other agent):

    python3 test_buffer.py YOUR_BUFFER_API_KEY

Optional 2nd argument = public image URL for the Instagram post.
Default = the teaching poster hosted on the Garbanzo sandbox (valid while
that sandbox is running):

    https://3000-izmv3z28x2msx0qtogzvi.e2b.app/posters/teach.png

For a permanent image, upload the poster anywhere public (Drive
"anyone with the link", imgur, your site) and pass that URL.

No other setup needed — the key is the only secret.
"""
import json
import sys
import urllib.error
import urllib.request

API = "https://api.buffer.com"


def gql(key, query):
    req = urllib.request.Request(
        API,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read() or b"{}")
        except Exception:
            return {"errors": [{"message": f"HTTP {e.code}"}]}


def main():
    key = sys.argv[1] if len(sys.argv) > 1 else None
    if not key:
        try:  # fallback: read from a .env.local next to this script
            for line in open(".env.local", encoding="utf-8"):
                if line.startswith("BUFFER_API_KEY="):
                    key = line.strip().split("=", 1)[1]
                    break
        except OSError:
            pass
    if not key:
        sys.exit("Usage: python3 test_buffer.py YOUR_BUFFER_API_KEY [IMAGE_URL]")

    img = sys.argv[2] if len(sys.argv) > 2 else (
        "https://3000-izmv3z28x2msx0qtogzvi.e2b.app/posters/teach.png"
    )

    # 1) list connected channels
    data = gql(key, "query { channels { id name service displayName } }")
    channels = (data.get("data") or {}).get("channels") or []
    if not channels:
        sys.exit("No channels found. Raw response: " + json.dumps(data))
    by_service = {}
    for c in channels:
        by_service.setdefault((c.get("service") or "").lower(), c)
    print("Channels in your Buffer account:")
    for c in channels:
        print(f"  - {c.get('name')}  [{c.get('service')}]")
    print()

    targets = [
        ("tiktok",
         "ONE SLIP CAN END YOUR SHIFT. 🌧️ Rainy season is coming to Jubail. "
         "Wet walkways = slip risk. Look before you step. 👷 "
         "#safety #Jubail #slipstop #winter2026",
         None),
        ("linkedin",
         "🌧️ Rainy Season Safety Campaign — Jubail Industrial City, Winter 2026\n\n"
         "Slips, trips and falls are the top seasonal injury on industrial sites: "
         "wet walkways, rain on stairs and platforms, condensation, wet roads "
         "between sites.\n\nThree habits prevent most of them:\n"
         "1. Look before you step\n"
         "2. Wear slip-resistant boots\n"
         "3. Report wet walkways immediately\n\n"
         "Safe people, stronger plants. #ProcessSafety #IndustrialSafety #Jubail #HSE",
         None),
        ("instagram",
         "🌧️ Rainy season is coming to Jubail.\n\n"
         "Slips, trips & falls are the #1 seasonal injury on industrial sites — "
         "and 3 simple habits prevent most of them. Save this for the first storm. 👷\n\n"
         "#SafetyFirst #Jubail #IndustrialSafety #ProcessSafety #HSE #SlipStop #Winter2026",
         img),
    ]

    ok = 0
    for svc, text, media in targets:
        ch = by_service.get(svc)
        if not ch:
            print(f"[{svc}] SKIP — no channel in your Buffer account")
            continue
        assets = (
            f"\n    assets: {json.dumps([{'image': {'url': media}}])}"
            if media else ""
        )
        q = (
            "mutation {\n  createPost(input: {\n"
            f"    text: {json.dumps(text)}\n"
            f"    channelId: {json.dumps(ch['id'])}\n"
            "    schedulingType: automatic\n"
            f"    mode: addToQueue{assets}\n"
            "  }) {\n"
            "    ... on PostActionSuccess { post { id text status } }\n"
            "    ... on MutationError { message }\n"
            "  }\n"
            "}"
        )
        r = (gql(key, q).get("data") or {}).get("createPost") or {}
        if "post" in r:
            ok += 1
            print(f"[{svc}] ✅ QUEUED (post id {r['post'].get('id')}, "
                  f"status: {r['post'].get('status')})")
        else:
            print(f"[{svc}] ❌ {r.get('message')}")

    print(f"\n{ok}/3 platforms accepted.")
    print("Open publish.buffer.com → Publish to watch them go out.")
    print("Note: TikTok is video-first — if it rejected a text-only post,")
    print("that's expected; convert the hook poster to a short clip and re-send.")


if __name__ == "__main__":
    main()
