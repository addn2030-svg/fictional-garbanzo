#!/usr/bin/env node
/**
 * buffer-publish.mjs — schedule or queue a post via the Buffer API.
 *
 * Designed to run in GitHub Actions (the sandbox cannot reach api.buffer.com,
 * GitHub runners can). The Buffer personal API key is read from the
 * BUFFER_API_KEY environment variable (a GitHub secret) — it is never stored
 * in the repository.
 *
 * Usage:
 *   node tools/buffer-publish.mjs posts/2026-09-07-teach-ar.json
 *   node tools/buffer-publish.mjs            # auto: publishes post files changed vs HEAD~1
 *
 * Post file shape (JSON):
 * {
 *   "text":      "…caption (2000 char max)…",
 *   "channelId": "1234567890",                       // Buffer channel id (see posts/README.md)
 *   "mode":      "customScheduled" | "addToQueue",   // default: customScheduled
 *   "dueAt":     "2026-09-07T06:00:00.000Z",         // required for customScheduled (UTC ISO)
 *   "images":    ["https://…/public/posters/teach-ar.png"]   // optional, public URLs
 * }
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const API_URL = "https://api.buffer.com";

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function resolvePostFile() {
  const arg = process.argv[2];
  if (arg) {
    if (!fs.existsSync(arg)) fail(`Post file not found: ${arg}`);
    return arg;
  }
  // GitHub Actions: publish post files added/changed in the pushed commit
  let out;
  try {
    out = execSync("git diff --name-only HEAD~1 HEAD -- posts/ || true", { encoding: "utf8" });
  } catch {
    out = "";
  }
  const files = out.split("\n").map((s) => s.trim()).filter((f) => f.startsWith("posts/") && f.endsWith(".json"));
  if (files.length === 0) fail("No post file given and no posts/*.json changed in the last commit.");
  return files[0];
}

async function publish(post, key) {
  const mode = post.mode || "customScheduled";
  const input = {
    text: post.text,
    channelId: String(post.channelId),
    schedulingType: mode,
    mode,
    assets: (post.images || []).map((url) => ({ image: { url } })),
  };
  if (mode === "customScheduled") {
    if (!post.dueAt) fail("mode=customScheduled requires dueAt (UTC ISO, e.g. 2026-09-07T06:00:00.000Z).");
    const when = new Date(post.dueAt);
    if (Number.isNaN(when.getTime())) fail(`dueAt is not a valid date: ${post.dueAt}`);
    if (when.getTime() <= Date.now()) fail(`dueAt is in the past (${post.dueAt}) — Buffer will reject it.`);
    input.dueAt = post.dueAt;
  }

  const body = {
    query: `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id text status dueAt }
        }
        ... on MutationError { message }
      }
    }`,
    variables: { input },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const result = data?.data?.createPost;
  if (result?.post) {
    const p = result.post;
    console.log(`✅ Scheduled! Buffer post id=${p.id} status=${p.status} dueAt=${p.dueAt ?? "(queued)"}`);
    return;
  }
  fail(
    `Buffer rejected the request (HTTP ${res.status}): ${result?.message || JSON.stringify(data)}\n` +
    `   • Wrong channelId? Find it at publish.buffer.com → Channels → open a channel, the number in the URL is its id.\n` +
    `   • Rate limit is 100 requests / 15 min per key.`
  );
}

const file = resolvePostFile();
const post = JSON.parse(fs.readFileSync(file, "utf8"));
if (path.basename(file).startsWith("example")) {
  console.log(`⏭️  Skipped ${file} (files starting with "example" are templates).`);
  process.exit(0);
}
if (!post.text) fail(`${file}: "text" is required.`);
if (!post.channelId) fail(`${file}: "channelId" is required (see posts/README.md).`);

const key = process.env.BUFFER_API_KEY;
if (!key) fail("BUFFER_API_KEY is not set. In GitHub: repo → Settings → Secrets and variables → Actions → New repository secret, name it BUFFER_API_KEY.");

try {
  await publish(post, key);
} catch (err) {
  fail(
    `Network error calling api.buffer.com: ${err.cause?.code || err.message}\n` +
    `   The Arena sandbox firewall blocks Buffer — this is expected here. Run it from GitHub Actions (push posts/*.json) or from a machine with internet.`
  );
}
