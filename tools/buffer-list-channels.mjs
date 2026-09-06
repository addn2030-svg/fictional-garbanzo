#!/usr/bin/env node
/**
 * buffer-list-channels.mjs — print your Buffer channel ids.
 *
 * Run by GitHub Actions (sandbox cannot reach api.buffer.com).
 * Key = BUFFER_API_KEY secret. Also available via the "Run workflow"
 * button with the "List Buffer channel IDs" box checked.
 */
const API_URL = "https://api.buffer.com";
const key = process.env.BUFFER_API_KEY;
if (!key) {
  console.error("❌ BUFFER_API_KEY is not set. Repo → Settings → Secrets and variables → Actions → New repository secret (name: BUFFER_API_KEY).");
  process.exit(1);
}

// The list field name is not officially documented — try known candidates.
const candidates = ["channels", "channelsList", "allChannels"];

for (const field of candidates) {
  const query = `query {
    ${field} {
      id
      name
      service
    }
  }`;
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    console.error(`❌ Network error calling api.buffer.com: ${err.cause?.code || err.message}`);
    process.exit(1);
  }
  const data = await res.json().catch(() => ({}));
  if (data?.errors) continue; // wrong field name — try the next candidate
  const list = data?.data?.[field];
  if (!Array.isArray(list)) continue;
  if (list.length === 0) {
    console.log("⚠️ Buffer returned zero channels for this key.");
    process.exit(0);
  }
  console.log(`✅ Buffer channels (field: "${field}") — use the id in post files:`);
  for (const c of list) {
    console.log(`   id=${c.id}   service=${c.service}   name="${c.name}"`);
  }
  process.exit(0);
}
console.error("❌ Could not find the channels list field — check Buffer API status.");
process.exit(1);
