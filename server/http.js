/**
 * Shared HTTP helpers: friendly API errors, image download, multipart builder.
 */
const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { res, text, json };
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return String(url); }
}

function networkErrorMessage(url, e) {
  const code = e?.cause?.code || e?.code || '';
  return `Could not reach ${hostOf(url)}${code ? ` (${code})` : ''} — check this server's internet connection, DNS, or firewall.`;
}

/**
 * POST/GET JSON to a platform API; throws ApiError with a readable message.
 */
async function requestJson(url, { method = 'GET', headers = {}, json, form, raw, timeoutMs } = {}) {
  const options = { method, headers: { ...headers } };
  if (json !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(json);
  } else if (form !== undefined) {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(form).toString();
  } else if (raw !== undefined) {
    options.headers['Content-Type'] = raw.contentType;
    options.body = raw.body;
  }
  let res, text, data;
  try {
    ({ res, text, json: data } = await fetchText(url, options, timeoutMs));
  } catch (e) {
    if (e?.name === 'AbortError') throw new ApiError(504, `Request to ${hostOf(url)} timed out`);
    throw new ApiError(502, networkErrorMessage(url, e));
  }
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      data?.error_description ||
      data?.detail ||
      (typeof data?.error === 'string' ? data.error : null) ||
      text.slice(0, 300) ||
      `HTTP ${res.status}`;
    let friendly = msg;
    if (res.status === 401 || res.status === 403) {
      friendly += ' — authentication failed (token expired, revoked, or the app lacks the required permission). Reconnect on the Connections tab.';
    } else if (res.status === 429) {
      friendly += ' — rate limited by the platform, try again later.';
    }
    throw new ApiError(res.status, friendly, text);
  }
  return data;
}

/**
 * Download an image from a public URL into memory (for platforms that need
 * the raw bytes: X media upload, LinkedIn image upload).
 */
async function downloadImage(url, { maxBytes = 10 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] } = {}) {
  if (!/^https?:\/\//i.test(url)) throw new ApiError(400, 'Image URL must start with http:// or https://');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new ApiError(504, `Downloading the image from ${hostOf(url)} timed out.`);
    throw new ApiError(502, `Could not download the image from ${hostOf(url)} — check the URL is publicly reachable.`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError(400, `Could not download the image (HTTP ${res.status}) — the URL must be publicly reachable.`);
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!allowedTypes.includes(contentType)) {
    throw new ApiError(400, `Unsupported image type "${contentType || 'unknown'}" — expected one of: ${allowedTypes.join(', ')}`);
  }
  const declaredLength = Number(res.headers.get('content-length') || 0);
  if (declaredLength && declaredLength > maxBytes) {
    throw new ApiError(400, `Image is ${(declaredLength / 1024 / 1024).toFixed(1)} MB — max is ${(maxBytes / 1024 / 1024).toFixed(0)} MB`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new ApiError(400, `Image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB — max is ${(maxBytes / 1024 / 1024).toFixed(0)} MB`);
  }
  if (buffer.length === 0) throw new ApiError(400, 'Downloaded image is empty');
  return { buffer, contentType };
}

/**
 * Build a multipart/form-data body without external deps.
 * fields: { name: { value: string|Buffer, filename?, contentType? } }
 */
function multipartBody(fields) {
  const boundary = '----livepost-' + crypto.randomUUID().replace(/-/g, '');
  const chunks = [];
  for (const [name, f] of Object.entries(fields)) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"`;
    if (f.filename) head += `; filename="${f.filename}"`;
    head += '\r\n';
    if (f.contentType) head += `Content-Type: ${f.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'utf8'));
    chunks.push(Buffer.isBuffer(f.value) ? f.value : Buffer.from(String(f.value), 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

module.exports = { ApiError, sleep, fetchText, requestJson, downloadImage, multipartBody, networkErrorMessage };
