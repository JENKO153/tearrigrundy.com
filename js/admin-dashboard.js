/*
 * Admin dashboard core: shared helpers (toasts, password re-check, confirm boxes),
 * the hash router, and the Overview / Posts / Security screens.
 * The post editor (admin-editor.js) and Homepage & About editor (admin-site.js) register
 * themselves on window.Admin.views; admin-boot.js starts everything once they are loaded.
 */
(function (window) {
  const esc = window.CMS.esc;
  const $ = (id) => document.getElementById(id);

  const Admin = window.Admin = {
    views: {},
    dirty: false,          // unsaved edits in the current screen
    me: null,
    esc, $,
  };

  /* ---------- formatting ---------- */
  Admin.fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  Admin.fmtDateTime = (d) => `${Admin.fmtDate(d)} at ${new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  Admin.ago = (d) => {
    const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
    if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`;
    return Admin.fmtDate(d);
  };
  Admin.debounce = (fn, wait) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; f.flush = (...a) => { clearTimeout(t); fn(...a); }; return f; };

  /* ---------- toasts ---------- */
  Admin.toast = (msg, type = '') => {
    const el = document.createElement('div');
    el.className = `a-toast ${type}`;
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, type === 'bad' ? 6000 : 3200);
  };

  /* ---------- modal plumbing ---------- */
  let lastFocus = null;
  const openModal = (el) => { lastFocus = document.activeElement; el.classList.add('show'); };
  const closeModal = (el) => { el.classList.remove('show'); if (lastFocus && lastFocus.focus) lastFocus.focus(); };

  Admin.confirmBox = ({ title, text, ok = 'OK', danger = false, cancel = 'Cancel' }) => new Promise((resolve) => {
    $('askTitle').textContent = title;
    $('askText').textContent = text || '';
    const yes = $('askYes'), no = $('askNo');
    yes.textContent = ok; no.textContent = cancel;
    yes.className = danger ? 'a-btn danger' : 'a-btn';
    if (danger) yes.style.background = 'var(--a-bad)', yes.style.color = '#fff'; else yes.removeAttribute('style');
    const modal = $('askModal');
    const done = (v) => { yes.onclick = no.onclick = null; modal.onkeydown = null; closeModal(modal); resolve(v); };
    yes.onclick = () => done(true); no.onclick = () => done(false);
    modal.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
    openModal(modal);
    (danger ? no : yes).focus();
  });

  // Asks for the words + address of a link. Resolves { text, url } or null.
  Admin.linkDialog = (text = '') => new Promise((resolve) => {
    const modal = $('linkModal'), form = $('linkForm'), t = $('linkText'), u = $('linkUrl'), err = $('linkErr');
    t.value = text; u.value = ''; err.classList.remove('show');
    const done = (v) => { form.onsubmit = null; $('linkCancel').onclick = null; modal.onkeydown = null; closeModal(modal); resolve(v); };
    form.onsubmit = (e) => {
      e.preventDefault();
      let url = u.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      const words = t.value.replace(/[\[\]]/g, '').trim();
      const bad = !words ? 'Type the words that should be the link.' : !/^https:\/\/[^\s]+\.[^\s]+$/.test(url) ? 'Enter a full web address that starts with https://' : '';
      if (bad) { err.textContent = bad; err.classList.remove('show'); void err.offsetWidth; err.classList.add('show'); return; }
      done({ text: words, url: url.replace(/\(/g, '%28').replace(/\)/g, '%29') });
    };
    $('linkCancel').onclick = () => done(null);
    modal.onkeydown = (e) => { if (e.key === 'Escape') done(null); };
    openModal(modal);
    (text ? u : t).focus();
  });

  /* ---------- password re-check before anything permanent ---------- */
  function askPassword(label) {
    return new Promise((resolve) => {
      const modal = $('pwModal'), form = $('pwForm'), input = $('pwInput'), err = $('pwErr'), okBtn = $('pwOk');
      $('pwMsg').textContent = `Enter your password to ${label}.`;
      input.value = ''; err.classList.remove('show');
      const done = (v) => { form.onsubmit = null; $('pwCancel').onclick = null; modal.onkeydown = null; closeModal(modal); resolve(v); };
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!input.value) return;
        okBtn.disabled = true; okBtn.textContent = 'Checking…';
        try {
          const res = await CMS.confirm(input.value);
          if (res && res.ok) { input.value = ''; done(true); return; }
          const reason = res && res.reason;
          err.textContent = reason === 'locked' ? 'Too many wrong tries. Please wait 15 minutes and try again.'
            : reason === 'incorrect' ? `That password isn't right.${res.remaining != null ? ` ${res.remaining} ${res.remaining === 1 ? 'try' : 'tries'} left.` : ''}`
            : 'Please sign out and sign in again, then retry.';
        } catch (ex) { err.textContent = ex.message; }
        err.classList.remove('show'); void err.offsetWidth; err.classList.add('show');
        input.value = ''; input.focus();
        okBtn.disabled = false; okBtn.textContent = 'Confirm';
      };
      $('pwCancel').onclick = () => done(false);
      modal.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
      okBtn.disabled = false; okBtn.textContent = 'Confirm';
      openModal(modal);
      input.focus();
    });
  }

  // Password check -> your change -> the write window closes again straight away.
  Admin.withWrite = async (label, fn) => {
    if (!(await askPassword(label))) return { cancelled: true };
    try { return { value: await fn() }; }
    finally { try { await CMS.endWrite(); } catch (e) { /* ignore */ } }
  };

  /* ---------- router ---------- */
  const NAV_FOR = { home: 'home', posts: 'posts', post: 'post', site: 'site', security: 'security', earnings: 'earnings', categories: 'categories' };
  let cleanup = null, guarding = false;

  Admin.go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  async function route() {
    const hash = location.hash.replace(/^#/, '') || 'home';
    const [name, ...rest] = hash.split('/');
    const view = Admin.views[name] || Admin.views.home;
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    Admin.dirty = false;
    $('savebar').classList.remove('on');
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (NAV_FOR[name] || 'home')));
    closeMenu();
    const root = $('view');
    root.innerHTML = '<div class="a-view"><p class="a-lead">Loading…</p></div>';
    try {
      const out = await view(rest.join('/'), root);
      if (typeof out === 'function') cleanup = out;
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="a-view"><div class="a-card"><h2>Something went wrong</h2><p class="hint">${esc(e.message || 'Could not load this page.')}</p><button class="a-btn sm" onclick="location.reload()">Try again</button></div></div>`;
    }
    window.scrollTo(0, 0);
    if (!guarding) root.focus({ preventScroll: true });
  }

  // Leaving a screen with unsaved edits asks first.
  window.addEventListener('hashchange', async (e) => {
    if (guarding) return;
    if (Admin.dirty) {
      guarding = true;
      const target = location.hash;
      const at = e.oldURL.indexOf('#');
      history.replaceState(null, '', at === -1 ? '#home' : e.oldURL.slice(at));
      const leave = await Admin.confirmBox({ title: 'Leave without saving?', text: 'You have changes that are not saved yet. A copy is kept on this device, but it is not on the blog until you save.', ok: 'Leave anyway', cancel: 'Stay here', danger: true });
      guarding = false;
      if (leave) { Admin.dirty = false; history.replaceState(null, '', target); route(); }
      return;
    }
    route();
  });
  window.addEventListener('beforeunload', (e) => { if (Admin.dirty) { e.preventDefault(); e.returnValue = ''; } });
  Admin.route = route;

  /* ---------- mobile menu ---------- */
  function closeMenu() { $('side').classList.remove('open'); $('scrim').classList.remove('on'); $('burger').setAttribute('aria-expanded', 'false'); }
  Admin.initMenu = () => {
    $('burger').addEventListener('click', () => {
      const open = $('side').classList.toggle('open');
      $('scrim').classList.toggle('on', open);
      $('burger').setAttribute('aria-expanded', String(open));
    });
    $('scrim').addEventListener('click', closeMenu);
  };

  /* ---------- shared data ---------- */
  Admin.posts = [];
  Admin.loadPosts = async () => {
    Admin.posts = await CMS.listPosts();
    const live = Admin.posts.length;
    $('postsBadge').textContent = live || '';
    return Admin.posts;
  };
  Admin.pill = (p) => {
    const s = CMS.postState(p);
    return `<span class="a-pill ${s}">${s === 'live' ? 'Live' : s === 'scheduled' ? 'Scheduled' : 'Draft'}</span>`;
  };
  Admin.thumb = (p) => `<div class="a-thumb" ${p.image ? `style="background-image:url('${esc(p.image)}')"` : ''}>${p.image ? '' : 'No cover'}</div>`;
  Admin.viewUrl = (p) => `/post/?id=${encodeURIComponent(p.slug)}`;

  // Live or scheduled post -> draft: it leaves the site straight away and stays editable.
  Admin.takeDown = async (p) => {
    if (!CMS.caps.drafts) { Admin.toast('Taking a post down needs the database update — run supabase/01-dashboard.sql first.', 'bad'); return false; }
    const ok = await Admin.confirmBox({ title: 'Take this post down?', text: `“${p.title || 'Untitled'}” disappears from the site straight away and becomes a draft. You can edit it, then publish it again or delete it.`, ok: 'Take it down' });
    if (!ok) return false;
    try {
      const res = await Admin.withWrite('take this post down', () => CMS.savePost({ ...p, status: 'draft' }));
      if (res.cancelled) return false;
      Admin.toast('Post taken down — it is now a draft', 'ok');
      return true;
    } catch (e) { Admin.toast(e.message, 'bad'); return false; }
  };

  Admin.deletePost = async (p) => {
    const ok = await Admin.confirmBox({ title: 'Delete this post?', text: `“${p.title || 'Untitled'}” will be removed for good. This can't be undone.`, ok: 'Delete', danger: true });
    if (!ok) return false;
    const run = () => CMS.deletePost(p);
    try {
      // Drafts that only exist on this device need no password; anything on the server does.
      const res = String(p.id).startsWith('local-') ? { value: await run() } : await Admin.withWrite('delete this post', run);
      if (res.cancelled) return false;
      Admin.toast('Post deleted', 'ok');
      return true;
    } catch (e) { Admin.toast(e.message, 'bad'); return false; }
  };

  /* =====================================================================
     Overview
     ===================================================================== */
  Admin.views.home = async (arg, root) => {
    const [posts, logs, status, settings] = await Promise.all([Admin.loadPosts(), CMS.auditLog().catch(() => null), CMS.serverStatus().catch(() => ({})), CMS.loadSettings().catch(() => ({ data: {} }))]);
    const earn = Admin.moneyStatus((settings.data || {}).money);
    const earnRow = (label, st) => `<li><div class="grow"><div class="t">${label}</div></div><span class="a-pill ${st === 'live' ? 'live' : st === 'todo' ? 'draft' : ''}">${st === 'live' ? 'Live' : st === 'todo' ? 'Needs details' : 'Off'}</span></li>`;
    const live = posts.filter((p) => CMS.postState(p) === 'live');
    const sched = posts.filter((p) => CMS.postState(p) === 'scheduled');
    const drafts = posts.filter((p) => CMS.postState(p) === 'draft');
    const cats = new Set(posts.map((p) => p.category).filter(Boolean));

    const attention = [];
    drafts.slice(0, 4).forEach((p) => attention.push({ t: p.title || 'Untitled draft', m: `Draft · edited ${Admin.ago(p.updated_at || p.date)}`, href: `#post/${p.id}`, cta: 'Keep writing' }));
    sched.slice(0, 3).forEach((p) => attention.push({ t: p.title, m: `Goes live ${Admin.fmtDateTime(p.date)}`, href: `#post/${p.id}`, cta: 'Edit' }));
    posts.filter((p) => CMS.postState(p) !== 'draft' && !p.image).slice(0, 3).forEach((p) => attention.push({ t: p.title, m: 'Missing a cover photo', href: `#post/${p.id}`, cta: 'Add one' }));

    const activity = logs && logs.length
      ? logs.slice(0, 6).map((l) => ({ t: `${l.action === 'insert' ? 'Created' : l.action === 'delete' ? 'Deleted' : 'Updated'} ${l.entity === 'site_settings' ? 'page content' : 'a post'}`, m: `${l.summary || ''} · ${Admin.ago(l.at)}` }))
      : posts.slice().sort((a, b) => new Date(b.updated_at || b.date) - new Date(a.updated_at || a.date)).slice(0, 6).map((p) => ({ t: p.title || 'Untitled', m: `${CMS.postState(p) === 'draft' ? 'Draft saved' : 'Post updated'} · ${Admin.ago(p.updated_at || p.date)}` }));

    const todo = [];
    if (status.drafts === false) todo.push('Drafts are only saved on this device right now. Run <code>supabase/01-dashboard.sql</code> to save them online.');
    if (status.security === false) todo.push('Extra security (2-step code, database password check) is ready but not switched on. Run <code>supabase/02-security.sql</code> — see the Security page.');
    if (status.settings === false) todo.push('Homepage &amp; About editing needs <code>supabase/01-dashboard.sql</code> to be run once.');

    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-welcome">Welcome back, Butterfly <span>xxx</span></h1><p class="a-lead">Here's how the blog is doing today.</p></div>
        <div class="a-actions"><a class="a-btn" href="#post/new">+ Write a new post</a></div></div>
      ${todo.length ? `<div class="a-card" style="border-left:4px solid var(--a-warn)"><h2>Finish setting up</h2><ul class="a-list">${todo.map((t) => `<li><div class="grow">${t}</div></li>`).join('')}</ul></div>` : ''}
      <div class="a-tiles">
        <a class="a-tile" href="#posts"><b>${live.length}</b><span>Published</span></a>
        <a class="a-tile" href="#posts"><b>${sched.length}</b><span>Scheduled</span></a>
        <a class="a-tile" href="#posts"><b>${drafts.length}</b><span>Drafts</span></a>
        <div class="a-tile"><b>${cats.size}</b><span>Categories</span></div>
      </div>
      <div class="a-cols">
        <div class="a-card"><h2>Needs your attention</h2><p class="hint">Things waiting on you.</p>
          ${attention.length ? `<ul class="a-list">${attention.map((a) => `<li><div class="grow"><div class="t">${esc(a.t)}</div><div class="m">${esc(a.m)}</div></div><a class="a-btn ghost sm" href="${a.href}">${a.cta}</a></li>`).join('')}</ul>`
            : '<div class="a-empty">All caught up. Nothing needs you right now ✨</div>'}
        </div>
        <div>
          <div class="a-card"><h2>Quick actions</h2><p class="hint">Jump straight in.</p>
            <div class="a-actions"><a class="a-btn teal sm" href="#post/new">Write a post</a><a class="a-btn ghost sm" href="#site">Edit Homepage &amp; About</a><a class="a-btn ghost sm" href="/" target="_blank" rel="noopener">View the site</a></div></div>
          <div class="a-card"><h2>Earnings</h2><p class="hint">What's making money on the site.</p><ul class="a-list">${earnRow('Google AdSense', earn.adsense)}${earnRow('Stay22 hotel maps', earn.stay22)}${earnRow('Travelpayouts', earn.travelpayouts)}</ul><a class="a-btn ghost sm" href="#earnings" style="margin-top:10px">Manage earnings</a></div>
          <div class="a-card"><h2>Recent activity</h2><p class="hint">${logs ? 'Every change made in this dashboard.' : 'Your latest edits.'}</p>
            ${activity.length ? `<ul class="a-list">${activity.map((a) => `<li><div class="grow"><div class="t">${esc(a.t)}</div><div class="m">${esc(a.m)}</div></div></li>`).join('')}</ul>` : '<div class="a-empty">Nothing yet — write your first post!</div>'}
          </div>
        </div>
      </div></div>`;
  };

  /* =====================================================================
     Posts list
     ===================================================================== */
  Admin.views.posts = async (arg, root) => {
    await Admin.loadPosts();
    let tab = 'all', q = '';
    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">Posts</h1><p class="a-lead">Everything you've written, live, scheduled or still a draft.</p></div>
        <a class="a-btn" href="#post/new">+ Write a new post</a></div>
      <div class="a-toolbar"><div class="a-tabs" id="tabs"></div><input class="a-input" id="q" type="search" placeholder="Search posts…" aria-label="Search posts"></div>
      <div class="a-posts" id="plist"></div></div>`;

    const count = (s) => Admin.posts.filter((p) => s === 'all' || CMS.postState(p) === s).length;
    function draw() {
      $('tabs').innerHTML = [['all', 'All'], ['live', 'Published'], ['scheduled', 'Scheduled'], ['draft', 'Drafts']]
        .map(([k, l]) => `<button class="a-tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l} · ${count(k)}</button>`).join('');
      const list = Admin.posts.filter((p) => (tab === 'all' || CMS.postState(p) === tab) && (!q || `${p.title} ${p.category}`.toLowerCase().includes(q)));
      $('plist').innerHTML = list.length ? list.map((p) => {
        const s = CMS.postState(p);
        return `<div class="a-post" data-id="${esc(p.id)}">${Admin.thumb(p)}
          <div><div class="t">${esc(p.title || 'Untitled')}</div>
            <div class="m">${Admin.pill(p)}<span>${esc(p.category || 'No category')}</span><span>${s === 'scheduled' ? 'Goes live ' + Admin.fmtDateTime(p.date) : s === 'draft' ? 'Edited ' + Admin.ago(p.updated_at || p.date) : Admin.fmtDate(p.date)}</span></div></div>
          <div class="acts"><a class="a-btn ghost sm" href="#post/${esc(p.id)}">Edit</a>${s === 'live' ? `<a class="a-icon" title="View on site" href="${Admin.viewUrl(p)}" target="_blank" rel="noopener">View ↗</a>` : ''}${s !== 'draft' ? `<button class="a-icon" title="Remove from the site and keep as a draft" data-down="${esc(p.id)}">Take down</button>` : ''}<button class="a-icon danger" data-del="${esc(p.id)}">Delete</button></div></div>`;
      }).join('') : `<div class="a-card a-empty">${Admin.posts.length ? 'No posts match that.' : 'No posts yet. <a href="#post/new">Write your first one →</a>'}</div>`;
    }
    draw();
    $('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } });
    $('q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
    $('plist').addEventListener('click', async (e) => {
      const down = e.target.closest('[data-down]');
      if (down) {
        const p = Admin.posts.find((x) => String(x.id) === down.dataset.down);
        if (p && await Admin.takeDown(p)) { await Admin.loadPosts(); draw(); }
        return;
      }
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const p = Admin.posts.find((x) => String(x.id) === b.dataset.del);
      if (p && await Admin.deletePost(p)) { await Admin.loadPosts(); draw(); }
    });
  };

  /* =====================================================================
     Security
     ===================================================================== */
  Admin.views.security = async (arg, root) => {
    const [status, logs, me] = await Promise.all([CMS.serverStatus().catch(() => ({})), CMS.auditLog().catch(() => null), CMS.getAdmin()]);
    const mins = window.TG_CONFIG.adminIdleMinutes || 5;
    const item = (ok, title, body) => `<li><span class="a-dot ${ok ? '' : 'no'}">${ok ? '✓' : '!'}</span><div><div class="t">${title}</div><div class="m">${body}</div></div></li>`;
    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">Security</h1><p class="a-lead">How your blog is kept safe, and what you can do about it.</p></div></div>
      <div class="a-cols"><div>
        <div class="a-card"><h2>Protection status</h2><p class="hint">Green means it's on.</p>
          <ul class="a-check-list">
            ${item(true, 'Password check before every change', 'Publishing, editing live posts, deleting and saving page content all ask for your password again.')}
            ${item(true, `Auto sign-out after ${mins} minutes`, 'If you walk away, the dashboard locks itself. Anything you were typing is kept safe on this device.')}
            ${item(true, 'Signed out when the browser closes', 'Your login is never remembered on the device.')}
            ${item(status.security !== false, 'Database-enforced password check', status.security !== false ? 'The database itself refuses changes unless you confirmed your password in the last few minutes.' : 'Run <code>supabase/02-security.sql</code> to make the database enforce this too, not just the page.')}
            ${item(!!(me && me.mfa) || status.demo, 'Two-step sign-in (authenticator app)', me && me.mfa ? 'On: a 6-digit code is needed every time you sign in.' : status.security === false ? 'Available after <code>02-security.sql</code> is run.' : 'Not set up yet. Adding it means a stolen password alone can\'t get in.')}
            ${item(status.drafts !== false, 'Drafts saved online', status.drafts !== false ? 'Drafts are stored safely in your database.' : 'Drafts are on this device only. Run <code>supabase/01-dashboard.sql</code> to save them online.')}
            ${item(logs !== null, 'Activity log', logs !== null ? 'Every change is recorded and can\'t be edited or removed.' : 'Run <code>02-security.sql</code> to switch on the change history.')}
          </ul></div>
        <div class="a-card" id="mfaCard" ${me && me.mfa || status.security === false || CMS.mode === 'demo' ? 'hidden' : ''}><h2>Set up two-step sign-in</h2><p class="hint">Use Google Authenticator, 1Password or Authy on your phone.</p><div id="mfaBody"><button class="a-btn" id="mfaStart">Start set-up</button></div></div>
        <div class="a-card"><h2>Account</h2><p class="hint">Signed in as <strong>${esc(Admin.me.email)}</strong></p>
          <div class="a-actions"><button class="a-btn ghost sm" id="chgPw">Change password</button><button class="a-btn ghost sm" id="allOut">Sign out on all devices</button></div>
          <form id="pwChange" class="hidden" style="margin-top:18px" autocomplete="off">
            <div class="a-field"><label for="pwCur">Current password</label><input type="password" id="pwCur" autocomplete="current-password" required></div>
            <div class="a-field"><label for="pwNew">New password</label><input type="password" id="pwNew" autocomplete="new-password" minlength="10" required><p class="hint">At least 10 characters. A few random words is great.</p></div>
            <button class="a-btn sm" type="submit">Save new password</button></form></div>
      </div>
      <div class="a-card"><h2>Activity log</h2><p class="hint">Who changed what, and when.</p>
        ${logs && logs.length ? `<table class="a-table"><thead><tr><th>When</th><th>What</th></tr></thead><tbody>${logs.slice(0, 40).map((l) => `<tr><td>${Admin.fmtDateTime(l.at)}</td><td>${esc(l.action)} · ${esc(l.entity)}<br><span class="m">${esc(l.summary || '')}</span></td></tr>`).join('')}</tbody></table>` : `<div class="a-empty">${logs === null ? 'Not switched on yet.' : 'No activity yet.'}</div>`}
      </div></div></div>`;

    $('allOut').onclick = async () => {
      if (!(await Admin.confirmBox({ title: 'Sign out everywhere?', text: 'Every device signed in to your dashboard, including this one, will be signed out.', ok: 'Sign out everywhere' }))) return;
      await CMS.logout(true); location.replace('/admin/login/');
    };
    $('chgPw').onclick = () => { $('pwChange').classList.toggle('hidden'); $('pwCur').focus(); };
    $('pwChange').onsubmit = async (e) => {
      e.preventDefault();
      try { await CMS.changePassword($('pwCur').value, $('pwNew').value); Admin.toast('Password changed', 'ok'); e.target.reset(); e.target.classList.add('hidden'); }
      catch (ex) { Admin.toast(ex.message, 'bad'); }
    };
    const start = $('mfaStart');
    if (start) start.onclick = async () => {
      start.disabled = true;
      try {
        const en = await CMS.startMfaEnroll();
        $('mfaBody').innerHTML = `<img class="a-qr" alt="QR code" src="${esc(en.qr)}"><p class="hint">Or type this key: </p><div class="a-secret">${esc(en.secret)}</div>
          <div class="a-field" style="margin-top:14px"><label for="mfaCode">6-digit code</label><input id="mfaCode" class="a-code" inputmode="numeric" maxlength="6" autocomplete="off"></div>
          <button class="a-btn" id="mfaDone">Turn on</button>`;
        $('mfaDone').onclick = async () => {
          try { await CMS.finishMfaEnroll(en.factorId, $('mfaCode').value); Admin.toast('Two-step sign-in is on', 'ok'); route(); } catch (e) { Admin.toast(e.message, 'bad'); }
        };
      } catch (e) { Admin.toast(e.message, 'bad'); start.disabled = false; }
    };
  };

})(window);
