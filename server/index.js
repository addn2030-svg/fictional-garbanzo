/**
 * LivePost — live-post to X (Twitter), Facebook, Instagram and LinkedIn.
 * Express server: static dashboard + JSON API + OAuth callbacks.
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { publishPost } = require('./publish');
const platforms = require('./platforms');
const { ApiError } = require('./http');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------- helpers ----------------

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const nowIso = () => new Date().toISOString();
const publicOrigin = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

function maskSecret(v) {
  if (!v) return v;
  return v.length <= 4 ? '••••••' : '••••••' + v.slice(-4);
}

function publicSettings() {
  const settings = store.getSettings();
  const out = {};
  for (const [id, mod] of Object.entries(platforms)) {
    const p = { ...settings[id] };
    for (const f of mod.SECRET_FIELDS) if (p[f]) p[f] = maskSecret(p[f]);
    out[id] = p;
  }
  return out;
}

function platformStatus() {
  const settings = store.getSettings();
  const out = {};
  for (const [id, mod] of Object.entries(platforms)) {
    const s = settings[id];
    out[id] = {
      id,
      name: mod.name,
      connected: mod.isConnected(s),
      identity: mod.identity(s),
      requiresImage: !!mod.requiresImage,
      limit: mod.limit,
      supportsOAuth: !!mod.oauth,
      info: mod.info ? mod.info(s) : null,
    };
  }
  return out;
}

// OAuth state store (state → context), auto-expiring.
const pendingOAuth = new Map();
const OAUTH_TTL_MS = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingOAuth) if (now - v.createdAt > OAUTH_TTL_MS) pendingOAuth.delete(k);
}, 5 * 60 * 1000).unref();

function backToApp(res, params) {
  res.redirect(`/?${new URLSearchParams(params).toString()}`);
}

// ---------------- status / settings / posts ----------------

app.get('/api/status', (req, res) => {
  res.json({
    platforms: platformStatus(),
    redirectBase: publicOrigin(req),
  });
});

app.get('/api/settings', (req, res) => {
  res.json({ settings: publicSettings() });
});

/** Save credentials. Blank fields keep their saved value (merge semantics). */
app.put('/api/settings/:platform', (req, res) => {
  const mod = platforms[req.params.platform];
  if (!mod) return res.status(404).json({ error: 'Unknown platform' });
  const current = store.getSettings()[mod.id];
  const patch = {};
  let credentialsChanged = false;
  for (const f of mod.EDITABLE_FIELDS) {
    const v = req.body?.[f];
    if (typeof v === 'string' && v.trim() !== '') {
      patch[f] = v.trim();
      if (mod.CREDENTIAL_FIELDS.includes(f) && current[f] !== patch[f]) credentialsChanged = true;
    }
  }
  if (mod.id === 'instagram' && ['instagram.com', 'instagram.eu'].includes(req.body?.domain)) {
    if (patch.domain !== undefined || current.domain !== req.body.domain) patch.domain = req.body.domain;
  }
  if (credentialsChanged) patch.connectedAt = null;
  store.updateSettings(mod.id, patch);
  res.json({ ok: true });
});

/**
 * Save + verify credentials ("Save & test" / manual connect).
 * If required credentials are incomplete, just saves and reports what's missing.
 */
app.post('/api/connect/:platform', wrap(async (req, res) => {
  const mod = platforms[req.params.platform];
  if (!mod) return res.status(404).json({ error: 'Unknown platform' });

  // merge submitted fields (blank = keep existing)
  const current = store.getSettings()[mod.id];
  const merged = { ...current };
  const patch = {};
  for (const f of mod.EDITABLE_FIELDS) {
    const v = req.body?.[f];
    if (typeof v === 'string' && v.trim() !== '') { patch[f] = v.trim(); merged[f] = v.trim(); }
  }
  if (mod.id === 'instagram' && ['instagram.com', 'instagram.eu'].includes(req.body?.domain)) {
    patch.domain = req.body.domain; merged.domain = req.body.domain;
  }
  store.updateSettings(mod.id, patch);

  // figure out whether we can test right away
  const requiredForTest = {
    twitter: ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'],
    facebook: ['pageId', 'pageToken'],
    instagram: ['igUserId', 'token'],
    linkedin: ['token'],
  }[mod.id];
  const missing = requiredForTest.filter((f) => !merged[f]);
  if (missing.length) {
    return res.json({ ok: true, saved: true, needsMore: missing, needsMoreNote: `Saved. To finish connecting, ${mod.supportsOAuth ? 'click "Connect" or ' : ''}fill in: ${missing.join(', ')}` });
  }

  try {
    const identityPatch = await mod.testConnection(merged);
    store.updateSettings(mod.id, { ...identityPatch, connectedAt: nowIso() });
    const s2 = store.getSettings()[mod.id];
    res.json({ ok: true, connected: true, identity: mod.identity(s2) });
  } catch (e) {
    res.status(e instanceof ApiError ? Math.max(400, Math.min(599, e.status)) : 500)
      .json({ error: e.message || 'Connection test failed' });
  }
}));

