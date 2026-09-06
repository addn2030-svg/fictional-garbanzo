/**
 * Instagram — "Instagram API with Instagram Login" (professional accounts).
 *
 * Setup: switch your Instagram account to Professional (Business/Creator),
 * create an app at https://developers.facebook.com with the "Instagram"
 * product (API setup with Instagram login), register the redirect URI.
 * Posting requires a publicly reachable JPEG image URL (4:5–1.91:1, ≤8MB).
 */
const { ApiError, sleep, requestJson } = require('../http');

const API_VERSION = 'v23.0';
const LIMIT = 2200;
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

const AUTH_HOSTS = {
  'instagram.com': 'https://www.instagram.com',
  'instagram.eu': 'https://www.instagram.eu',
};
const GRAPH_HOSTS = {
  'instagram.com': 'https://graph.instagram.com',
  'instagram.eu': 'https://graph.instagram.eu',
};

const EDITABLE_FIELDS = ['clientId', 'clientSecret', 'igUserId', 'token'];
const CREDENTIAL_FIELDS = EDITABLE_FIELDS;
const SECRET_FIELDS = ['clientSecret', 'token'];
const DISCONNECT_CLEAR = ['igUserId', 'token', 'username', 'tokenExpiresAt', 'connectedAt'];

function graphHost(s) {
  return GRAPH_HOSTS[s.domain] || GRAPH_HOSTS['instagram.com'];
}

function isConnected(s) {
  return !!(s.connectedAt && s.igUserId && s.token);
}

function identity(s) {
  return s.username ? `@${s.username}` : null;
}

function info(s) {
  if (!s.tokenExpiresAt) return null;
  const days = Math.round((new Date(s.tokenExpiresAt).getTime() - Date.now()) / 86400000);
  return { tokenDaysLeft: days };
}

function validate({ text, imageUrl }) {
  const errors = [];
  if (!imageUrl) errors.push('Instagram requires an image — add a public image URL (JPEG)');
  const len = [...(text || '')].length;
  if (len > LIMIT) errors.push(`Caption is ${len} characters — Instagram allows ${LIMIT}`);
  return errors;
}

async function publish({ text, imageUrl }, s) {
  const base = `${graphHost(s)}/${API_VERSION}`;
  const token = s.token;

  const container = await requestJson(new URL(`${base}/${s.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    form: { image_url: imageUrl, caption: text || '', access_token: token },
  });
  const containerId = container?.id;
  if (!containerId) throw new ApiError(502, 'Instagram did not return a media container id');

  // Poll the container until the media is ready (images are usually instant).
  let ready = false;
  for (let i = 0; i < 15; i++) {
    const st = await requestJson(new URL(`${base}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`), { timeoutMs: 20000 });
    if (st.status_code === 'FINISHED') { ready = true; break; }
    if (st.status_code === 'ERROR' || st.error) {
      throw new ApiError(502, 'Instagram could not process the image — it must be a JPEG, aspect ratio 4:5 to 1.91:1, ≤8MB, publicly reachable.');
    }
    await sleep(2000);
  }
  if (!ready) throw new ApiError(504, 'Instagram media processing timed out');

  const published = await requestJson(new URL(`${base}/${s.igUserId}/media_publish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    form: { creation_id: containerId, access_token: token },
  });
  const mediaId = published?.id;
  if (!mediaId) throw new ApiError(502, 'Instagram did not return a media id');
  let permalink = null;
  try {
    const det = await requestJson(new URL(`${base}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`), { timeoutMs: 20000 });
    permalink = det.permalink || null;
  } catch { /* best effort */ }
  return { postId: mediaId, permalink };
}

async function testConnection(s) {
  if (!s.igUserId || !s.token) throw new ApiError(400, 'Instagram User ID and access token are required (use "Connect with Instagram" or paste them manually)');
  const base = graphHost(s);
  const data = await requestJson(new URL(`${base}/${API_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(s.token)}`), { timeoutMs: 20000 });
  if (!data?.user_id && !data?.id) throw new ApiError(502, 'Could not read your Instagram profile — is the token still valid?');
  return { igUserId: String(data.user_id || data.id), username: data.username || '' };
}

const oauth = {
  buildAuthUrl(s, redirectUri, state) {
    if (!s.clientId || !s.clientSecret) return null;
    const host = AUTH_HOSTS[s.domain] || AUTH_HOSTS['instagram.com'];
    const u = new URL(`${host}/oauth/authorize`);
    u.searchParams.set('client_id', s.clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES);
    u.searchParams.set('state', state);
    return u.toString();
  },

  async handleCallback(s, { code, redirectUri }) {
    const base = graphHost(s);
    const tokenRes = await requestJson(new URL(`${base}/oauth/access_token`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      form: {
        client_id: s.clientId,
        client_secret: s.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    });
    const shortToken = tokenRes?.access_token;
    if (!shortToken) throw new ApiError(502, 'Instagram did not return an access token');

    // Exchange for a long-lived token (~60 days).
    const long = await requestJson(new URL(`${base}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(s.clientSecret)}&access_token=${encodeURIComponent(shortToken)}`), { timeoutMs: 20000 });
    const token = long?.access_token || shortToken;
    const expiresIn = long?.expires_in || 5184000;

    const me = await requestJson(new URL(`${base}/${API_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`), { timeoutMs: 20000 });
    return {
      patch: {
        token,
        igUserId: String(me?.user_id || me?.id || tokenRes?.user_id || ''),
        username: me?.username || '',
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
    };
  },
};

module.exports = {
  id: 'instagram',
  name: 'Instagram',
  limit: LIMIT,
  requiresImage: true,
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
