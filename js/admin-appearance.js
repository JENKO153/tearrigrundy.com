/*
 * Appearance: pick the site's colours and the menu bar colours, with the real pages shown live beside the pickers.
 * Saved inside the site settings as `theme` (see js/theme.js for what each colour controls).
 */
(function (window) {
  const A = window.Admin;
  const esc = A.esc, $ = A.$;
  const T = window.TG_THEME;

  const SITE = [
    { key: 'pine', label: 'Dark colour', hint: 'Buttons, the footer, the ribbon and the contact section.', check: { on: '#ffffff', min: 4.5, what: 'White text on it' } },
    { key: 'accent', label: 'Accent colour', hint: 'Highlights, hover fills and small details.', check: { on: '#ffffff', min: 3, what: 'White text on it' } },
    { key: 'link', label: 'Link & label colour', hint: 'Links and the small labels above headings.', check: { onKey: 'bg', min: 3, what: 'It on the page background' } },
    { key: 'bg', label: 'Page background', hint: 'The main background. Light colours work best.', check: { onKey: 'text', min: 4.5, what: 'Your text on it' } },
    { key: 'text', label: 'Text colour', hint: 'Headings and body text.', check: { onKey: 'bg', min: 4.5, what: 'It on the page background' } },
  ];
  const MENU = [
    { key: 'menu', label: 'Menu text', hint: 'The menu links (Home, Blog, About) on the solid bar.', check: { onKey: 'bg', min: 3, what: 'It on the bar' } },
    { key: 'logo', label: 'Site name', hint: '“Tearri Grundy” in the menu bar. One colour for the whole name.', check: { onKey: 'bg', min: 3, what: 'It on the bar' } },
    { key: 'menuHero', label: 'Menu & name over photos', hint: 'Used while the bar sits on top of a big photo (home and blog top). Scroll the preview to see the solid bar.' },
  ];
  const PRESETS = [
    { name: 'Alpine Glow', c: T.DEFAULTS },
    { name: 'Sunset Coast', c: { pine: '#3a1f2b', accent: '#e0603a', link: '#b3474f', bg: '#fdf6f0', text: '#2b1a22', menu: '#2b1a22', logo: '#3a1f2b', menuHero: '#ffffff' } },
    { name: 'Ocean Breeze', c: { pine: '#0b2a45', accent: '#d0701f', link: '#1a6fa3', bg: '#f6faff', text: '#10263a', menu: '#10263a', logo: '#0b2a45', menuHero: '#ffffff' } },
    { name: 'Tropical Forest', c: { pine: '#123524', accent: '#d4823a', link: '#2f7d4f', bg: '#f7faf3', text: '#182b20', menu: '#182b20', logo: '#123524', menuHero: '#ffffff' } },
    { name: 'Rose Gold', c: { pine: '#3b2a2f', accent: '#c9787a', link: '#8a5a6b', bg: '#fcf6f4', text: '#2e2226', menu: '#2e2226', logo: '#3b2a2f', menuHero: '#ffffff' } },
  ];
  const PAGES = [['/', 'Home'], ['/blog/', 'Blog'], ['/about/', 'About']];

  A.views.appearance = async function (arg, root) {
    const { data: saved, available } = await CMS.loadSettings();
    const vals = T.normalise(saved.theme);
    let touched = false, page = '/', device = 'desktop';

    const row = (f) => `<div class="a-color" data-row="${f.key}">
        <div class="a-color-top"><label for="c_${f.key}">${esc(f.label)}</label><button type="button" class="a-reset" data-reset="${f.key}">Reset</button></div>
        <div class="a-color-pick"><input type="color" id="c_${f.key}" data-color="${f.key}" aria-label="${esc(f.label)} colour"><input type="text" class="a-input" data-hex="${f.key}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${esc(f.label)} hex code"><span class="a-read" data-read="${f.key}"></span></div>
        <p class="hint">${esc(f.hint)}</p></div>`;

    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">Appearance</h1><p class="a-lead">Choose your colours and watch the real site change on the right.</p></div></div>
      ${available ? '' : '<div class="a-card" style="border-left:4px solid var(--a-warn)"><h2>One quick set-up step</h2><p class="hint" style="margin:0">Saving needs <code>supabase/00-run-everything.sql</code> to be run once.</p></div>'}
      <div class="a-site">
        <div>
          <div class="a-card"><h2>Quick looks</h2><p class="hint">Start from a ready-made palette, then adjust anything.</p>
            <div class="a-presets">${PRESETS.map((p, i) => `<button type="button" class="a-preset" data-preset="${i}"><span class="dots">${[p.c.pine, p.c.accent, p.c.link, p.c.bg].map((c) => `<i style="background:${c}"></i>`).join('')}</span>${esc(p.name)}</button>`).join('')}</div></div>
          <div class="a-card"><h2>Site colours</h2>${SITE.map(row).join('')}</div>
          <div class="a-card"><h2>Menu bar</h2>${MENU.map(row).join('')}</div>
        </div>
        <div class="a-prev a-prev-tall">
          <div class="a-sample" id="sample" aria-label="Colour sample">
            <div class="s-bar"><span class="s-logo">Tearri Grundy</span><span class="s-menu"><b>HOME</b><span>BLOG</span><span>ABOUT</span></span></div>
            <div class="s-photo"><span class="s-logo s-hero">Tearri Grundy</span><span class="s-menu s-hero"><b>HOME</b><span>BLOG</span><span>ABOUT</span></span><em>Menu over a photo</em></div>
            <div class="s-body"><span class="s-chip">Destinations</span><h4>Two Days in Kyoto</h4>
              <p>Some body text with a <a>link</a> in it.</p><span class="s-btn">Read the blog</span><span class="s-btn2">Hover colour</span></div>
            <div class="s-foot">Footer &amp; contact section</div>
          </div>
          <div class="a-prev-bar"><h2><span class="live-dot"></span>Live preview</h2>
            <div class="a-seg" id="jump"><button type="button" data-jump="top" class="on">Top</button><button type="button" data-jump="posts">Posts</button><button type="button" data-jump="footer">Footer</button></div>
            <div class="a-seg" id="pageSeg">${PAGES.map(([p, l], i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-page="${p}">${l}</button>`).join('')}</div>
            <div class="a-seg" id="dev"><button type="button" class="on" data-dev="desktop">Desktop</button><button type="button" data-dev="mobile">Mobile</button></div></div>
          <div class="a-frame-wrap" id="frameWrap"><iframe id="frame" title="Live preview of your site"></iframe></div>
        </div>
      </div></div>`;

    const frame = $('frame'), wrap = $('frameWrap');
    const ratio = (a, b) => T.contrast(a, b);

    /* ---------- form <-> state ---------- */
    function readout(f) {
      const el = root.querySelector(`[data-read="${f.key}"]`);
      if (!f.check) { el.textContent = ''; return true; }
      const against = f.check.on || vals[f.check.onKey];
      const r = ratio(vals[f.key], against);
      const ok = r >= f.check.min;
      el.className = `a-read ${r < 3 ? 'bad' : ok ? 'ok' : 'warn'}`;
      el.textContent = r < 3 ? '✕ Too hard to read' : ok ? '✓ Easy to read' : '⚠ A bit faint';
      el.title = `${f.check.what}: contrast ${r.toFixed(1)} (aim for ${f.check.min}+)`;
      return r >= 3;
    }
    function paint() {
      [...SITE, ...MENU].forEach((f) => {
        const c = root.querySelector(`[data-color="${f.key}"]`), h = root.querySelector(`[data-hex="${f.key}"]`);
        if (c.value !== vals[f.key]) c.value = vals[f.key];
        if (document.activeElement !== h) h.value = vals[f.key];
        root.querySelector(`[data-reset="${f.key}"]`).hidden = vals[f.key] === T.DEFAULTS[f.key];
        readout(f);
      });
    }
    function setColor(key, v) {
      if (!T.HEX.test(v)) return;
      vals[key] = v.toLowerCase(); touched = true; A.dirty = true; paint(); pushPreview(); bar();
    }
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.color || e.target.dataset.hex;
      if (!k) return;
      let v = e.target.value.trim();
      if (e.target.dataset.hex && v && v[0] !== '#') v = `#${v}`;
      setColor(k, v);
    });
    root.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.hex) paint(); });
    root.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reset]');
      if (r) { setColor(r.dataset.reset, T.DEFAULTS[r.dataset.reset]); return; }
      const p = e.target.closest('[data-preset]');
      if (p) { Object.assign(vals, PRESETS[Number(p.dataset.preset)].c); touched = true; A.dirty = true; paint(); pushPreview(); bar(); }
    });

    /* ---------- live preview ---------- */
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
    function paintSample() { T.apply(vals, $('sample')); }
    // Jump the preview to a part of the page where the colours show up
    function jump(where) {
      const d = frame.contentDocument, w = frame.contentWindow;
      if (!d || !w) return;
      const target = where === 'top' ? null : where === 'posts' ? d.querySelector('.ribbon, .filter-bar, .post-hero, .about-hero, #intro') : d.querySelector('.contact-band, .site-footer');
      const top = target ? target.getBoundingClientRect().top + w.scrollY - 60 : 0;
      w.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    $('jump').addEventListener('click', (e) => {
      const b = e.target.closest('[data-jump]'); if (!b) return;
      $('jump').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      jump(b.dataset.jump);
    });
    function pushPreview() { paintSample(); if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'tg:preview-settings', settings: { theme: vals } }, window.location.origin); }
    const onMsg = (e) => { if (e.origin === window.location.origin && e.source === frame.contentWindow && e.data && e.data.type === 'tg:preview-ready') pushPreview(); };
    window.addEventListener('message', onMsg);
    frame.addEventListener('load', () => { fit(); pushPreview(); });
    $('pageSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]'); if (!b) return;
      page = b.dataset.page;
      $('pageSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      frame.src = `${page}?preview=1`;
    });
    $('dev').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dev]'); if (!b) return;
      device = b.dataset.dev;
      $('dev').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      fit();
    });
    frame.src = '/?preview=1';
    fit();

    /* ---------- save bar ---------- */
    function bar(msg) {
      const el = $('savebar');
      el.innerHTML = `<span class="status ${msg ? 'ok' : A.dirty ? 'dirty' : ''}">${msg || (A.dirty ? '● Unsaved colour changes' : 'No changes yet')}</span>
        <button class="a-btn ghost" id="cAll" type="button">Reset to Alpine Glow</button><button class="a-btn ghost" id="cDiscard" type="button" ${A.dirty ? '' : 'disabled'}>Discard changes</button><button class="a-btn" id="cSave" type="button" ${A.dirty ? '' : 'disabled'}>Save colours</button>`;
      el.classList.add('on');
    }
    const fromSaved = () => Object.assign(vals, T.normalise(saved.theme));
    $('savebar').onclick = async (e) => {
      if (e.target.id === 'cAll') { Object.assign(vals, T.DEFAULTS); touched = true; A.dirty = true; paint(); pushPreview(); bar(); }
      if (e.target.id === 'cDiscard') { fromSaved(); touched = false; A.dirty = false; paint(); pushPreview(); bar(); }
      if (e.target.id === 'cSave') save();
    };
    async function save() {
      const blocked = [...SITE, ...MENU].filter((f) => f.check && !readout(f));
      if (blocked.length) { A.toast(`“${blocked[0].label}” would be too hard to read. Pick a different colour first.`, 'bad'); return; }
      document.querySelectorAll('#savebar .a-btn').forEach((b) => { b.disabled = true; });
      try {
        const res = await A.withWrite('save your colours', async () => {
          const out = { ...saved };
          const isDefault = Object.keys(T.DEFAULTS).every((k) => vals[k] === T.DEFAULTS[k]);
          if (isDefault) delete out.theme; else out.theme = { ...vals };
          await CMS.saveSettings(out);
          return out;
        });
        if (res.cancelled) { bar(); return; }
        Object.keys(saved).forEach((k) => delete saved[k]); Object.assign(saved, res.value);
        try { localStorage.setItem('tg_site_content', JSON.stringify(res.value)); } catch (x) { /* ignore */ }
        touched = false; A.dirty = false;
        bar(`✓ Saved ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — your new colours are live`);
        A.toast('Your new colours are live on the site', 'ok');
      } catch (ex) { A.toast(ex.message, 'bad'); bar(); }
    }

    paint();
    paintSample();
    bar();
    return function cleanup() { window.removeEventListener('message', onMsg); ro.disconnect(); $('savebar').onclick = null; void touched; };
  };
})(window);
