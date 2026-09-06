/**
 * LinkedIn — posting to your personal profile feed via the REST Posts API
 * (OAuth 2.0 authorization code flow, scope w_member_social).
 *
 * Setup: create an app at https://www.linkedin.com/developers (requires a
 * Company Page), add the "Share on LinkedIn" + "Sign In with LinkedIn using
 * OpenID Connect" products, register the redirect URL.
 * Access tokens last 60 days — reconnect when expired.
 */
const { ApiError, requestJson, downloadImage, networkErrorMessage } = require('../http');

const AUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const API_BASE = 'https://api.linkedin.com';
const LINKEDIN_VERSION = '202506'; // YYYYMM — bump to a recent version over time
const LIMIT = 3000;
const SCOPES = 'openid profile w_member_social'; // space separated
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const EDITABLE_FIELDS = ['clientId', 'clientSecret', 'token', 'memberId'];
const CREDENTIAL_FIELDS = EDITABLE_FIELDS;
const SECRET_FIELDS = ['clientSecret', 'token'];
const DISCONNECT_CLEAR = ['memberId', 'name', 'token', 'tokenExpiresAt', 'connectedAt'];

function isConnected(s) {
  return !!(s.connectedAt && s.memberId && s.token);
}

function identity(s) {
  return s.name || null;
}

function info(s) {
  if (!s.tokenExpiresAt) return null;
  const days = Math.round((new Date(s.tokenExpiresAt).getTime() - Date.now()) / 86400000);
  return { tokenDaysLeft: days };
}

function validate({ text }) {
  const errors = [];
  if (!text.trim()) errors.push('LinkedIn requires text (commentary)');
  const len = [...(text || '')].length;
  if (len > LIMIT) errors.push(`Text is ${len} characters — LinkedIn allows ${LIMIT}`);
  return errors;
}

function apiHeaders(s) {
  return {
    Authorization: `Bearer ${s.token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': LINKEDIN_VERSION,
  };
}

async function uploadImage(imageUrl, s) {
  const img = await downloadImage(imageUrl, { maxBytes: IMAGE_MAX_BYTES, allowedTypes: IMAGE_TYPES });
  const headers = { ...apiHeaders(s) };
  delete headers['Content-Type']; // initializeUpload sends its own JSON type
  headers['Content-Type'] = 'application/json';
  const init = await requestJson(`${API_BASE}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers,
    json: { initializeUploadRequest: { owner: `urn:li:person:${s.memberId}` } },
    timeoutMs: 45000,
  });
  const uploadUrl = init?.value?.uploadUrl;
  const imageUrn = init?.value?.image;
  if (!uploadUrl || !imageUrn) throw new ApiError(502, 'LinkedIn image upload could not be initialized (missing uploadUrl/image URN)');

  let putRes;
  try {
    putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': img.contentType },
      body: img.buffer,
    });
  } catch (e) {
    throw new ApiError(502, networkErrorMessage(uploadUrl, e));
  }
  if (!putRes.ok) {
    throw new ApiError(putRes.status, `LinkedIn image upload failed (HTTP ${putRes.status})`);
  }
  return imageUrn;
}

async function publish({ text, imageUrl }, s) {
  let content;
  if (imageUrl) {
    const imageUrn = await uploadImage(imageUrl, s);
    content = { media: { id: imageUrn } };
  }
  const body = {
    author: `urn:li:person:${s.memberId}`,
    commentary: text,
    visibility: 'PUBLIC',
    ...(content ? { content } : {}),
  };
  const headers = apiHeaders(s);
  let res, rawBody, json;
  try {
    res = await fetch(`${API_BASE}/rest/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    rawBody = await res.text();
    try { json = JSON.parse(rawBody); } catch { json = null; /* empty body is normal */ }
  } catch (e) {
    throw new ApiError(502, networkErrorMessage(`${API_BASE}/rest/posts`, e));
  }
  if (!res.ok) {
    const msg = json?.message || rawBody.slice(0, 300) || `HTTP ${res.status}`;
    let friendly = msg;
    if (res.status === 401 || res.status === 403) {
      friendly += ' — token expired or the app is missing the "Share on LinkedIn" product. Reconnect on the Connections tab.';
    }
    throw new ApiError(res.status, friendly);
  }
  const urn = json?.id || res.headers.get('x-restli-id') || res.headers.get('restli-id');
  if (!urn) throw new ApiError(502, 'LinkedIn did not return a post URN');
  return { postId: urn, permalink: `https://www.linkedin.com/feed/update/${urn}` };
}

async function testConnection(s) {
  if (!s.token) throw new ApiError(400, 'An access token is required (use "Connect with LinkedIn" or paste one manually)');
  const data = await requestJson(`${API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${s.token}` },
    timeoutMs: 20000,
  });
  if (!data?.sub) throw new ApiError(502, 'Could not read your LinkedIn profile — is the token still valid?');
  return { memberId: data.sub, name: data.name || '' };
}

const oauth = {
  buildAuthUrl(s, redirectUri, state) {
    if (!s.clientId || !s.clientSecret) return null;
    const params = [
      ['response_type', 'code'],
      ['client_id', s.clientId],
      ['redirect_uri', redirectUri],
      ['state', state],
      ['scope', SCOPES],
    ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return `${AUTH_BASE}/authorization?${params}`;
  },

  async handleCallback(s, { code, redirectUri }) {
    const tokenRes = await requestJson(`${AUTH_BASE}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: s.clientId,
        client_secret: s.clientSecret,
      },
    });
    const token = tokenRes?.access_token;
    if (!token) throw new ApiError(502, 'LinkedIn did not return an access token');
    const user = await requestJson(`${API_BASE}/v2/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 20000,
    });
    if (!user?.sub) throw new ApiError(502, 'Could not read your LinkedIn member id');
    return {
      patch: {
        token,
        memberId: user.sub,
        name: user.name || '',
        tokenExpiresAt: new Date(Date.now() + (tokenRes.expires_in || 5184000) * 1000).toISOString(),
      },
    };
  },
};

module.exports = {
  id: 'linkedin',
  name: 'LinkedIn',
  limit: LIMIT,
  requiresImage: false,
  EDITABLE_FIELDS,
  CREDENTIAL_FIELDS,
  SECRET_FIELDS,
  DISCONNECT_CLEAR,
  isConnected,
  identity,
  info,
  validate,
  publish,
  testConnection,
  oauth,
};