/** Re-verify an already-connected platform. */
app.post('/api/test/:platform', wrap(async (req, res) => {
  const mod = platforms[req.params.platform];
  if (!mod) return res.status(404).json({ error: 'Unknown platform' });
  const s = store.getSettings()[mod.id];
  try {
    const identityPatch = await mod.testConnection(s);
    store.updateSettings(mod.id, { ...identityPatch, connectedAt: nowIso() });
    res.json({ ok: true, identity: mod.identity(store.getSettings()[mod.id]) });
  } catch (e) {
    res.status(e instanceof ApiError ? Math.max(400, Math.min(599, e.status)) : 500)
      .json({ error: e.message || 'Connection test failed' });
  }
}));

app.post('/api/disconnect/:platform', (req, res) => {
  const mod = platforms[req.params.platform];
  if (!mod) return res.status(404).json({ error: 'Unknown platform' });
  store.clearSettingsFields(mod.id, mod.DISCONNECT_CLEAR);
  res.json({ ok: true });
});

app.get('/api/posts', (req, res) => {
  res.json({ posts: store.getPosts().slice(0, 100) });
});

// ---------------- publish ----------------

app.post('/api/publish', wrap(async (req, res) => {
  const { text = '', imageUrl = '', platforms: selected = [] } = req.body || {};

  const errors = [];
  if (!String(text).trim() && !String(imageUrl).trim()) errors.push('Write some text or add an image URL first');
  if (!Array.isArray(selected) || selected.length === 0) errors.push('Select at least one platform');
  if (Array.isArray(selected)) {
    const unknown = selected.filter((p) => !platforms[p]);
    if (unknown.length) errors.push(`Unknown platform(s): ${unknown.join(', ')}`);
  }
  if (String(imageUrl).trim() && !/^https?:\/\//i.test(String(imageUrl).trim())) {
    errors.push('Image URL must start with http:// or https://');
  }

  const settings = store.getSettings();
  for (const p of (Array.isArray(selected) ? selected : [])) {
    const mod = platforms[p];
    if (!mod) continue;
    if (!mod.isConnected(settings[p])) {
      errors.push(`${mod.name} is not connected — add credentials on the Connections tab`);
      continue;
    }
    for (const e of mod.validate({ text: String(text), imageUrl: String(imageUrl).trim() })) {
      errors.push(`${mod.name}: ${e}`);
    }
  }

  if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

  const post = await publishPost({
    text: String(text).trim(),
    imageUrl: String(imageUrl).trim(),
    platforms: selected,
  });
  res.json({ post });
}));

// ---------------- OAuth flows (Facebook, Instagram, LinkedIn) ----------------

