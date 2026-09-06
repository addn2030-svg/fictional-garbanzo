/**
 * Facebook — posting to a Facebook *Page* via the Graph API
 * (profile/timeline posting is not available through the public API).
 *
 * Setup: create an app at https://developers.facebook.com, add the
 * "Facebook Login" product, register the redirect URI, then either use the
 * in-app "Connect with Facebook" flow or paste a Page ID + Page access token.
 */
const { ApiError, requestJson } = require('../http');

const GRAPH_BASE = 'https://graph.facebook.com';
const VERSION = 'v23.0'; // Graph API version — bump when Meta deprecates
const LIMIT = 63206;
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';

const EDITABLE_FIELDS = ['appId', 'appSecret', 'pageId', 'pageToken'];
const CREDENTIAL_FIELDS = EDITABLE_FIELDS;
const SECRET_FIELDS = ['appSecret', 'pageToken'];
const DISCONNECT_CLEAR = ['pageId', 'pageName', 'pageToken', 'connectedAt'];

function isConnected(s) {
  return !!(s.connectedAt && s.pageId && s.pageToken);
}

function identity(s) {
  return s.pageName || null;
}

function validate({ text, imageUrl }) {
  const errors = [];
  const len = [...(text || '')].length;
  if (len > LIMIT) errors.push(`Text is ${len} characters — Facebook allows ${LIMIT}`);
  if (!text.trim() && !imageUrl) errors.push('Add text or an image');
  return errors;
}

function gUrl(path, params = {}) {
  const u = new URL(`${GRAPH_BASE}/${VERSION}/${String(path).replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u;
}

async function publish({ text, imageUrl }, s) {
  let postId;
  if (imageUrl) {
    const r = await requestJson(gUrl(`${s.pageId}/photos`, {
      url: imageUrl, caption: text || '', access_token: s.pageToken,
    }), { method: 'POST' });
    postId = r.post_id || r.id;
  } else {
    const r = await requestJson(gUrl(`${s.pageId}/feed`, {
      message: text, access_token: s.pageToken,
    }), { method: 'POST' });
    postId = r.id;
  }
  if (!postId) throw new ApiError(502, 'Facebook did not return a post id');
  let permalink = null;
  try {
    const p = await requestJson(gUrl(postId, { fields: 'permalink_url', access_token: s.pageToken }));
    permalink = p.permalink_url || null;
  } catch { /* permalink is best-effort */ }
  return { postId, permalink };
}

async function testConnection(s) {
  if (!s.pageId || !s.pageToken) throw new ApiError(400, 'Page ID and Page access token are required (use "Connect with Facebook" or paste them manually)');
  const data = await requestJson(gUrl(s.pageId, { fields: 'name', access_token: s.pageToken }));
  if (!data?.name) throw new ApiError(502, 'Could not read the Page name — is this a valid Page access token?');
  return { pageName: data.name };
}

const oauth = {
  buildAuthUrl(s, redirectUri, state) {
    if (!s.appId || !s.appSecret) return null;
    const u = new URL(`https://www.facebook.com/${VERSION}/dialog/oauth`);
    u.searchParams.set('client_id', s.appId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES);
    return u.toString();
  },

  /**
   * Exchange code → long-lived user token → list of Pages the user manages.
   * Returns { pages } — the caller picks one and stores pageId/pageToken.
   */
  async handleCallback(s, { code, redirectUri }) {
    const short = await requestJson(gUrl('oauth/access_token', {
      client_id: s.appId, client_secret: s.appSecret, redirect_uri: redirectUri, code,
    }));
    if (!short?.access_token) throw new ApiError(502, 'Facebook did not return an access token');
    const long = await requestJson(gUrl('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: s.appId,
      client_secret: s.appSecret,
      fb_exchange_token: short.access_token,
    }));
    const longToken = long?.access_token || short.access_token;
    const accounts = await requestJson(gUrl('me/accounts', {
      fields: 'name,access_token,category',
      limit: 100,
      access_token: longToken,
    }));
    const pages = (accounts?.data || []).map((p) => ({ id: p.id, name: p.name, access_token: p.access_token }));
    if (!pages.length) {
      throw new ApiError(400, 'No Facebook Pages found for your account — posting requires a Page you manage (personal profiles cannot be posted to via the API).');
    }
    return { pages };
  },
};

module.exports = {
  id: 'facebook',
  name: 'Facebook',
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
  oauth,
};
