/**
 * Runs the LivePost server in MOCK MODE: every platform API call is
 * redirected to the local mock (test/mock-platforms.js).
 *
 *   node test/mock-platforms.js     # terminal 1 — the mock APIs on :3100
 *   node test/with-mock-apis.js     # terminal 2 — LivePost on :3000
 *
 * No real credentials and no internet are needed. Nothing is posted to real
 * platforms in this mode.
 */
console.log('================================================================');
console.log(' LIVEPOST — MOCK MODE');
console.log(' Platform API calls are redirected to the local mock on :3100.');
console.log(' Nothing is posted to real social platforms.');
console.log('================================================================');

const MOCK = process.env.MOCK_PORT || '3100';
const REDIRECTS = [
  [/^https:\/\/api\.x\.com\/?/, `http://localhost:${MOCK}/`],
  [/^https:\/\/graph\.facebook\.com\/?/, `http://localhost:${MOCK}/`],
  [/^https:\/\/graph\.instagram\.com\/?/, `http://localhost:${MOCK}/`],
  [/^https:\/\/api\.linkedin\.com\/?/, `http://localhost:${MOCK}/`],
];
// If the mock is exposed behind a public URL (e.g. an e2b preview), also map
// that URL back to localhost so server-side fetches of it succeed.
if (process.env.MOCK_PUBLIC_URL) {
  const pub = process.env.MOCK_PUBLIC_URL.replace(/\/+$/, '');
  const escaped = pub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  REDIRECTS.push([new RegExp(`^${escaped}/?`), `http://localhost:${MOCK}/`]);
}

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input);
  for (const [re, to] of REDIRECTS) {
    if (re.test(url)) {
      const target = url.replace(re, to);
      console.log(`[mock-mode] ${url}  →  ${target}`);
      return realFetch(target, init);
    }
  }
  return realFetch(input, init);
};

require('../server/index.js');
