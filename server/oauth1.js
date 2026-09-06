/**
 * Minimal OAuth 1.0a (HMAC-SHA1) header signer — used for X (Twitter) API v2
 * with user context (consumer key/secret + access token/secret).
 */
const crypto = require('crypto');

function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * @param {string} method      HTTP method (GET, POST, ...)
 * @param {string} url         Base URL WITHOUT query string
 * @param {object} queryParams Query params (included in the signature)
 * @param {object} creds       { consumerKey, consumerSecret, token, tokenSecret }
 * @returns {string} Authorization header value
 */
function oauth1Header(method, url, queryParams, creds) {
  const oauthParams = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.token,
    oauth_version: '1.0',
  };

  const all = { ...oauthParams, ...(queryParams || {}) };
  // OAuth 1.0a: parameters sorted by encoded key, then encoded value.
  const entries = Object.entries(all).map(([k, v]) => [percentEncode(k), percentEncode(v)]);
  entries.sort((a, b) => ((a[0] + '=' + a[1]) < (b[0] + '=' + b[1]) ? -1 : 1));
  const paramString = entries.map(([k, v]) => `${k}=${v}`).join('&');

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join('&');
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret || '')}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return 'OAuth ' + Object.keys(headerParams)
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ');
}

module.exports = { oauth1Header, percentEncode };
