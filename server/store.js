/**
 * Tiny JSON file storage for settings (credentials/tokens) and post history.
 * Everything lives in ./data (gitignored — it contains secrets).
 */
const fs = require('fs');
const path = require('path');

// DATA_DIR lets hosts (Docker volumes, Render disks, …) persist credentials
// and history outside the code directory.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SETTINGS_FILE = 'settings.json';
const POSTS_FILE = 'posts.json';
const MAX_POSTS = 500;

const DEFAULT_SETTINGS = {
  twitter: {
    apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '',
    username: '', name: '', connectedAt: null,
  },
  facebook: {
    appId: '', appSecret: '', pageId: '', pageToken: '', pageName: '',
    connectedAt: null,
  },
  instagram: {
    clientId: '', clientSecret: '', domain: 'instagram.com',
    igUserId: '', username: '', token: '', tokenExpiresAt: null,
    connectedAt: null,
  },
  linkedin: {
    clientId: '', clientSecret: '', memberId: '', name: '', token: '',
    tokenExpiresAt: null, connectedAt: null,
  },
};

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const target = path.join(DATA_DIR, file);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
}

// ---------- settings ----------

function getSettings() {
  const stored = readJson(SETTINGS_FILE, {});
  const merged = {};
  for (const [platform, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    merged[platform] = { ...defaults, ...(stored[platform] || {}) };
  }
  return merged;
}

function updateSettings(platform, patch) {
  if (!DEFAULT_SETTINGS[platform]) throw new Error(`Unknown platform: ${platform}`);
  const current = getSettings();
  const next = { ...current, [platform]: { ...current[platform], ...patch } };
  writeJson(SETTINGS_FILE, next);
  return next[platform];
}

function clearSettingsFields(platform, fields) {
  const patch = {};
  for (const f of fields) patch[f] = null;
  return updateSettings(platform, patch);
}

// ---------- posts ----------

let postsCache = null;

function getPosts() {
  if (!postsCache) postsCache = readJson(POSTS_FILE, { posts: [] }).posts || [];
  return postsCache;
}

function savePosts() {
  const posts = getPosts();
  writeJson(POSTS_FILE, { posts: posts.slice(0, MAX_POSTS) });
}

function addPost(post) {
  const posts = getPosts();
  posts.unshift(post);
  if (posts.length > MAX_POSTS) posts.length = MAX_POSTS;
  savePosts();
  return post;
}

function updatePost(id, post) {
  const posts = getPosts();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx !== -1) posts[idx] = post;
  savePosts();
}

module.exports = {
  DATA_DIR,
  getSettings,
  updateSettings,
  clearSettingsFields,
  getPosts,
  addPost,
  updatePost,
  savePosts,
};
