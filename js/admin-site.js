/*
 * Homepage & About editor: change the wording and photos on the public pages from simple forms,
 * with the real page shown live on the right. The fields come from TG_SITE (site-defaults.js);
 * only values that differ from the built-in wording are saved.
 */
(function (window) {
  const A = window.Admin;
  const esc = A.esc, $ = A.$;
  const SITE = window.TG_SITE;
  const WORK_KEY = 'tg_site_work';

  const allFields = SITE.sections.flatMap((s) => s.groups.flatMap((g) => g.fields));
  const byKey = Object.fromEntries(allFields.map((f) => [f.key, f]));
  const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const dataUrlToBlob = (u) => {
    const [head, b64] = u.split(',');
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: (head.match(/:(.*?);/) || [])[1] || 'image/webp' });
  };

  A.views.site = async function (arg, root) {
    const { data: saved, available } = await CMS.loadSettings();
    let sectionId = SITE.sections.some((s) => s.id === arg) ? arg : SITE.sections[0].id;

    // current values: saved wording on top of the original wording
    const vals = {};
    allFields.forEach((f) => { const v = getPath(saved, f.key); vals[f.key] = typeof v === 'string' && v.trim() ? v : f.def; });
    let touched = false;

    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">Homepage &amp; About</h1><p class="a-lead">Change the words and photos on your site. You'll see it update on the right as you type.</p></div></div>
      ${available ? '' : '<div class="a-card" style="border-left:4px solid var(--a-warn)"><h2>One quick set-up step</h2><p class="hint" style="margin:0">Saving page content needs <code>supabase/01-dashboard.sql</code> to be run once. You can still try things out here.</p></div>'}
      <div id="siteRestore" class="a-note hidden" style="align-items:center;gap:12px;flex-wrap:wrap"><span style="flex:1">Restored your unsaved changes.</span><button class="a-btn ghost sm" id="siteDiscard" type="button">Discard them</button></div>
      <div class="a-toolbar"><div class="a-tabs" id="siteTabs">${SITE.sections.map((s) => `<button type="button" class="a-tab" data-sec="${s.id}">${esc(s.label)}</button>`).join('')}</div></div>
      <div class="a-site">
        <div id="siteForm"></div>
        <div class="a-prev">
          <div class="a-prev-bar"><h2><span class="live-dot"></span>Live preview</h2>
            <div class="a-seg" id="dev"><button type="button" class="on" data-dev="desktop">Desktop</button><button type="button" data-dev="mobile">Mobile</button></div></div>
          <div class="a-frame-wrap" id="frameWrap"><iframe id="frame" title="Live preview of your page"></iframe></div>
        </div>
      </div></div>`;

    const frame = $('frame'), wrap = $('frameWrap');
    let device = 'desktop';

    /* ---------- form ---------- */
    function fieldHtml(f) {
      const id = `f_${f.key.replace('.', '_')}`;
      const changed = vals[f.key] !== f.def;
      const reset = `<button type="button" class="a-reset" data-reset="${f.key}" ${changed ? '' : 'hidden'}>Use original</button>`;
      if (f.type === 'image') {
        return `<div class="a-field"><label>${esc(f.label)}${reset}</label><div class="a-imgfield">
          <div class="a-thumb" data-thumb="${f.key}" style="background-image:url('${esc(vals[f.key])}')"></div>
          <div class="btns"><button type="button" class="a-btn ghost sm" data-pick="${f.key}">Change photo</button></div>
          <input type="file" accept="image/*" class="hidden" data-file="${f.key}"></div></div>`;
      }
      const counter = f.max ? `<span class="count" data-count="${f.key}">${vals[f.key].length}/${f.max}</span>` : '';
      const attrs = `id="${id}" data-key="${f.key}" ${f.max ? `maxlength="${f.max}"` : ''}`;
      const control = f.type === 'textarea'
        ? `<textarea ${attrs} rows="${f.rows || 3}">${esc(vals[f.key])}</textarea>`
        : `<input ${attrs} type="${f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}" value="${esc(vals[f.key])}">`;
      return `<div class="a-field"><label for="${id}">${esc(f.label)}${reset}${counter}</label>${control}</div>`;
    }
    function drawForm() {
      const sec = SITE.sections.find((s) => s.id === sectionId);
      $('siteTabs').querySelectorAll('.a-tab').forEach((t) => t.classList.toggle('on', t.dataset.sec === sectionId));
      $('siteForm').innerHTML = sec.groups.map((g) => `<div class="a-card"><h2>${esc(g.title)}</h2>${g.hint ? `<p class="hint">${esc(g.hint)}</p>` : '<p class="hint"></p>'}${g.fields.map(fieldHtml).join('')}</div>`).join('');
      const src = `${sec.page}?preview=1`;
      if (!frame.getAttribute('src') || new URL(frame.src).pathname !== sec.page) frame.src = src; else pushPreview();
      history.replaceState(null, '', `#site/${sectionId}`);
    }
    const nested = (only) => {
      const out = {};
      Object.keys(vals).forEach((k) => {
        if (only && vals[k] === byKey[k].def) return;
        const [a, b] = k.split('.');
        (out[a] = out[a] || {})[b] = vals[k];
      });
      return out;
    };
    const refreshField = (key) => {
      const f = byKey[key];
      const btn = $('siteForm').querySelector(`[data-reset="${key}"]`);
      if (btn) btn.hidden = vals[key] === f.def;
      const c = $('siteForm').querySelector(`[data-count="${key}"]`);
      if (c) c.textContent = `${vals[key].length}/${f.max}`;
    };

    $('siteTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) { sectionId = b.dataset.sec; drawForm(); } });
    $('siteForm').addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      if (!key) return;
      vals[key] = e.target.value;
      refreshField(key); changed();
    });
    $('siteForm').addEventListener('click', (e) => {
      const r = e.target.closest('[data-reset]');
      if (r) { const f = byKey[r.dataset.reset]; vals[f.key] = f.def; drawForm(); changed(); return; }
      const p = e.target.closest('[data-pick]');
      if (p) $('siteForm').querySelector(`[data-file="${p.dataset.pick}"]`).click();
    });
    $('siteForm').addEventListener('change', async (e) => {
      const key = e.target.dataset.file;
      if (!key) return;
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try { vals[key] = await CMS.blobToDataUrl(await CMS.prepareImage(file)); drawForm(); changed(); }
      catch (err) { A.toast(err.message, 'bad'); }
    });

    /* ---------- preview ---------- */
    function fit() {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      if (device === 'desktop') {
        const scale = W / 1280;
        Object.assign(frame.style, { width: '1280px', height: `${H / scale}px`, transform: `scale(${scale})`, left: '0px', top: '0px' });
      } else {
        const scale = Math.min(1, (H - 40) / 780, (W - 40) / 390);
        Object.assign(frame.style, { width: '390px', height: '780px', transform: `scale(${scale})`, left: `${(W - 390 * scale) / 2}px`, top: '20px' });
      }
      wrap.classList.toggle('mobile', device === 'mobile');
    }
    const ro = new ResizeObserver(fit); ro.observe(wrap);
    $('dev').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dev]'); if (!b) return;
      device = b.dataset.dev;
      $('dev').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      fit();
    });
    function pushPreview() { if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'tg:preview-settings', settings: nested(false) }, window.location.origin); }
    const sendPreview = A.debounce(pushPreview, 100);
    const onMsg = (e) => { if (e.origin === window.location.origin && e.source === frame.contentWindow && e.data && e.data.type === 'tg:preview-ready') pushPreview(); };
    window.addEventListener('message', onMsg);
    fit();

    /* ---------- autosave, dirty, save bar ---------- */
    const persist = A.debounce(() => { try { localStorage.setItem(WORK_KEY, JSON.stringify({ vals, at: new Date().toISOString() })); } catch (e) { /* too big: skip */ } }, 500);
    function changed() { touched = true; A.dirty = true; persist(); sendPreview(); bar(); }
    function bar(msg) {
      const el = $('savebar');
      el.innerHTML = `<span class="status ${msg ? 'ok' : A.dirty ? 'dirty' : ''}">${msg || (A.dirty ? '● Unsaved changes' : 'No changes yet')}</span>
        <button class="a-btn ghost" id="sDiscard" type="button" ${A.dirty ? '' : 'disabled'}>Discard changes</button><button class="a-btn" id="sSave" type="button" ${A.dirty ? '' : 'disabled'}>Save changes</button>`;
      el.classList.add('on');
    }
    function restoreSaved() { allFields.forEach((f) => { const v = getPath(saved, f.key); vals[f.key] = typeof v === 'string' && v.trim() ? v : f.def; }); }
    $('savebar').onclick = async (e) => {
      if (e.target.id === 'sDiscard') {
        if (!(await A.confirmBox({ title: 'Discard your changes?', text: 'Everything goes back to how it was last saved.', ok: 'Discard', danger: true }))) return;
        restoreSaved(); A.dirty = false; touched = false; try { localStorage.removeItem(WORK_KEY); } catch (x) { /* ignore */ }
        $('siteRestore').classList.add('hidden'); drawForm(); bar();
      }
      if (e.target.id === 'sSave') save();
    };
    async function save() {
      for (const f of allFields) {
        const v = (vals[f.key] || '').trim();
        if (f.type === 'url' && v && !/^https:\/\/\S+$/.test(v)) { A.toast(`${f.label} must start with https://`, 'bad'); return; }
        if (f.type === 'email' && v && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)) { A.toast(`${f.label} doesn't look like an email address.`, 'bad'); return; }
      }
      document.querySelectorAll('#savebar .a-btn').forEach((b) => { b.disabled = true; });
      try {
        const res = await A.withWrite('save your page changes', async () => {
          for (const f of allFields.filter((x) => x.type === 'image')) {
            if (vals[f.key].startsWith('data:')) vals[f.key] = await CMS.uploadImage(null, f.folder || 'site', dataUrlToBlob(vals[f.key]));
          }
          const out = nested(true);
          if (saved.money) out.money = saved.money; // earnings settings live in the same record
          await CMS.saveSettings(out);
          return out;
        });
        if (res.cancelled) { bar(); return; }
        Object.keys(saved).forEach((k) => delete saved[k]); Object.assign(saved, res.value);
        try { localStorage.removeItem(WORK_KEY); localStorage.setItem('tg_site_content', JSON.stringify(res.value)); } catch (e) { /* ignore */ }
        touched = false; A.dirty = false;
        $('siteRestore').classList.add('hidden');
        drawForm();
        bar(`✓ Saved ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — it's live`);
        A.toast('Your changes are live on the site', 'ok');
      } catch (e) { A.toast(e.message, 'bad'); bar(); }
    }

    /* ---------- restore unsaved work ---------- */
    let work = null;
    try { work = JSON.parse(localStorage.getItem(WORK_KEY)); } catch (e) { /* none */ }
    if (work && work.vals && allFields.some((f) => typeof work.vals[f.key] === 'string' && work.vals[f.key] !== vals[f.key])) {
      allFields.forEach((f) => { if (typeof work.vals[f.key] === 'string') vals[f.key] = work.vals[f.key]; });
      A.dirty = true; touched = true;
      $('siteRestore').classList.remove('hidden'); $('siteRestore').style.display = 'flex';
      $('siteDiscard').onclick = () => { restoreSaved(); A.dirty = false; touched = false; try { localStorage.removeItem(WORK_KEY); } catch (e) { /* ignore */ } $('siteRestore').classList.add('hidden'); drawForm(); bar(); };
    }
    frame.addEventListener('load', () => { fit(); pushPreview(); });
    drawForm();
    bar();

    return function cleanup() {
      if (touched) persist.flush();
      window.removeEventListener('message', onMsg);
      ro.disconnect();
      $('savebar').onclick = null;
    };
  };
})(window);
