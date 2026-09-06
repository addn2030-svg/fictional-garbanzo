/**
 * X (Twitter) — API v2, OAuth 1.0a user context.
 *
 * Setup: create an app at https://developer.x.com, set App permissions to
 * "Read and write", then generate your own Access Token & Secret and paste
 * all four keys in the app.
 */
const { oauth1Header } = require('../oauth1');
const { ApiError, sleep, requestJson, downloadImage, multipartBody } = require('../http');

const API_BASE = 'https://api.x.com';
const LIMIT = 280;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const EDITABLE_FIELDS = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'];
const CREDENTIAL_FIELDS = EDITABLE_FIELDS;
const SECRET_FIELDS = ['apiSecret', 'accessToken', 'accessTokenSecret'];
const DISCONNECT_CLEAR = ['username', 'name', 'connectedAt'];

function isConnected(s) {
  return !!(s.connectedAt && s.apiKey && s.apiSecret && s.accessToken && s.accessTokenSecret);
}

function identity(s) {
  return s.username ? `@${s.username}` : null;
}

function validate({ text, imageUrl }) {
  const errors = [];
  const len = [...(text || '')].length;
  if (len > LIMIT) errors.push(`Text is ${len} characters — X allows ${LIMIT}`);
  if (!text.trim() && !imageUrl) errors.push('Add text or an image');
  return errors;
}

/** Signed request to the X API. Query params are part of the OAuth signature. */
async function xRequest(path, { method = 'GET', query = {}, json, raw }, s) {
  const url = `${API_BASE}${path}`;
  const auth = oauth1Header(method, url, query, {
    consumerKey: s.apiKey,
    consumerSecret: s.apiSecret,
    token: s.accessToken,
    tokenSecret: s.accessTokenSecret,
  });
  const fullUrl = new URL(url);
  for (const [k, v] of Object.entries(query)) fullUrl.searchParams.set(k, String(v));

  try {
    return await requestJson(fullUrl, {
      method,
      headers: { Authorization: auth },
      json: json !== undefined ? json : undefined,
      raw,
      timeoutMs: 45000,
    });
  } catch (e) {
    // requestJson already adds friendly 401/429 hints; add X-specific detail.
    if (e instanceof ApiError) {
      if (e.detail) {
        try {
          const d = JSON.parse(e.detail);
          const specific = d?.detail || d?.errors?.[0]?.message || d?.title;
          if (specific) e.message = `${specific} (HTTP ${e.status})`;
        } catch { /* keep generic message */ }
      }
      if (e.status === 403 && /manage\/posts|subscription/i.test(e.message)) {
        e.message += ' Your X API tier may not allow posting (free tier has limited posts/month).';
      }
    }
    throw e;
  }
}

async function uploadMedia(imageUrl, s) {
  const img = await downloadImage(imageUrl, { maxBytes: IMAGE_MAX_BYTES, allowedTypes: IMAGE_TYPES });
  const init = await xRequest('/2/media/upload', {
    method: 'POST',
    query: { command: 'INIT', total_bytes: img.buffer.length, media_type: img.contentType, media_category: 'tweet_image' },
  }, s);
  const mediaId = init?.data?.id || init?.media_id_string || init?.id;
  if (!mediaId) throw new ApiError(502, 'X media upload failed at INIT (no media id returned)');

  const mp = multipartBody({
    media: { value: img.buffer, filename: `image${extFor(img.contentType)}`, contentType: img.contentType },
  });
  await xRequest('/2/media/upload', {
    method: 'POST',
    query: { command: 'APPEND', media_id: mediaId, segment_index: 0 },
    raw: mp,
  }, s);

  let status = await xRequest('/2/media/upload', {
    method: 'POST',
    query: { command: 'FINALIZE', media_id: mediaId },
  }, s);

  let tries = 0;
  while (['pending', 'in_progress'].includes(status?.data?.processing_info?.state)) {
    if (++tries > 15) throw new ApiError(504, 'X media processing timed out');
    await sleep(2000);
    status = await xRequest('/2/media/upload', {
      method: 'GET',
      query: { command: 'STATUS', media_id: mediaId },
    }, s);
  }
  if (status?.data?.processing_info?.state === 'failed') {
    const why = status.data.processing_info.error?.message || 'unknown error';
    throw new ApiError(502, `X media processing failed: ${why}`);
  }
  return String(mediaId);
}

function extFor(contentType) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }[contentType] || '.jpg';
}

async function publish({ text, imageUrl }, s) {
  let mediaId = null;
  if (imageUrl) mediaId = await uploadMedia(imageUrl, s);
  const body = { text: text || '' };
  if (mediaId) body.media = { media_ids: [mediaId] };
  const data = await xRequest('/2/tweets', { method: 'POST', json: body }, s);
  const id = data?.data?.id;
  if (!id) throw new ApiError(502, 'X did not return a post id');
  return { postId: String(id), permalink: `https://x.com/i/web/status/${id}` };
}

async function testConnection(s) {
  const data = await xRequest('/2/users/me', { query: { 'user.fields': 'username,name' } }, s);
  if (!data?.data?.username) throw new ApiError(502, 'Could not read your X profile');
  return { username: data.data.username, name: data.data.name };
}

module.exports = {
  id: 'twitter',
  name: 'X (Twitter)',
  limit: LIMIT,
  requiresImage: false,
  EDITABLE_FIELDS,
  CREDENTIAL_FIELDS,
  SECRET_FIELDS,
  DISCONNECT_CLEAR,
  isConnected,
  identity,
  validate,
  publish,
  testConnection,
  oauth: null, // X uses pasted keys (OAuth 1.0a), no redirect flow needed
};
