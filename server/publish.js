/**
 * Publish orchestrator — fans a single composed post out to every selected
 * platform in parallel, records per-platform results in the post history.
 */
const crypto = require('crypto');
const store = require('./store');
const platforms = require('./platforms');

function nowIso() {
  return new Date().toISOString();
}

async function publishPost({ text, imageUrl, platforms: selected }) {
  const settings = store.getSettings();

  const post = {
    id: crypto.randomBytes(8).toString('hex'),
    createdAt: nowIso(),
    text: text || '',
    imageUrl: imageUrl || null,
    results: {},
  };
  for (const p of selected) {
    post.results[p] = { status: 'publishing', startedAt: nowIso() };
  }
  store.addPost(post);

  await Promise.all(selected.map(async (p) => {
    const mod = platforms[p];
    try {
      const r = await mod.publish({ text: post.text, imageUrl: post.imageUrl }, settings[p]);
      post.results[p] = {
        status: 'success',
        postId: r.postId,
        permalink: r.permalink || null,
        finishedAt: nowIso(),
      };
    } catch (e) {
      post.results[p] = {
        status: 'error',
        error: (e && e.message) ? e.message : String(e),
        finishedAt: nowIso(),
      };
    }
    store.updatePost(post.id, post);
  }));

  return post;
}

module.exports = { publishPost };