app.get('/oauth/:platform/start', (req, res) => {
  const mod = platforms[req.params.platform];
  if (!mod || !mod.oauth) return res.status(404).send('Unknown OAuth platform');
  const s = store.getSettings()[mod.id];
  const redirectUri = `${publicOrigin(req)}/oauth/${mod.id}/callback`;
  const authUrl = mod.oauth.buildAuthUrl(s, redirectUri, 'pending');
  if (!authUrl) {
    return backToApp(res, { tab: 'connections', error: `${mod.name}: save your App ID / Client ID and secret first, then click Connect.` });
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingOAuth.set(state, { platform: mod.id, redirectUri, createdAt: Date.now() });
  const url = mod.oauth.buildAuthUrl(s, redirectUri, state);
  res.redirect(url);
});

app.get('/oauth/:platform/callback', wrap(async (req, res) => {
  const mod = platforms[req.params.platform];
  if (!mod || !mod.oauth) return res.status(404).send('Unknown OAuth platform');
  const { code, state, error: oauthError, error_description: oauthErrorDesc } = req.query;

  if (oauthError) {
    return backToApp(res, { tab: 'connections', error: `${mod.name}: ${oauthErrorDesc || oauthError}` });
  }
  const pending = pendingOAuth.get(String(state || ''));
  if (!pending || pending.platform !== mod.id || Date.now() - pending.createdAt > OAUTH_TTL_MS) {
    return backToApp(res, { tab: 'connections', error: `${mod.name}: login session expired — try connecting again.` });
  }

  const s = store.getSettings()[mod.id];
  try {
    const result = await mod.oauth.handleCallback(s, { code: String(code), redirectUri: pending.redirectUri });

    // Facebook returns a list of Pages — pick one (auto if single, picker if many).
    if (result.pages) {
      if (result.pages.length === 1) {
        const page = result.pages[0];
        store.updateSettings('facebook', {
          pageId: page.id, pageName: page.name, pageToken: page.access_token, connectedAt: nowIso(),
        });
        pendingOAuth.delete(String(state));
        return backToApp(res, { tab: 'connections', connected: 'facebook', identity: page.name });
      }
      pending.pages = result.pages;
      return res.send(pagePickerHtml(result.pages, String(state)));
    }

    store.updateSettings(mod.id, { ...(result.patch || {}), connectedAt: nowIso() });
    pendingOAuth.delete(String(state));
    const s2 = store.getSettings()[mod.id];
    backToApp(res, { tab: 'connections', connected: mod.id, identity: mod.identity(s2) || '' });
  } catch (e) {
    backToApp(res, { tab: 'connections', error: `${mod.name}: ${e.message || 'OAuth failed'}` });
  }
}));

/** Facebook Page picker (shown when the account manages multiple Pages). */
app.get('/oauth/facebook/select', (req, res) => {
  const { state, index } = req.query;
  const pending = pendingOAuth.get(String(state || ''));
  if (!pending || pending.platform !== 'facebook' || !pending.pages) {
    return backToApp(res, { tab: 'connections', error: 'Facebook: session expired — connect again.' });
  }
  const page = pending.pages[Number(index)];
  if (!page) return backToApp(res, { tab: 'connections', error: 'Facebook: invalid page selection.' });
  pendingOAuth.delete(String(state));
  store.updateSettings('facebook', {
    pageId: page.id, pageName: page.name, pageToken: page.access_token, connectedAt: nowIso(),
  });
  backToApp(res, { tab: 'connections', connected: 'facebook', identity: page.name });
});

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pagePickerHtml(pages, state) {
  const items = pages.map((p, i) => `
    <a class="page" href="/oauth/facebook/select?state=${encodeURIComponent(state)}&index=${i}">
      <span class="page-name">${esc(p.name)}</span>
      <span class="page-id">ID: ${esc(p.id)}</span>
    </a>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Choose a Facebook Page</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0b0e14;color:#e6e9ef;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
    .box{max-width:420px;width:100%;background:#141822;border:1px solid #232936;border-radius:14px;padding:28px}
    h1{font-size:18px;margin:0 0 6px}
    p{color:#9aa3b2;font-size:13px;margin:0 0 18px}
    a.page{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:#e6e9ef;background:#1b202c;border:1px solid #2a3142;border-radius:10px;padding:14px 16px;margin-bottom:10px}
    a.page:hover{border-color:#1877f2}
    .page-name{font-weight:600}.page-id{color:#8a93a3;font-size:12px}
  </style></head><body><div class="box">
  <h1>Choose a Facebook Page</h1>
  <p>Your account manages multiple Pages. Pick the one LivePost should publish to.</p>
  ${items}
  </div></body></html>`;
}

// ---------------- errors / start ----------------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[livepost]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

store.DATA_DIR && require('fs').mkdirSync(store.DATA_DIR, { recursive: true });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LivePost running → http://0.0.0.0:${PORT}`);
  console.log('Platforms: X (Twitter), Facebook, Instagram, LinkedIn — configure credentials on the Connections tab.');
});
