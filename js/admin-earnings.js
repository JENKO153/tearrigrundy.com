/*
 * Earnings: Google AdSense, Stay22 and Travelpayouts, plus the affiliate disclosure.
 * Values are saved inside the site settings as `money` (see js/ads.js and js/post.js, which read
 * them on the public site). Anything switched off or incomplete renders nothing on the site.
 */
(function (window) {
  const A = window.Admin;
  const esc = A.esc, $ = A.$;

  const DEF = {
    adsense: { enabled: false, client: '', footer: '', inPost: '' },
    stay22: { enabled: false, aid: '' },
    travelpayouts: { enabled: false, marker: '', script: '' },
    disclosure: '',
  };
  const RE = {
    client: /^ca-pub-\d{10,20}$/, slot: /^\d{6,20}$/, aid: /^[A-Za-z0-9_-]{2,60}$/, marker: /^\d{3,12}$/, script: /^https:\/\/[^\s"'<>]+$/,
  };
  const DEFAULT_DISCLOSURE = 'This post contains affiliate links and maps. If you book through them I may earn a small commission, at no extra cost to you.';

  const merge = (saved) => {
    const out = JSON.parse(JSON.stringify(DEF));
    const m = saved || {};
    Object.keys(out).forEach((k) => {
      if (k === 'disclosure') { if (typeof m.disclosure === 'string') out.disclosure = m.disclosure; return; }
      Object.keys(out[k]).forEach((f) => { if (m[k] && typeof m[k][f] === typeof out[k][f]) out[k][f] = m[k][f]; });
    });
    return out;
  };
  const status = (m) => ({
    adsense: !m.adsense.enabled ? 'off' : RE.client.test(m.adsense.client) && (RE.slot.test(m.adsense.footer) || RE.slot.test(m.adsense.inPost)) ? 'live' : 'todo',
    stay22: !m.stay22.enabled ? 'off' : RE.aid.test(m.stay22.aid) ? 'live' : 'todo',
    travelpayouts: !m.travelpayouts.enabled ? 'off' : RE.script.test(m.travelpayouts.script) ? 'live' : 'todo',
  });
  A.moneyStatus = (money) => status(merge(money));
  const chip = (s) => `<span class="a-pill ${s === 'live' ? 'live' : s === 'todo' ? 'draft' : ''}">${s === 'live' ? 'Live' : s === 'todo' ? 'Needs details' : 'Off'}</span>`;

  A.views.earnings = async function (arg, root) {
    const { data: saved, available } = await CMS.loadSettings();
    const m = merge(saved.money);
    let touched = false;

    const sw = (path, label) => `<label class="a-switch"><input type="checkbox" data-path="${path}"><span class="track"></span><span>${label}</span></label>`;
    const field = (path, label, ph, hint, extra = '') => `<div class="a-field"><label for="e_${path.replace('.', '_')}">${label}</label><input id="e_${path.replace('.', '_')}" data-path="${path}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false" ${extra}>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;

    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">Earnings</h1><p class="a-lead">Switch on ads and travel affiliate links, and control exactly where they appear. Nothing shows on the site until a service is on and filled in.</p></div></div>
      ${available ? '' : '<div class="a-card" style="border-left:4px solid var(--a-warn)"><h2>One quick set-up step</h2><p class="hint" style="margin:0">Saving needs <code>supabase/01-dashboard.sql</code> to be run once.</p></div>'}

      <div class="a-card"><div class="a-card-top"><h2>Stay22 — hotel maps</h2><span id="chip_stay22"></span></div>
        <p class="hint">An interactive map of places to stay. Add it to any post with the <b>+ Hotel map</b> block. You earn a commission when a reader books.</p>
        ${sw('stay22.enabled', 'Turn Stay22 on')}
        ${field('stay22.aid', 'Your Stay22 ID', 'e.g. tearrigrundy', 'Found in your Stay22 dashboard — it is called your affiliate ID (AID).')}
        <details class="a-how"><summary>How do I link Stay22?</summary><ol>
          <li>Go to <b>stay22.com</b> and sign up as a content creator / publisher (free).</li>
          <li>Add tearrigrundy.com as your website when asked.</li>
          <li>In your Stay22 dashboard find your <b>affiliate ID</b> (sometimes shown as “AID” or inside the embed code as <code>aid=…</code>) and paste it above.</li>
          <li>Tick <b>Turn Stay22 on</b> and press Save. Then in any post use <b>+ Hotel map</b> and type a place, e.g. “Kyoto, Japan”.</li></ol></details></div>

      <div class="a-card"><div class="a-card-top"><h2>Travelpayouts — flights, hotels &amp; more</h2><span id="chip_travelpayouts"></span></div>
        <p class="hint">A travel affiliate network (flights, hotels, car hire…). Their site-wide script turns normal travel links into tracked ones, and their search boxes can go inside posts with <b>+ Travel widget</b>.</p>
        ${sw('travelpayouts.enabled', 'Turn Travelpayouts on')}
        ${field('travelpayouts.script', 'Site-wide script link', 'https://…', 'Optional but recommended. The link from your Travelpayouts script (the part inside <code>src="…"</code>).')}
        ${field('travelpayouts.marker', 'Your Travelpayouts ID (marker)', 'e.g. 123456', 'Just for your reference so it is written down in one place.')}
        <details class="a-how"><summary>How do I link Travelpayouts?</summary><ol>
          <li>Go to <b>travelpayouts.com</b> and create a free account.</li>
          <li>Add tearrigrundy.com as a project/website, and join the travel programs you want (flights, hotels, etc.).</li>
          <li>Open the tools area in your Travelpayouts dashboard and copy the <b>script code</b> they give you. Only copy the web address inside <code>src="…"</code> (it starts with <code>https://</code>) and paste it above.</li>
          <li>For a search box inside a post, create a widget there, copy its script link the same way, then use <b>+ Travel widget</b> in the post editor and paste it.</li>
          <li>Tick <b>Turn Travelpayouts on</b> and Save.</li></ol>
          <p class="hint"><b>Only paste links from your own Travelpayouts dashboard</b> — a link you paste here runs on every page.</p></details></div>

      <div class="a-card"><div class="a-card-top"><h2>Google AdSense — display ads</h2><span id="chip_adsense"></span></div>
        <p class="hint">Ads that pay per view and click. You choose where they can appear; each spot only shows once it has an ad unit number.</p>
        ${sw('adsense.enabled', 'Turn AdSense on')}
        ${field('adsense.client', 'Publisher ID', 'ca-pub-1234567890123456', 'From AdSense → Account → Account information (“Publisher ID”, starts with pub-). Enter it as ca-pub-…')}
        <div class="a-two">
          ${field('adsense.footer', 'Bottom-of-page ad unit', '1234567890', 'Shows above the footer on every page.')}
          ${field('adsense.inPost', 'Inside-post ad unit', '0987654321', 'Shows after the first block of each post.')}
        </div>
        <details class="a-how"><summary>How do I link AdSense?</summary><ol>
          <li>Go to <b>adsense.google.com</b>, sign in with a Google account and add <b>tearrigrundy.com</b>.</li>
          <li>Google needs a privacy policy page on the site and a cookie-consent banner for visitors in the UK/EU. Approval can take a few days to a few weeks.</li>
          <li>Once approved: <b>Ads → By ad unit → Display ads</b>, create one unit for the bottom of the page and one for inside posts. Each has a number (the <code>data-ad-slot</code>) — paste them above.</li>
          <li>Paste your <b>Publisher ID</b> above, tick <b>Turn AdSense on</b> and Save.</li>
          <li><b>ads.txt:</b> AdSense checks a file called <code>ads.txt</code> on your site. Copy the line below into <code>ads.txt</code> in the site's files and publish the site (ask your developer, or Claude, to do this).</li></ol></details>
        <div class="a-field" style="margin-top:14px"><label>Your ads.txt line</label><div class="a-secret" id="adsTxt">Enter your publisher ID above</div>
          <button class="a-btn ghost sm" id="copyAds" type="button" style="margin-top:8px">Copy line</button></div></div>

      <div class="a-card"><h2>Affiliate disclosure</h2><p class="hint">Shown at the bottom of any post that has a hotel map or travel widget. Most countries require this.</p>
        <div class="a-field" style="margin:0"><textarea data-path="disclosure" rows="3" maxlength="300" placeholder="${esc(DEFAULT_DISCLOSURE)}" aria-label="Disclosure text"></textarea><p class="hint">Leave blank to use the wording above.</p></div></div>
    </div>`;

    /* ---------- bind form <-> state ---------- */
    const get = (path) => path.split('.').reduce((o, k) => o[k], m);
    const set = (path, v) => { const [a, b] = path.split('.'); if (b) m[a][b] = v; else m[a] = v; };
    root.querySelectorAll('[data-path]').forEach((el) => {
      const v = get(el.dataset.path);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    const line = () => {
      const c = m.adsense.client.trim();
      $('adsTxt').textContent = RE.client.test(c) ? `google.com, pub-${c.slice(3).replace('pub-', '')}, DIRECT, f08c47fec0942fa0` : 'Enter your publisher ID above';
    };
    function paint() {
      const st = status(m);
      Object.keys(st).forEach((k) => { $(`chip_${k}`).innerHTML = chip(st[k]); });
      line();
    }
    paint();
    root.addEventListener('input', (e) => {
      const p = e.target.dataset && e.target.dataset.path;
      if (!p) return;
      set(p, e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim());
      if (p === 'disclosure') m.disclosure = e.target.value;
      touched = true; A.dirty = true; paint(); bar();
    });
    $('copyAds').onclick = async () => {
      const t = $('adsTxt').textContent;
      if (!t.startsWith('google.com')) { A.toast('Enter a valid publisher ID first.', 'bad'); return; }
      try { await navigator.clipboard.writeText(t); A.toast('Copied', 'ok'); } catch (e) { A.toast('Select the line and copy it manually.', 'bad'); }
    };

    /* ---------- save ---------- */
    function bar(msg) {
      const el = $('savebar');
      el.innerHTML = `<span class="status ${msg ? 'ok' : A.dirty ? 'dirty' : ''}">${msg || (A.dirty ? '● Unsaved changes' : 'No changes yet')}</span><button class="a-btn" id="eSave" type="button" ${A.dirty ? '' : 'disabled'}>Save earnings settings</button>`;
      el.classList.add('on');
    }
    function problem() {
      const a = m.adsense, s = m.stay22, t = m.travelpayouts;
      if (a.client && !RE.client.test(a.client)) return ['adsense.client', 'The AdSense publisher ID should look like ca-pub-1234567890123456.'];
      if (a.footer && !RE.slot.test(a.footer)) return ['adsense.footer', 'Ad unit numbers are digits only.'];
      if (a.inPost && !RE.slot.test(a.inPost)) return ['adsense.inPost', 'Ad unit numbers are digits only.'];
      if (s.aid && !RE.aid.test(s.aid)) return ['stay22.aid', 'The Stay22 ID can only use letters, numbers, - and _.'];
      if (t.script && !RE.script.test(t.script)) return ['travelpayouts.script', 'The script link must start with https:// and have no spaces.'];
      if (t.marker && !RE.marker.test(t.marker)) return ['travelpayouts.marker', 'The Travelpayouts ID is a number.'];
      return null;
    }
    $('savebar').onclick = async (e) => {
      if (e.target.id !== 'eSave') return;
      const bad = problem();
      if (bad) { A.toast(bad[1], 'bad'); const el = root.querySelector(`[data-path="${bad[0]}"]`); if (el) el.focus(); return; }
      e.target.disabled = true;
      try {
        const res = await A.withWrite('save your earnings settings', async () => {
          const out = { ...saved, money: JSON.parse(JSON.stringify(m)) };
          await CMS.saveSettings(out);
          return out;
        });
        if (res.cancelled) { bar(); return; }
        Object.keys(saved).forEach((k) => delete saved[k]); Object.assign(saved, res.value);
        try { localStorage.setItem('tg_site_content', JSON.stringify(res.value)); } catch (x) { /* ignore */ }
        touched = false; A.dirty = false;
        bar(`✓ Saved ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
        A.toast('Earnings settings saved', 'ok');
      } catch (ex) { A.toast(ex.message, 'bad'); bar(); }
    };
    bar();
    return function cleanup() { $('savebar').onclick = null; void touched; };
  };

  /* =====================================================================
     Categories: rename or merge across every post
     ===================================================================== */
  A.views.categories = async function (arg, root) {
    await A.loadPosts();
    const draw = () => {
      const counts = {};
      A.posts.forEach((p) => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
      const names = Object.keys(counts).sort();
      root.innerHTML = `<div class="a-view"><div class="a-head"><div><h1 class="a-h1">Categories</h1><p class="a-lead">The groups your posts sit in. Rename one and every post in it updates. Give it the same name as another to merge them.</p></div></div>
        <div class="a-card">${names.length ? `<ul class="a-list">${names.map((n) => `<li data-cat="${esc(n)}"><div class="grow"><div class="t">${esc(n)}</div><div class="m">${counts[n]} ${counts[n] === 1 ? 'post' : 'posts'}</div></div><button class="a-btn ghost sm" data-rename>Rename</button></li>`).join('')}</ul>` : '<div class="a-empty">No categories yet — they appear when you write your first post.</div>'}</div></div>`;
    };
    draw();
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-rename]');
      if (!btn) return;
      const li = btn.closest('li'), from = li.dataset.cat;
      li.innerHTML = `<div class="grow"><input class="a-input" maxlength="30" value="${esc(from)}" aria-label="New name"></div><button class="a-btn sm" data-save>Save</button><button class="a-btn ghost sm" data-cancel>Cancel</button>`;
      const input = li.querySelector('input'); input.focus(); input.select();
      li.querySelector('[data-cancel]').onclick = draw;
      const go = async () => {
        const to = input.value.trim();
        if (!to || to === from) { draw(); return; }
        try {
          const res = await A.withWrite(`rename “${from}” to “${to}”`, () => CMS.renameCategory(from, to));
          if (res.cancelled) return;
          A.toast('Category renamed', 'ok');
          await A.loadPosts(); draw();
        } catch (ex) { A.toast(ex.message, 'bad'); }
      };
      li.querySelector('[data-save]').onclick = go;
      input.onkeydown = (ev) => { if (ev.key === 'Enter') go(); if (ev.key === 'Escape') draw(); };
    });
  };
})(window);
