/**
 * Local mock of the four platform APIs — lets you test LivePost end-to-end
 * without real credentials or internet access.
 *
 *   node test/mock-platforms.js        # → http://localhost:3100
 *
 * Emulates:
 *   X (Twitter)   /2/users/me · /2/tweets · /2/media/upload (INIT/APPEND/FINALIZE/STATUS)
 *                 — with REAL OAuth 1.0a HMAC-SHA1 signature verification
 *   Facebook      /v23.0/{pageId} · /feed · /photos · permalink lookups
 *   Instagram     /v23.0/me · /{igUserId}/media · container status · /media_publish · permalink
 *   LinkedIn      /v2/userinfo · /rest/images · uploads · /rest/posts
 *   Extras        /test-image.jpg (demo image) · /mock/* (clickable fake permalink pages)
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.MOCK_PORT || 3100);
const PUBLIC_BASE = process.env.MOCK_PUBLIC_BASE || `http://localhost:${PORT}`;

// Demo credentials accepted by the mock (use these in the LivePost UI/API)
const DEMO = {
  apiKey: 'demo-key', apiSecret: 'demo-secret',
  accessToken: 'demo-token', accessTokenSecret: 'demo-token-secret',
  pageId: 'demo_page', pageToken: 'demo-page-token',
  igUserId: '17841400000000123', igToken: 'demo-ig-token',
  liToken: 'demo-li-token',
  memberUrn: 'urn:li:person:demo_member_1',
};

// ---------- helpers ----------
function pe(s) { return encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function od(s) { return decodeURIComponent(String(s)); }

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Verify the OAuth 1.0a HMAC-SHA1 signature exactly like the real X API would. */
function verifyOAuth1(req, u) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('OAuth ')) return 'missing OAuth Authorization header';
  const oauth = {};
  for (const part of auth.slice(6).split(',')) {
    const m = part.trim().match(/^([^=]+)="(.*)"$/);
    if (m) oauth[od(m[1])] = od(m[2]);
  }
  if (oauth.oauth_consumer_key !== DEMO.apiKey) return 'unknown consumer key';
  if (oauth.oauth_token !== DEMO.accessToken) return 'unknown access token';
  if (oauth.oauth_signature_method !== 'HMAC-SHA1') return 'unsupported signature method';
  const signature = oauth.oauth_signature;
  const params = { ...oauth };
  delete params.oauth_signature;
  for (const [k, v] of u.searchParams.entries()) params[k] = v;
  const entries = Object.entries(params)
    .map(([k, v]) => [pe(k), pe(v)])
    .sort((a, b) => ((a[0] + '=' + a[1]) < (b[0] + '=' + b[1]) ? -1 : 1));
  const paramString = entries.map(([k, v]) => `${k}=${v}`).join('&');
  // The signature is computed against the real api.x.com host (the test
  // launcher only rewrites the destination, not the signing base).
  const baseString = [req.method, pe(`https://api.x.com${u.pathname}`), pe(paramString)].join('&');
  const signingKey = `${pe(DEMO.apiSecret)}&${pe(DEMO.accessTokenSecret)}`;
  const expected = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  return expected === signature ? null : `signature mismatch`;
}

