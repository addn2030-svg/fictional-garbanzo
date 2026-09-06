/* LivePost dashboard — compose, publish live, review history, manage connections. */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : ''}`;
    el.textContent = msg;
    $('#toast-wrap').appendChild(el);
    setTimeout(() => el.remove(), 6500);
  }

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ago`;
    return `${Math.floor(h / 24)} d ago`;
  }

  // ---------- platform metadata ----------
  const ICONS = {
    twitter: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.8" cy="6.2" r="1.3" fill="currentColor" stroke="none"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>',
  };

  const PLATFORMS = {
    twitter: { name: 'X (Twitter)', short: 'X', cssVar: '--x', limit: 280, requiresImage: false },
    facebook: { name: 'Facebook', short: 'Facebook', cssVar: '--fb', limit: 63206, requiresImage: false },
    instagram: { name: 'Instagram', short: 'Instagram', cssVar: '--ig', limit: 2200, requiresImage: true },
    linkedin: { name: 'LinkedIn', short: 'LinkedIn', cssVar: '--li', limit: 3000, requiresImage: false },
  };
  const PLATFORM_IDS = Object.keys(PLATFORMS);

  // ---------- state ----------
  const state = {
    status: null,     // /api/status
    settings: null,   // /api/settings (secrets masked)
    posts: [],
    selected: new Set(),
    publishing: false,
  };

  // ---------- tabs ----------
  function setTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tabpanel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
    if (name === 'history') loadPosts();
    if (name === 'connections') { loadStatus(); loadSettings(); }
    history.replaceState(null, '', `?tab=${name}`);
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

  // ---------- data loading ----------
  async function loadStatus() {
    try {
      state.status = await api('/api/status');
      renderDots();
      renderToggles();
      updateCompose();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function loadSettings() {
    try {
      state.settings = (await api('/api/settings')).settings;
      renderConnections();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function loadPosts() {
    try {
      state.posts = (await api('/api/posts')).posts;
      renderHistory();
      const badge = $('#history-count');
      badge.textContent = state.posts.length ? String(state.posts.length) : '';
    } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- header dots ----------
  function renderDots() {
    const strip = $('#dot-strip');
    if (!state.status) { strip.innerHTML = ''; return; }
    strip.innerHTML = PLATFORM_IDS.map((p) => {
      const st = state.status.platforms[p];
      return `<span class="pdot ${st.connected ? 'on' : ''}" title="${esc(st.name)}: ${st.connected ? `connected (${st.identity || 'ok'})` : 'not connected'}"></span>`;
    }).join('');
  }

  // ---------- compose ----------
  function connected(p) { return !!(state.status && state.status.platforms[p] && state.status.platforms[p].connected); }

  function renderToggles() {
    const wrap = $('#platform-toggles');
    wrap.innerHTML = PLATFORM_IDS.map((p) => {
      const meta = PLATFORMS[p];
      const ok = connected(p);
      const sel = state.selected.has(p);
      const warn = p === 'instagram' && sel && !$('#post-image').value.trim();
      return `
        <button type="button" class="ptoggle ${sel ? 'selected' : ''} ${ok ? '' : 'disabled'}"
          data-platform="${p}" style="--pc: var(${meta.cssVar})" title="${ok ? '' : 'Not connected — set it up on the Connections tab'}">
          <span class="picon">${ICONS[p]}</span>${esc(meta.name)}
          ${warn ? '<span class="warnflag" title="Instagram requires an image URL">⚠ needs image</span>' : ''}
        </button>`;
    }).join('');
  }

  $('#platform-toggles').addEventListener('click', (e) => {
    const btn = e.target.closest('.ptoggle');
    if (!btn) return;
    const p = btn.dataset.platform;
    if (!connected(p)) {
      toast(`${PLATFORMS[p].name} is not connected — add credentials first.`, 'err');
      setTab('connections');
      return;
    }
    if (state.selected.has(p)) state.selected.delete(p); else state.selected.add(p);
    updateCompose();
  });

  function clientProblems() {
    const text = $('#post-text').value;
    const imageUrl = $('#post-image').value.trim();
    const problems = [];
    if (!text.trim() && !imageUrl) problems.push('Write some text or add an image URL');
    if (state.selected.size === 0) problems.push('Select at least one platform');
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) problems.push('Image URL must start with http:// or https://');
    for (const p of state.selected) {
      const len = [...text].length;
      if (p === 'twitter' && len > 280) problems.push(`X (Twitter): text is ${len} characters (max 280)`);
      if (p === 'instagram' && !imageUrl) problems.push('Instagram: an image URL is required');
      if (p === 'instagram' && [...text].length > 2200) problems.push('Instagram: caption is over 2,200 characters');
      if (p === 'linkedin' && !text.trim()) problems.push('LinkedIn: text is required');
      if (p === 'linkedin' && len > 3000) problems.push('LinkedIn: text is over 3,000 characters');
    }
    return problems;
  }

  function renderCounters() {
    const text = $('#post-text').value;
    const wrap = $('#counters');
    if (state.selected.size === 0) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = [...state.selected].map((p) => {
      const len = [...text].length;
      const limit = PLATFORMS[p].limit;
      return `<span class="counter ${len > limit ? 'over' : ''}">${esc(PLATFORMS[p].short)} ${len}/${limit}</span>`;
    }).join('');
  }

  function previewCard(p, text, imageUrl) {
    const meta = PLATFORMS[p];
    const who = (state.status && state.status.platforms[p] && state.status.platforms[p].identity) || 'You';
    const initial = String(who).replace(/^@/, '').charAt(0).toUpperCase() || 'Y';

    if (p === 'instagram' && !imageUrl) {
      return `<div class="pv placeholder-box" style="--pc: var(${meta.cssVar})">Instagram needs a public image URL (JPEG)</div>`;
    }

    const imgTag = imageUrl
      ? `<div class="${p === 'instagram' ? 'pv-img-wrap' : ''}"><img class="pv-img" src="${esc(imageUrl)}" alt="post image" onerror="this.outerHTML='<div class=\\'pv-empty pv-note\\'>Image failed to load — is the URL public?</div>'"></div>`
      : '';

    let note = '';
    if (p === 'linkedin' && !text.trim()) note = '<div class="pv-note">LinkedIn requires text (commentary)</div>';
    if (p === 'instagram' && [...text].length > 2200) note = '<div class="pv-note">Caption exceeds 2,200 characters</div>';

    const bodyText = text.trim()
      ? `<div class="pv-body">${esc(text)}</div>`
      : '<div class="pv-body"><span class="pv-empty">No text — image-only post</span></div>';

    return `
      <div class="pv ${p === 'instagram' ? 'ph-ig' : ''}" style="--pc: var(${meta.cssVar})">
        <div class="pv-head">
          <span class="pv-avatar">${esc(initial)}</span>
          <span class="who">${esc(who)}</span> · just now
          <span class="platform-tag">${ICONS[p]} ${esc(meta.name)} preview</span>
        </div>
        ${bodyText}
        ${imgTag}
        ${note}
      </div>`;
  }

  function renderPreviews() {
    const text = $('#post-text').value;
    const imageUrl = $('#post-image').value.trim();
    const wrap = $('#previews');
    if (state.selected.size === 0) {
      wrap.innerHTML = '<div class="pv placeholder-box">Select platforms above to see live previews</div>';
      return;
    }
    wrap.innerHTML = [...state.selected].map((p) => previewCard(p, text, imageUrl)).join('');
  }

  function updateCompose() {
    const problems = clientProblems();
    const btn = $('#publish-btn');
    btn.disabled = problems.length > 0 || state.publishing;
    const hint = $('#publish-hint');
    hint.classList.toggle('error', problems.length > 0);
    hint.textContent = problems.length ? problems[0] : 'Goes out immediately to every selected platform.';
    renderCounters();
    renderToggles();
    renderPreviews();
  }

  ['#post-text', '#post-image'].forEach((sel) => $(sel).addEventListener('input', updateCompose));

  // ---------- publish ----------
  $('#publish-btn').addEventListener('click', async () => {
    if (state.publishing) return;
    state.publishing = true;
    const btn = $('#publish-btn');
    btn.disabled = true;
    $('.btn-label', btn).textContent = 'Publishing…';
    $('.spinner', btn).classList.remove('hidden');
    $('#publish-results').innerHTML = '';

    try {
      const data = await api('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          text: $('#post-text').value,
          imageUrl: $('#post-image').value.trim(),
          platforms: [...state.selected],
        }),
      });
      renderPublishResults(data.post);
      const okCount = Object.values(data.post.results).filter((r) => r.status === 'success').length;
      const total = Object.keys(data.post.results).length;
      if (okCount === total) toast(`Live on all ${total} platform${total > 1 ? 's' : ''} 🎉`, 'ok');
      else if (okCount > 0) toast(`Published to ${okCount}/${total} platforms — check failures below`, 'err');
      else toast('Publish failed on all platforms — see details below', 'err');
      loadPosts();
    } catch (e) {
      $('#publish-hint').textContent = e.message;
      $('#publish-hint').classList.add('error');
      toast(e.message, 'err');
    } finally {
      state.publishing = false;
      $('.btn-label', btn).textContent = 'Publish now';
      $('.spinner', btn).classList.add('hidden');
      updateCompose();
    }
  });

  function renderPublishResults(post) {
    const wrap = $('#publish-results');
    const rows = Object.entries(post.results).map(([p, r]) => {
      const meta = PLATFORMS[p] || { name: p };
      let msg;
      if (r.status === 'success') {
        msg = `Published${r.permalink ? ` — <a href="${esc(r.permalink)}" target="_blank" rel="noopener">View post ↗</a>` : ''}`;
      } else if (r.status === 'error') {
        msg = esc(r.error);
      } else {
        msg = 'Still publishing…';
      }
      return `<div class="rp-row ${r.status}">
        <span class="pname" style="color: var(${meta.cssVar || '--accent'})">${ICONS[p] || ''} ${esc(meta.name)}</span>
        <span class="pmsg">${msg}</span>
      </div>`;
    }).join('');
    const okCount = Object.values(post.results).filter((r) => r.status === 'success').length;
    wrap.innerHTML = `<div class="result-panel">
      <div class="rp-title">Live results — ${okCount}/${Object.keys(post.results).length} platforms</div>
      ${rows}
    </div>`;
  }

  // ---------- history ----------
  function renderHistory() {
    const wrap = $('#history-list');
    if (!state.posts.length) {
      wrap.innerHTML = '<div class="empty">No posts yet — compose your first live post.</div>';
      return;
    }
    wrap.innerHTML = state.posts.map((post) => {
      const chips = Object.entries(post.results || {}).map(([p, r]) => {
        const meta = PLATFORMS[p] || { name: p };
        let st;
        if (r.status === 'success') {
          st = `<span class="st-ok">✓</span>${r.permalink ? `<a href="${esc(r.permalink)}" target="_blank" rel="noopener">View</a>` : ''}`;
        } else if (r.status === 'error') {
          st = `<span class="st-err" title="${esc(r.error)}">✕</span>`;
        } else {
          st = '<span class="st-pub">…</span>';
        }
        return `<span class="chip">${ICONS[p] || ''} ${esc(meta.short || meta.name)} ${st}</span>`;
      }).join('');
      const img = post.imageUrl ? `<img class="hi-img" src="${esc(post.imageUrl)}" alt="" onerror="this.style.display='none'">` : '';
      return `<div class="history-item">
        <div class="hi-top">
          <span class="hi-date" title="${esc(new Date(post.createdAt).toLocaleString())}">${timeAgo(post.createdAt)} · ${esc(new Date(post.createdAt).toLocaleString())}</span>
        </div>
        <p class="hi-text clamped">${esc(post.text || '(image-only post)')}</p>
        ${img}
        <div class="hi-platforms">${chips}</div>
      </div>`;
    }).join('');
  }
  $('#refresh-history').addEventListener('click', loadPosts);

  // ---------- connections ----------
  const CONN_FORMS = {
    twitter: {
      sections: [
        {
          title: 'API keys (OAuth 1.0a user context)',
          fields: [
            { key: 'apiKey', label: 'API Key (Consumer Key)' },
            { key: 'apiSecret', label: 'API Key Secret', secret: true },
            { key: 'accessToken', label: 'Access Token', secret: true },
            { key: 'accessTokenSecret', label: 'Access Token Secret', secret: true },
          ],
          actions: [{ type: 'saveTest', label: 'Save & test' }],
        },
      ],
    },
    facebook: {
      oauthLabel: 'Connect with Facebook',
      sections: [
        {
          title: 'Facebook app credentials',
          fields: [
            { key: 'appId', label: 'App ID' },
            { key: 'appSecret', label: 'App Secret', secret: true },
          ],
          actions: [{ type: 'oauth', label: 'Connect with Facebook' }, { type: 'save', label: 'Save' }],
        },
        {
          title: 'Manual (alternative): paste Page credentials',
          fields: [
            { key: 'pageId', label: 'Page ID' },
            { key: 'pageToken', label: 'Page Access Token', secret: true },
          ],
          actions: [{ type: 'saveTest', label: 'Save & test connection' }],
        },
      ],
    },
    instagram: {
      oauthLabel: 'Connect with Instagram',
      domainSelect: true,
      sections: [
        {
          title: 'Instagram app credentials',
          fields: [
            { key: 'clientId', label: 'Client ID' },
            { key: 'clientSecret', label: 'Client Secret', secret: true },
          ],
          actions: [{ type: 'oauth', label: 'Connect with Instagram' }, { type: 'save', label: 'Save' }],
        },
        {
          title: 'Manual (alternative): paste token',
          fields: [
            { key: 'igUserId', label: 'Instagram User ID' },
            { key: 'token', label: 'Long-lived Access Token', secret: true },
          ],
          actions: [{ type: 'saveTest', label: 'Save & test connection' }],
        },
      ],
    },
    linkedin: {
      oauthLabel: 'Connect with LinkedIn',
      sections: [
        {
          title: 'LinkedIn app credentials',
          fields: [
            { key: 'clientId', label: 'Client ID' },
            { key: 'clientSecret', label: 'Client Secret', secret: true },
          ],
          actions: [{ type: 'oauth', label: 'Connect with LinkedIn' }, { type: 'save', label: 'Save' }],
        },
        {
          title: 'Manual (alternative): paste token',
          fields: [
            { key: 'token', label: 'Access Token', secret: true },
          ],
          actions: [{ type: 'saveTest', label: 'Save & test connection' }],
        },
      ],
    },
  };

  const STEPS = {
    twitter: `<ol>
      <li>Create a project + app at <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noopener">developer.x.com</a>.</li>
      <li>In the app: <b>Settings → App permissions → Read and write</b> → Save.</li>
      <li><b>Keys and tokens</b> → copy your <b>API Key</b> and <b>API Key Secret</b>.</li>
      <li>Under "Authentication tokens" click <b>Generate</b> for the Access Token &amp; Secret — do this <i>after</i> setting Read+Write.</li>
      <li>Paste all four keys here → <b>Save &amp; test</b>.</li>
    </ol><div class="note">Free tier allows a limited number of posts per day/month. The keys belong to the X account that will post.</div>`,
    facebook: `<ol>
      <li>Create an app at <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a> (type "Business").</li>
      <li>Add the <b>Facebook Login</b> product.</li>
      <li>In its settings, add the Redirect URI (below) to <b>Valid OAuth Redirect URIs</b>.</li>
      <li>Make sure you have a role on the app (App Roles → Admin) so posting works without App Review.</li>
      <li>Click <b>Connect with Facebook</b> and choose the Page to post to.</li>
    </ol><div class="note">The Graph API can only post to <b>Pages</b> — not personal profiles. Alternative: paste a Page ID + Page access token manually.</div>`,
    instagram: `<ol>
      <li>Switch your Instagram account to <b>Professional</b> (Business or Creator) in the Instagram app.</li>
      <li>Create an app at <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a>, add the <b>Instagram</b> product → "API setup with Instagram login".</li>
      <li>Copy the Client ID / Client Secret here, and register the Redirect URI (below) in the Instagram product settings.</li>
      <li>App Roles → <b>Instagram Testers</b> → add your own Instagram account, then accept the invite in the Instagram app (Settings → Apps and websites).</li>
      <li>Click <b>Connect with Instagram</b>.</li>
    </ol><div class="note">Posts need a publicly reachable <b>JPEG</b> image URL (aspect 4:5–1.91:1, ≤8MB). EU-created apps: switch the domain below to instagram.eu.</div>`,
    linkedin: `<ol>
      <li>Create an app at <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener">linkedin.com/developers</a> (requires a Company Page you administer).</li>
      <li>Add the products <b>Share on LinkedIn</b> and <b>Sign In with LinkedIn using OpenID Connect</b>.</li>
      <li>Auth tab → <b>Redirect URLs</b> → add the Redirect URI (below).</li>
      <li>Click <b>Connect with LinkedIn</b>.</li>
    </ol><div class="note">Posts go to your personal profile feed. Access tokens expire after ~60 days — reconnect when needed.</div>`,
  };

  function connCard(p) {
    const meta = PLATFORMS[p];
    const form = CONN_FORMS[p];
    const st = state.status ? state.status.platforms[p] : { connected: false, identity: null, supportsOAuth: false };
    const saved = state.settings ? state.settings[p] : {};

    const statusLine = st.connected
      ? `<span class="st-dot"></span> Connected <span class="identity">${esc(st.identity || '')}</span>${st.info && st.info.tokenDaysLeft != null ? ` <span class="sub">· token ~${st.info.tokenDaysLeft}d left</span>` : ''}`
      : `<span class="st-dot"></span> Not connected${saved && Object.values(saved).some((v) => v && typeof v === 'string' && v !== 'instagram.com' && v !== 'instagram.eu') ? ' <span class="sub">· credentials partially saved</span>' : ''}`;

    const redirectBox = form.oauthLabel ? `
      <div class="redirect-box">
        <div class="rb-label"><span>Redirect URI — register this in your app console</span>
          <button class="btn small ghost" data-action="copy" data-copy="${esc(location.origin)}/oauth/${p}/callback">Copy</button>
        </div>
        <code>${esc(location.origin)}/oauth/${p}/callback</code>
      </div>` : '';

    const sectionsHtml = form.sections.map((section, i) => `
          <div class="cc-section" data-section="${i}">
            ${section.title ? `<div class="section-title">${esc(section.title)}</div>` : ''}
            <div class="form-grid">
              ${form.domainSelect && i === 0 ? `
                <div class="form-field">
                  <label>API domain</label>
                  <select data-field="domain">
                    <option value="instagram.com" ${saved.domain !== 'instagram.eu' ? 'selected' : ''}>instagram.com (default)</option>
                    <option value="instagram.eu" ${saved.domain === 'instagram.eu' ? 'selected' : ''}>instagram.eu (EU apps)</option>
                  </select>
                </div>` : ''}
              ${section.fields.map((f) => {
                const val = saved[f.key] || '';
                const isMasked = typeof val === 'string' && val.startsWith('••••');
                const hint = isMasked ? `<span class="saved-hint">saved ${esc(val)} — leave blank to keep</span>` : '';
                const attrs = f.secret
                  ? `type="password" placeholder="${isMasked ? 'leave blank to keep saved value' : ''}"`
                  : `type="text" value="${esc(isMasked ? '' : val)}"`;
                return `<div class="form-field"><label>${esc(f.label)} ${hint}</label><input data-field="${f.key}" ${attrs} autocomplete="off" spellcheck="false"></div>`;
              }).join('')}
            </div>
            <div class="cc-actions">
              ${section.actions.map((a) => `<button class="btn ${a.type === 'oauth' ? 'primary' : ''} small" data-action="${a.type}" data-section="${i}">${esc(a.label)}</button>`).join('')}
              ${st.connected && i === 0 ? '<button class="btn small" data-action="test">Test connection</button><button class="btn small danger" data-action="disconnect">Disconnect</button>' : ''}
            </div>
          </div>`).join('<hr class="cc-divider">');

    return `
      <div class="conn-card" data-platform="${p}">
        <div class="cc-head">
          <span class="picon" style="color: var(${meta.cssVar})">${ICONS[p]}</span>
          <h3>${esc(meta.name)}</h3>
        </div>
        <div class="cc-status ${st.connected ? 'on' : ''}">${statusLine}</div>
        ${redirectBox}
        ${sectionsHtml}
        <details class="steps">
          <summary>How to get credentials</summary>
          ${STEPS[p]}
        </details>
      </div>`;
  }

  function renderConnections() {
    $('#connections-grid').innerHTML = PLATFORM_IDS.map(connCard).join('');
  }

  function collectValues(card, sectionIdx = null) {
    const out = {};
    let scope = card;
    if (sectionIdx != null) scope = $(`.cc-section[data-section="${sectionIdx}"]`, card);
    $$('[data-field]', scope).forEach((input) => {
      const v = input.value.trim();
      if (v !== '') out[input.dataset.field] = v;
      else if (input.tagName === 'SELECT') out[input.dataset.field] = input.value;
    });
    return out;
  }

  $('#connections-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.conn-card');
    const p = card.dataset.platform;
    const action = btn.dataset.action;
    const sectionIdx = btn.dataset.section != null ? Number(btn.dataset.section) : null;
    btn.disabled = true;
    try {
      if (action === 'copy') {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Redirect URI copied to clipboard', 'ok');
      } else if (action === 'save') {
        await api(`/api/settings/${p}`, { method: 'PUT', body: JSON.stringify(collectValues(card, sectionIdx)) });
        toast(`${PLATFORMS[p].name}: credentials saved`, 'ok');
        await Promise.all([loadSettings(), loadStatus()]);
      } else if (action === 'saveTest') {
        const data = await api(`/api/connect/${p}`, { method: 'POST', body: JSON.stringify(collectValues(card, sectionIdx)) });
        if (data.connected) toast(`${PLATFORMS[p].name} connected${data.identity ? ` as ${data.identity}` : ''} 🎉`, 'ok');
        else if (data.needsMoreNote) toast(data.needsMoreNote);
        await Promise.all([loadSettings(), loadStatus()]);
      } else if (action === 'oauth') {
        await api(`/api/settings/${p}`, { method: 'PUT', body: JSON.stringify(collectValues(card)) });
        window.location.href = `/oauth/${p}/start`;
      } else if (action === 'test') {
        const data = await api(`/api/test/${p}`, { method: 'POST' });
        toast(`${PLATFORMS[p].name}: connection OK${data.identity ? ` (${data.identity})` : ''}`, 'ok');
        await Promise.all([loadSettings(), loadStatus()]);
      } else if (action === 'disconnect') {
        await api(`/api/disconnect/${p}`, { method: 'POST' });
        toast(`${PLATFORMS[p].name} disconnected`, 'ok');
        await Promise.all([loadSettings(), loadStatus()]);
        state.selected.delete(p);
        updateCompose();
      }
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- netcheck ----------
  $('#netcheck-btn').addEventListener('click', async () => {
    const btn = $('#netcheck-btn');
    const out = $('#netcheck-results');
    btn.disabled = true;
    out.innerHTML = '<span class="counter">checking…</span>';
    try {
      const d = await api('/api/netcheck');
      out.innerHTML = Object.entries(d.netcheck).map(([p, r]) => {
        const meta = PLATFORMS[p];
        const label = r.reachable
          ? `✓ reachable (HTTP ${r.status} · ${r.ms}ms)`
          : `✗ blocked (${r.error})`;
        return `<span class="counter ${r.reachable ? '' : 'over'}">${ICONS[p]} ${esc(meta.short)} ${esc(label)}</span>`;
      }).join(' ');
    } catch (e) {
      out.innerHTML = '';
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- boot ----------
  async function boot() {
    const params = new URLSearchParams(location.search);
    const qTab = params.get('tab');
    if (['compose', 'history', 'connections'].includes(qTab)) setTab(qTab);
    if (params.get('connected')) {
      const name = PLATFORMS[params.get('connected')] ? PLATFORMS[params.get('connected')].name : params.get('connected');
      const identity = params.get('identity');
      toast(`${name} connected${identity ? ` as ${identity}` : ''} 🎉`, 'ok');
    }
    if (params.get('error')) toast(params.get('error'), 'err');
    history.replaceState(null, '', location.pathname);

    await Promise.all([loadStatus(), loadSettings()]);
    // preselect every connected platform
    PLATFORM_IDS.forEach((p) => { if (connected(p)) state.selected.add(p); });
    updateCompose();
    loadPosts();
  }

  boot();
})();