let reqNo = 0;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);
  const n = ++reqNo;

  const send = (status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
    console.log(`[mock #${n}] ${req.method} ${u.pathname} → ${status}`);
  };

  try {
    // ---------- demo image ----------
    if (req.method === 'GET' && u.pathname === '/test-image.jpg') {
      const file = path.join(__dirname, 'demo-image.jpg');
      if (!fs.existsSync(file)) return send(404, { error: { message: 'test/demo-image.jpg missing' } });
      const buf = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length });
      res.end(buf);
      console.log(`[mock #${n}] GET /test-image.jpg → 200 (${buf.length} bytes)`);
      return;
    }

    // ---------- mock permalink pages ----------
    if (req.method === 'GET' && u.pathname.startsWith('/mock/')) {
      const [, , platform, id] = u.pathname.split('/');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Mock post</title>
        <style>body{font-family:system-ui;background:#0b0e14;color:#e6e9ef;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
        .box{background:#141822;border:1px solid #232936;border-radius:14px;padding:32px 40px;text-align:center}
        .p{color:#1d9bf0;font-weight:700;letter-spacing:.5em;text-transform:uppercase;font-size:12px}</style></head>
        <body><div class="box"><div class="p">${platform}</div>
        <h1 style="margin:8px 0 4px">Mock post page 🎉</h1>
        <p style="color:#9aa3b2;margin:0">id: <code>${id}</code></p>
        <p style="color:#9aa3b2;font-size:13px">This page is served by the local mock API — your post was accepted!</p>
        </div></body></html>`);
      console.log(`[mock #${n}] GET ${u.pathname} → 200 (mock page)`);
      return;
    }

    // ---------- root: demo credential sheet ----------
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Mock platform APIs</title></head>
        <body style="font-family:monospace;background:#0b0e14;color:#9fe8b5;padding:40px">
        <h2>Mock platform APIs are running</h2>
        <pre>${JSON.stringify(DEMO, null, 2)}</pre>
        </body></html>`);
      return;
    }

    // ---------- X (Twitter) API v2 ----------
    if (u.pathname === '/2/users/me' && req.method === 'GET') {
      const err = verifyOAuth1(req, u);
      if (err) return send(401, { title: 'Unauthorized', detail: `OAuth 1.0a verification failed: ${err}` });
      return send(200, { data: { id: '2244997642', name: 'Demo User', username: 'demo_user' } });
    }
    if (u.pathname === '/2/tweets' && req.method === 'POST') {
      const err = verifyOAuth1(req, u);
      if (err) return send(401, { title: 'Unauthorized', detail: `OAuth 1.0a verification failed: ${err}` });
      const b = JSON.parse(body.toString() || '{}');
      if (!b.text && !b.media) return send(400, { detail: 'Need text or media' });
      return send(201, { data: { id: String(1799999999999000 + reqNo), text: b.text || '' } });
    }
    if (u.pathname === '/2/media/upload') {
      const err = verifyOAuth1(req, u);
      if (err) return send(401, { title: 'Unauthorized', detail: `OAuth 1.0a verification failed: ${err}` });
      const cmd = u.searchParams.get('command');
      if (cmd === 'INIT') {
        const total = Number(u.searchParams.get('total_bytes'));
        const type = u.searchParams.get('media_type');
        if (!total || total <= 0) return send(400, { detail: 'invalid total_bytes' });
        if (!/^image\//.test(type || '')) return send(400, { detail: 'media_type must be an image/*' });
        return send(200, { data: { id: `m${Date.now()}`, expires_at: Date.now() + 86400000 } });
      }
      if (cmd === 'APPEND') {
        const ct = req.headers['content-type'] || '';
        if (!ct.startsWith('multipart/form-data')) return send(400, { detail: 'APPEND must be multipart/form-data' });
        if (!body || body.length < 64) return send(400, { detail: 'APPEND missing media bytes' });
        return send(200, {});
      }
      if (cmd === 'FINALIZE' || cmd === 'STATUS') {
        return send(200, { data: { id: u.searchParams.get('media_id'), processing_info: { state: 'succeeded' } } });
      }
      return send(400, { detail: `unknown command ${cmd}` });
    }

    // ---------- Graph-style /v23.0 (Facebook + Instagram) ----------
    if (u.pathname.startsWith('/v23.0/')) {
      const seg = u.pathname.split('/').filter(Boolean).slice(1); // after v23.0
      const form = new URLSearchParams(body.toString());
      const token = u.searchParams.get('access_token') || form.get('access_token');

      // Instagram profile
      if (seg[0] === 'me') {
        if (token !== DEMO.igToken) return send(401, { error: { message: 'Invalid OAuth access token', type: 'OAuthException' } });
        return send(200, { user_id: DEMO.igUserId, username: 'demo.creator', id: DEMO.igUserId });
      }
      // Instagram media container status
      if (seg.length === 1 && /^c\d+$/.test(seg[0])) {
        if (token !== DEMO.igToken) return send(401, { error: { message: 'Invalid OAuth access token' } });
        return send(200, { status_code: 'FINISHED' });
      }
      // Instagram published media permalink
      if (seg.length === 1 && /^igmedia_/.test(seg[0])) {
        if (token !== DEMO.igToken) return send(401, { error: { message: 'Invalid OAuth access token' } });
        return send(200, { permalink: `${PUBLIC_BASE}/mock/instagram/${seg[0]}`, id: seg[0] });
      }
      // Instagram container creation / publish
      if (seg[0] === DEMO.igUserId && seg.length === 2) {
        if (token !== DEMO.igToken) return send(401, { error: { message: 'Invalid OAuth access token', type: 'OAuthException' } });
        if (seg[1] === 'media' && req.method === 'POST') {
          if (!form.get('image_url')) return send(400, { error: { message: 'image_url is required', type: 'OAuthException' } });
          return send(200, { id: `c${Date.now()}` });
        }
        if (seg[1] === 'media_publish' && req.method === 'POST') {
          if (!form.get('creation_id')) return send(400, { error: { message: 'creation_id is required' } });
          return send(200, { id: `igmedia_${Date.now()}` });
        }
      }
      // Facebook page
      if (seg[0] === DEMO.pageId) {
        if (token !== DEMO.pageToken) return send(401, { error: { message: 'Invalid OAuth access token', type: 'OAuthException' } });
        if (seg.length === 1 && req.method === 'GET') return send(200, { name: 'Demo Page', id: DEMO.pageId });
        if (seg[1] === 'feed' && req.method === 'POST') {
          if (!u.searchParams.get('message')) return send(400, { error: { message: 'message required' } });
          return send(200, { id: `${DEMO.pageId}_${Date.now()}` });
        }
        if (seg[1] === 'photos' && req.method === 'POST') {
          if (!u.searchParams.get('url')) return send(400, { error: { message: 'url required' } });
          const photoId = String(Date.now());
          return send(200, { post_id: `${DEMO.pageId}_${photoId}`, id: photoId });
        }
      }
      // Facebook permalink lookup
      if (seg.length === 1 && req.method === 'GET' && u.searchParams.get('fields') === 'permalink_url') {
        if (token !== DEMO.pageToken) return send(401, { error: { message: 'Invalid OAuth access token' } });
        return send(200, { permalink_url: `${PUBLIC_BASE}/mock/facebook/${seg[0]}`, id: seg[0] });
      }
      return send(404, { error: { message: `unknown Graph endpoint ${u.pathname}`, type: 'GraphMethodException' } });
    }

    // ---------- LinkedIn ----------
    if (u.pathname === '/v2/userinfo' && req.method === 'GET') {
      if ((req.headers['authorization'] || '') !== `Bearer ${DEMO.liToken}`) {
        return send(401, { error: 'invalid_token', error_description: 'Invalid access token' });
      }
      return send(200, { sub: 'demo_member_1', name: 'Demo LinkedIn User' });
    }
    if (u.pathname === '/rest/images' && u.searchParams.get('action') === 'initializeUpload' && req.method === 'POST') {
      if ((req.headers['authorization'] || '') !== `Bearer ${DEMO.liToken}`) return send(401, { message: 'Unauthorized' });
      const b = JSON.parse(body.toString() || '{}');
      if (b.initializeUploadRequest?.owner !== DEMO.memberUrn) return send(400, { message: 'owner must be the demo member URN' });
      return send(200, { value: { uploadUrl: `${PUBLIC_BASE}/li-upload/img${Date.now()}`, image: `urn:li:image:demo_${Date.now()}` } });
    }
    if (u.pathname.startsWith('/li-upload/') && req.method === 'PUT') {
      if (!body || body.length < 64) return send(400, { message: 'missing image bytes' });
      return send(201, {});
    }
    if (u.pathname === '/rest/posts' && req.method === 'POST') {
      if ((req.headers['authorization'] || '') !== `Bearer ${DEMO.liToken}`) return send(401, { message: 'Unauthorized' });
      const b = JSON.parse(body.toString() || '{}');
      if (b.author !== DEMO.memberUrn) return send(400, { message: 'author must be the demo member URN' });
      if (!b.commentary && !b.content) return send(400, { message: 'commentary or content required' });
      const urn = `urn:li:share:demo_${Date.now()}`;
      return send(201, { id: urn }, { 'x-restli-id': urn });
    }

    return send(404, { error: { message: `no mock for ${req.method} ${u.pathname}` } });
  } catch (e) {
    return send(500, { error: { message: `mock crashed: ${e.message}` } });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock platform APIs → http://0.0.0.0:${PORT}`);
  console.log('Demo credentials:', JSON.stringify(DEMO, null, 2));
});
