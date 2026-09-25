/*
 * Post editor: write a new post or edit any existing one, with the real site page as a live preview.
 *
 *  - Everything you type is autosaved on this device as you go (so an idle sign-out never loses work).
 *  - "Save draft" needs no password; publishing / updating a live post / un-publishing does.
 *  - Photos are resized to WebP in the browser the moment they are picked, kept in the editor as
 *    previews, and uploaded only when you save.
 */
(function (window) {
  const A = window.Admin;
  const esc = A.esc, $ = A.$;

  const STYLES = [
    ['title', 'Heading'], ['subtitle', 'Subheading'], ['paragraph-lg', 'Paragraph — large'],
    ['paragraph', 'Paragraph'], ['paragraph-sm', 'Paragraph — small'], ['bullets', 'Bullet list'], ['photo', 'Photo'],
    ['map', 'Hotel map (Stay22)'], ['widget', 'Travel widget (Travelpayouts)'],
  ];
  const BASE_CATEGORIES = ['Destinations', 'Food & Drink', 'Travel Tips', 'Culture', 'Adventure'];
  const EXCERPT_MAX = 160;

  const dataUrlToBlob = (u) => {
    const [head, b64] = u.split(',');
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: (head.match(/:(.*?);/) || [])[1] || 'image/webp' });
  };
  const inputDate = (iso) => { const d = new Date(iso); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

  A.views.post = async function (arg, root) {
    const posts = A.posts.length ? A.posts : await A.loadPosts();
    const money = ((await CMS.loadSettings().catch(() => ({ data: {} }))).data || {}).money || {};
    const isNew = !arg || arg === 'new';
    let post = isNew ? null : posts.find((p) => String(p.id) === arg);
    if (!isNew && !post) {
      root.innerHTML = '<div class="a-view"><div class="a-card a-empty">That post could not be found. <a href="#posts">Back to all posts</a></div></div>';
      return;
    }
    let WORK_KEY = `tg_editor_${isNew ? 'new' : post.id}`;
    const categories = Array.from(new Set([...BASE_CATEGORIES, ...posts.map((p) => p.category).filter(Boolean)]));
    let wasLive = !!post && post.status !== 'draft';
    let touched = false;

    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">${isNew ? 'Write a new post' : 'Edit post'}</h1>
        <p class="a-lead" id="edSub">${isNew ? 'Fill in the details, build the post block by block, and watch it come together on the right.' : `${esc(post.title || 'Untitled')}`}</p></div>
        <a class="a-btn ghost sm" href="#posts">&larr; All posts</a></div>
      <div id="restore" class="a-note hidden" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span id="restoreMsg" style="flex:1"></span><button class="a-btn ghost sm" id="restoreDiscard" type="button">Discard &amp; start fresh</button></div>
      <div class="a-editor">
        <div class="a-edit-form">
          <div class="a-card">
            <div class="a-field"><label for="fTitle">Title</label><input id="fTitle" maxlength="120" placeholder="e.g. Two Days in Kyoto" autocomplete="off"></div>
            <div class="a-field"><label for="fCat">Category</label>
              <select id="fCat"><option value="">Choose a category…</option>${categories.map((c) => `<option>${esc(c)}</option>`).join('')}<option value="__new__">+ New category…</option></select>
              <input id="fCatNew" class="a-input hidden" style="margin-top:8px" maxlength="30" placeholder="New category name"></div>
            <div class="a-field"><label>Cover photo</label>
              <div class="a-cover" id="cover" tabindex="0" role="button" aria-label="Choose cover photo"><p><b>Drop a photo here</b> or click to choose one</p></div>
              <input type="file" id="coverFile" accept="image/*" class="hidden"></div>
            <div class="a-field" style="margin-bottom:0"><label for="fExcerpt">Short excerpt <span class="count" id="exCount">0/${EXCERPT_MAX}</span></label>
              <textarea id="fExcerpt" rows="2" maxlength="${EXCERPT_MAX}" placeholder="One sentence that shows on the blog cards"></textarea></div>
          </div>
          <div class="a-card"><h2>Post content</h2><p class="hint">Build it block by block. Drag a block by its handle (or use the arrows) to reorder. You can drop photos straight onto this area. To link words (like a hotel), select them and press <b>Link</b> (or Ctrl/Cmd + K).</p>
            <div class="a-blocks" id="blocks"></div>
            <div class="a-add" id="addRow">
              <button type="button" data-add="title">+ Heading</button><button type="button" data-add="subtitle">+ Subheading</button>
              <button type="button" data-add="paragraph">+ Paragraph</button><button type="button" data-add="bullets">+ Bullet list</button><button type="button" data-add="photo">+ Photo</button>
              <button type="button" data-add="map">+ Hotel map</button><button type="button" data-add="widget">+ Travel widget</button></div>
            <input type="file" id="multiFile" accept="image/*" multiple class="hidden">
          </div>
          <div class="a-card"><h2>Publishing</h2>
            <p class="hint" id="pubInfo"></p>
            <label class="a-check"><input type="checkbox" id="fSched"> Schedule for later</label>
            <div class="a-sched" id="schedBox"><div><div class="a-field" style="margin:12px 0 0"><label for="fWhen">Go live on</label><input type="datetime-local" id="fWhen"><p class="hint">It goes live by itself at that time.</p></div></div></div>
            ${isNew ? '' : `<div class="a-actions" style="margin-top:18px">${wasLive ? `<a class="a-btn ghost sm" id="viewLive" target="_blank" rel="noopener">View on site ↗</a>` : ''}<button class="a-btn danger sm" id="delBtn" type="button">Delete post</button></div>`}
          </div>
        </div>
        <div class="a-prev">
          <div class="a-prev-bar"><h2><span class="live-dot"></span>Live preview</h2>
            <div class="a-seg" id="dev"><button type="button" class="on" data-dev="desktop">Desktop</button><button type="button" data-dev="mobile">Mobile</button></div></div>
          <div class="a-frame-wrap" id="frameWrap"><iframe id="frame" title="Live preview of your post" src="/post/?preview=1"></iframe></div>
        </div>
      </div></div>`;

    /* ---------- form state helpers ---------- */
    const f = { title: $('fTitle'), cat: $('fCat'), catNew: $('fCatNew'), excerpt: $('fExcerpt'), sched: $('fSched'), when: $('fWhen') };
    let cover = '';           // URL, or data: URL for a photo not uploaded yet
    let liveDate = post ? post.date : null;
    let lastSaved = null;
    const blocksEl = $('blocks');

    const category = () => (f.cat.value === '__new__' ? f.catNew.value.trim() : f.cat.value);

    /* ---------- cover ---------- */
    function drawCover() {
      const el = $('cover');
      el.innerHTML = cover
        ? `<img src="${esc(cover)}" alt="Cover photo preview"><button type="button" class="a-btn ghost sm clear" data-clear>Remove</button>`
        : '<p><b>Drop a photo here</b> or click to choose one</p>';
    }
    async function takeImage(file) {
      try { return await CMS.blobToDataUrl(await CMS.prepareImage(file)); }
      catch (e) { A.toast(e.message, 'bad'); return null; }
    }
    const wireDrop = (el, onFiles) => {
      ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('over'); } }));
      ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, () => el.classList.remove('over')));
      el.addEventListener('drop', (e) => {
        const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter((x) => CMS.imageOk(x));
        if (files.length) { e.preventDefault(); e.stopPropagation(); onFiles(files); }
      });
    };
    $('cover').addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { cover = ''; drawCover(); changed(); } else $('coverFile').click(); });
    $('cover').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('coverFile').click(); } });
    $('coverFile').addEventListener('change', async () => { const file = $('coverFile').files[0]; $('coverFile').value = ''; if (file) { const u = await takeImage(file); if (u) { cover = u; drawCover(); changed(); } } });
    wireDrop($('cover'), async (files) => { const u = await takeImage(files[0]); if (u) { cover = u; drawCover(); changed(); } });

    /* ---------- blocks ---------- */
    const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 48)}px`; };
    function makeBlock(b = {}) {
      const row = document.createElement('div');
      row.className = 'a-block';
      row.dataset.image = b.image || '';
      const style = b.style || 'paragraph';
      row.innerHTML = `<div class="a-block-top"><span class="a-grip" title="Drag to reorder" aria-hidden="true">⠿</span>
        <span class="a-block-type"></span>
        <select class="b-style" aria-label="Block type">${STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <button type="button" class="a-icon b-link" data-act="link" title="Turn selected words into a link (Ctrl/Cmd+K)">Link</button>
        <button type="button" class="a-icon" data-act="up" title="Move up" aria-label="Move up">↑</button>
        <button type="button" class="a-icon" data-act="down" title="Move down" aria-label="Move down">↓</button>
        <button type="button" class="a-icon danger" data-act="del" title="Remove" aria-label="Remove block">✕</button></div>
        <textarea class="b-text" rows="2"></textarea>
        <div class="b-embed hidden"><input class="caption b-embed-val" maxlength="300" autocomplete="off"><input class="caption b-embed-cap" style="margin-top:8px" maxlength="80" placeholder="Heading above it (optional)"><p class="hint b-embed-hint"></p></div>
        <div class="b-photo hidden"><div class="photo-pick" tabindex="0" role="button" aria-label="Choose photo"></div>
          <input class="caption b-cap" placeholder="Caption (optional)" maxlength="140"><input type="file" accept="image/*" class="hidden b-file"></div>`;
      row.querySelector('.b-style').value = style;
      const ta = row.querySelector('.b-text');
      if (style === 'photo') row.querySelector('.b-cap').value = b.text || '';
      else if (isEmbed(style)) { row.querySelector('.b-embed-val').value = b.text || ''; row.querySelector('.b-embed-cap').value = b.caption || ''; }
      else ta.value = b.text || '';
      modeFor(row);
      // drag to reorder (only from the handle)
      const grip = row.querySelector('.a-grip');
      grip.addEventListener('mousedown', () => { row.draggable = true; });
      grip.addEventListener('touchstart', () => { row.draggable = false; }, { passive: true });
      row.addEventListener('dragstart', (e) => { if (!row.draggable) return; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-block', '1'); dragged = row; });
      row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('dragging'); blocksEl.querySelectorAll('.dropover').forEach((x) => x.classList.remove('dropover')); dragged = null; });
      row.addEventListener('dragover', (e) => { if (dragged && dragged !== row) { e.preventDefault(); row.classList.add('dropover'); } });
      row.addEventListener('dragleave', () => row.classList.remove('dropover'));
      row.addEventListener('drop', (e) => {
        if (!dragged || dragged === row) return;
        e.preventDefault(); e.stopPropagation(); row.classList.remove('dropover');
        const after = [...blocksEl.children].indexOf(dragged) < [...blocksEl.children].indexOf(row);
        blocksEl.insertBefore(dragged, after ? row.nextSibling : row);
        changed();
      });
      wireDrop(row.querySelector('.photo-pick'), async (files) => { const u = await takeImage(files[0]); if (u) { setPhoto(row, u); changed(); } });
      return row;
    }
    let dragged = null;
    const isEmbed = (s) => s === 'map' || s === 'widget';
    const LINKABLE = ['paragraph-lg', 'paragraph', 'paragraph-sm', 'bullets'];
    async function addLink(row) {
      const ta = row.querySelector('.b-text');
      const from = ta.selectionStart, to = ta.selectionEnd;
      const res = await A.linkDialog(ta.value.slice(from, to));
      ta.focus();
      if (!res) return;
      const md = `[${res.text}](${res.url})`;
      ta.value = ta.value.slice(0, from) + md + ta.value.slice(to);
      ta.setSelectionRange(from + md.length, from + md.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function modeFor(row) {
      const s = row.querySelector('.b-style').value;
      const ta = row.querySelector('.b-text');
      const photo = s === 'photo', embed = isEmbed(s);
      row.querySelector('.b-photo').classList.toggle('hidden', !photo);
      row.querySelector('.b-link').classList.toggle('hidden', !LINKABLE.includes(s));
      row.querySelector('.b-embed').classList.toggle('hidden', !embed);
      if (embed) {
        const v = row.querySelector('.b-embed-val');
        v.placeholder = s === 'map' ? 'Place to show hotels around, e.g. Kyoto, Japan' : 'Paste the widget link from Travelpayouts (starts with https://)';
        row.querySelector('.b-embed-hint').textContent = s === 'map'
          ? (money.stay22 && money.stay22.enabled ? 'Shows an interactive map of places to stay. You earn when someone books through it.' : 'Turn on Stay22 under Earnings for this to show on the site.')
          : (money.travelpayouts && money.travelpayouts.enabled ? 'A flight/hotel search box from your Travelpayouts account.' : 'Turn on Travelpayouts under Earnings for this to show on the site.');
      }
      ta.className = `b-text t-${s}${photo || embed ? ' hidden' : ''}`;
      ta.placeholder = s === 'bullets' ? 'One point per line…' : s === 'title' ? 'Heading' : s === 'subtitle' ? 'Subheading' : 'Write here…';
      row.querySelector('.a-block-type').textContent = STYLES.find(([v]) => v === s)[1];
      drawPhoto(row);
      if (!photo && !embed) grow(ta);
    }
    function drawPhoto(row) {
      const pick = row.querySelector('.photo-pick'), img = row.dataset.image;
      pick.innerHTML = img ? `<img src="${esc(img)}" alt="">` : '<b style="color:var(--terracotta)">Drop a photo</b> or click to choose';
    }
    function setPhoto(row, url) { row.dataset.image = url; drawPhoto(row); }
    function addBlock(b, focus) {
      const row = makeBlock(b);
      blocksEl.appendChild(row);
      const ta = row.querySelector('.b-text');
      if (focus) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (!ta.classList.contains('hidden')) ta.focus(); }
      return row;
    }
    async function addPhotoBlocks(files) {
      for (const file of files) { const u = await takeImage(file); if (u) addBlock({ style: 'photo', image: u }); }
      changed();
    }
    $('addRow').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      if (btn.dataset.add === 'photo') { $('multiFile').click(); return; }
      addBlock({ style: btn.dataset.add }, true); changed();
    });
    $('multiFile').addEventListener('change', () => { const files = [...$('multiFile').files]; $('multiFile').value = ''; if (files.length) addPhotoBlocks(files); });
    wireDrop(blocksEl, (files) => addPhotoBlocks(files));

    blocksEl.addEventListener('click', (e) => {
      const row = e.target.closest('.a-block');
      if (!row) return;
      const act = e.target.closest('[data-act]');
      if (e.target.closest('.photo-pick')) { row.querySelector('.b-file').click(); return; }
      if (!act) return;
      if (act.dataset.act === 'link') { addLink(row); return; }
      if (act.dataset.act === 'del') { row.remove(); if (!blocksEl.children.length) addBlock({ style: 'paragraph-lg' }); }
      if (act.dataset.act === 'up' && row.previousElementSibling) blocksEl.insertBefore(row, row.previousElementSibling);
      if (act.dataset.act === 'down' && row.nextElementSibling) blocksEl.insertBefore(row.nextElementSibling, row);
      changed();
    });
    blocksEl.addEventListener('change', async (e) => {
      const row = e.target.closest('.a-block');
      if (!row) return;
      if (e.target.classList.contains('b-style')) { modeFor(row); }
      if (e.target.classList.contains('b-file')) {
        const file = e.target.files[0]; e.target.value = '';
        if (file) { const u = await takeImage(file); if (u) { setPhoto(row, u); changed(); } }
      }
    });
    blocksEl.addEventListener('input', (e) => { if (e.target.classList.contains('b-text')) grow(e.target); });
    blocksEl.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && e.target.classList.contains('b-text') && LINKABLE.includes(e.target.closest('.a-block').querySelector('.b-style').value)) { e.preventDefault(); addLink(e.target.closest('.a-block')); return; } if (e.target.classList.contains('photo-pick') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.closest('.a-block').querySelector('.b-file').click(); } });

    const readBlocks = () => [...blocksEl.children].map((row) => {
      const b = readBlocksRaw(row);
      return { ...b, text: (b.text || '').trim() };
    });
    const meaningful = (b) => (b.style === 'photo' ? !!b.image : !!b.text);

    /* ---------- category "new" toggle, excerpt count, schedule ---------- */
    f.cat.addEventListener('change', () => { f.catNew.classList.toggle('hidden', f.cat.value !== '__new__'); if (f.cat.value === '__new__') f.catNew.focus(); });
    const countEx = () => { $('exCount').textContent = `${f.excerpt.value.length}/${EXCERPT_MAX}`; };
    f.excerpt.addEventListener('input', countEx);
    f.sched.addEventListener('change', () => {
      $('schedBox').classList.toggle('open', f.sched.checked);
      if (f.sched.checked && !f.when.value) { const d = new Date(Date.now() + 86400e3); d.setHours(9, 0, 0, 0); f.when.value = inputDate(d); }
      refreshBar();
    });

    /* ---------- live preview ---------- */
    const frame = $('frame'), wrap = $('frameWrap');
    let device = 'desktop';
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
      fit(); sendPreview();
    });
    const scheduledDate = () => (f.sched.checked && f.when.value ? new Date(f.when.value) : null);
    function previewPost() {
      const when = scheduledDate();
      return {
        id: 'preview', title: f.title.value.trim() || 'Your post title', category: category() || 'Category',
        excerpt: f.excerpt.value, image: cover, date: (when || (wasLive && liveDate ? new Date(liveDate) : new Date())).toISOString(),
        author: 'Tearri', content: readBlocks().filter(meaningful),
      };
    }
    function pushPreview() { if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'tg:preview', post: previewPost(), money }, window.location.origin); }
    const sendPreview = A.debounce(pushPreview, 120);
    const onMsg = (e) => { if (e.origin === window.location.origin && e.source === frame.contentWindow && e.data && e.data.type === 'tg:preview-ready') pushPreview(); };
    window.addEventListener('message', onMsg);
    frame.addEventListener('load', () => { fit(); pushPreview(); });
    fit();

    /* ---------- autosave on this device ---------- */
    function snapshot() {
      return { title: f.title.value, category: f.cat.value, catNew: f.catNew.value, excerpt: f.excerpt.value, cover,
        sched: f.sched.checked, when: f.when.value, blocks: [...blocksEl.children].map((row) => ({ ...readBlocksRaw(row) })), at: new Date().toISOString() };
    }
    const readBlocksRaw = (row) => {
      const style = row.querySelector('.b-style').value;
      if (style === 'photo') return { style, text: row.querySelector('.b-cap').value, image: row.dataset.image || '' };
      if (isEmbed(style)) return { style, text: row.querySelector('.b-embed-val').value, caption: row.querySelector('.b-embed-cap').value.trim() };
      return { style, text: row.querySelector('.b-text').value };
    };
    const persist = A.debounce(() => {
      try { localStorage.setItem(WORK_KEY, JSON.stringify(snapshot())); }
      catch (e) { A.toast('This device is out of space for autosave — save your draft soon.', 'bad'); }
    }, 500);
    function apply(s) {
      f.title.value = s.title || '';
      if (s.category && ![...f.cat.options].some((o) => o.value === s.category)) f.cat.add(new Option(s.category, s.category), f.cat.options[f.cat.options.length - 1]);
      f.cat.value = s.category || '';
      f.catNew.value = s.catNew || ''; f.catNew.classList.toggle('hidden', f.cat.value !== '__new__');
      f.excerpt.value = s.excerpt || ''; countEx();
      cover = s.cover || ''; drawCover();
      f.sched.checked = !!s.sched; f.when.value = s.when || ''; $('schedBox').classList.toggle('open', f.sched.checked);
      blocksEl.innerHTML = '';
      (s.blocks && s.blocks.length ? s.blocks : [{ style: 'paragraph-lg' }]).forEach((b) => addBlock(b));
    }
    const fromPost = (p) => ({
      title: p.title, category: p.category, excerpt: p.excerpt, cover: p.image, sched: new Date(p.date) > new Date(),
      when: new Date(p.date) > new Date() ? inputDate(p.date) : '',
      blocks: (p.content || []).map((b) => (typeof b === 'string' ? { style: 'paragraph', text: b } : b)),
    });

    /* ---------- dirty state + save bar ---------- */
    function changed() { touched = true; A.dirty = true; persist(); sendPreview(); refreshBar(); }
    ['input', 'change'].forEach((ev) => $('view').querySelector('.a-edit-form').addEventListener(ev, (e) => { if (e.target.type !== 'file') changed(); }));
    function label() {
      const when = scheduledDate();
      if (when && when > new Date()) return { key: 'publish', text: 'Schedule post' };
      return { key: 'publish', text: wasLive ? 'Update post' : 'Publish post' };
    }
    function refreshBar() {
      const bar = $('savebar');
      const st = lastSaved && !A.dirty ? `<span class="status ok">✓ Saved ${lastSaved}</span>` : A.dirty ? '<span class="status dirty">● Unsaved changes — autosaved on this device</span>' : '<span class="status">No changes yet</span>';
      const l = label();
      bar.innerHTML = `${st}${wasLive && CMS.caps.drafts ? '<button class="a-btn ghost" id="bDraft" type="button">Move back to drafts</button>' : wasLive ? '' : '<button class="a-btn ghost" id="bDraft" type="button">Save draft</button>'}<button class="a-btn" id="bPub" type="button">${l.text}</button>`;
      bar.classList.add('on');
      $('pubInfo').textContent = wasLive
        ? (new Date(liveDate) > new Date() ? `Scheduled for ${A.fmtDateTime(liveDate)}.` : `Live since ${A.fmtDate(liveDate)}. Changes go live as soon as you press Update.`)
        : 'Not published yet. Save a draft any time, or publish when it\'s ready.';
    }
    $('savebar').onclick = (e) => {
      if (e.target.id === 'bDraft') save('draft');
      if (e.target.id === 'bPub') save('publish');
    };

    /* ---------- saving ---------- */
    function invalid(msg, el) {
      A.toast(msg, 'bad');
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.focus) el.focus(); }
      return false;
    }
    function validate() {
      if (!f.title.value.trim()) return invalid('Give your post a title first.', f.title);
      if (!category()) return invalid('Choose a category.', f.cat.value === '__new__' ? f.catNew : f.cat);
      if (!cover) return invalid('Add a cover photo — it shows on the blog cards.', $('cover'));
      if (!f.excerpt.value.trim()) return invalid('Add a short excerpt for the blog cards.', f.excerpt);
      if (!readBlocks().some(meaningful)) return invalid('Write something in the post first.', blocksEl.querySelector('textarea:not(.hidden)'));
      const badWidget = [...blocksEl.children].find((row) => row.querySelector('.b-style').value === 'widget' && row.querySelector('.b-embed-val').value.trim() && !/^https:\/\/\S+$/.test(row.querySelector('.b-embed-val').value.trim()));
      if (badWidget) return invalid('The Travelpayouts widget link must start with https://', badWidget.querySelector('.b-embed-val'));
      const when = scheduledDate();
      if (f.sched.checked && !when) return invalid('Pick a date and time to schedule for.', f.when);
      return true;
    }
    async function uploadPending(url, folder) {
      if (url && url.startsWith('data:')) return CMS.uploadImage(null, folder, dataUrlToBlob(url));
      return url;
    }
    let saving = false;
    async function save(kind) {
      if (saving) return;
      const publish = kind === 'publish';
      if (publish && !validate()) return;
      if (!publish && !f.title.value.trim()) return invalid('Give your draft a title so you can find it again.', f.title);
      const when = scheduledDate();
      const scheduledFuture = when && when > new Date();
      let date;
      if (scheduledFuture) date = when.toISOString();
      else if (wasLive && liveDate && !(when && when <= new Date())) date = new Date(liveDate).toISOString();
      else date = new Date().toISOString();
      if (!publish) date = when ? when.toISOString() : (post && post.date) || new Date().toISOString();

      const needsGrant = publish || wasLive;
      const verb = !publish ? 'move this post back to drafts' : scheduledFuture ? 'schedule this post' : wasLive ? 'update this post' : 'publish this post';
      const btns = document.querySelectorAll('#savebar .a-btn');
      const run = async () => {
        const blocks = [];
        for (const b of readBlocks()) {
          if (publish && !meaningful(b)) continue;
          blocks.push(b.style === 'photo' ? { ...b, image: await uploadPending(b.image, 'posts') } : b);
        }
        const payload = {
          id: post && post.id, slug: post && post.slug, title: f.title.value.trim(), category: category() || 'Uncategorized',
          excerpt: f.excerpt.value.trim(), image: await uploadPending(cover, 'posts'), date, content: blocks,
          status: publish ? 'published' : 'draft', author: (post && post.author) || 'Tearri',
        };
        return CMS.savePost(payload);
      };
      saving = true; btns.forEach((b) => { b.disabled = true; });
      try {
        const res = needsGrant ? await A.withWrite(verb, run) : { value: await run() };
        if (res.cancelled) return;
        const saved = res.value;
        post = saved;
        const wasNew = isNew;
        touched = false;
        try { localStorage.removeItem(WORK_KEY); localStorage.removeItem('tg_editor_new'); } catch (e) { /* ignore */ }
        WORK_KEY = `tg_editor_${saved.id}`;
        wasLive = saved.status !== 'draft'; liveDate = saved.date;
        cover = saved.image || ''; drawCover();
        [...blocksEl.children].forEach((row, i) => { const b = (saved.content || [])[i]; if (b && b.style === 'photo') setPhoto(row, b.image); });
        A.dirty = false;
        lastSaved = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        A.toast(publish ? (scheduledFuture ? `Scheduled for ${A.fmtDateTime(date)}` : wasLive ? 'Post updated' : 'Post published! It\'s live on the blog.') : 'Draft saved', 'ok');
        await A.loadPosts();
        if (publish) { A.go('#posts'); return; }
        if (wasNew) history.replaceState(null, '', `#post/${saved.id}`);
        refreshBar(); // stay in the editor as a draft
      } catch (e) {
        A.toast(e.message || 'Something went wrong saving.', 'bad');
      } finally { saving = false; document.querySelectorAll('#savebar .a-btn').forEach((b) => { b.disabled = false; }); }
    }

    if ($('delBtn')) $('delBtn').addEventListener('click', async () => { if (await A.deletePost(post)) { A.dirty = false; A.go('#posts'); } });
    if ($('viewLive') && post) $('viewLive').href = A.viewUrl(post);

    /* ---------- initial content ---------- */
    let working = null;
    try { working = JSON.parse(localStorage.getItem(WORK_KEY)); } catch (e) { /* none */ }
    const fresh = isNew ? null : fromPost(post);
    const newer = working && (isNew || !post.updated_at || new Date(working.at) > new Date(post.updated_at));
    const hasWork = working && (working.title || working.excerpt || working.cover || (working.blocks || []).some((b) => b.text || b.image));
    if (newer && hasWork) {
      apply(working);
      $('restore').classList.remove('hidden');
      $('restoreMsg').textContent = `Restored your unsaved work from ${A.ago(working.at)}.`;
      A.dirty = true;
      $('restoreDiscard').onclick = () => {
        try { localStorage.removeItem(WORK_KEY); } catch (e) { /* ignore */ }
        apply(fresh || { blocks: [{ style: 'paragraph-lg' }] });
        A.dirty = false; $('restore').classList.add('hidden'); refreshBar(); pushPreview();
      };
    } else {
      apply(fresh || { blocks: [{ style: 'paragraph-lg' }] });
    }
    refreshBar();

    return function cleanup() {
      if (touched) persist.flush(); // don't lose the last few keystrokes
      window.removeEventListener('message', onMsg);
      ro.disconnect();
      $('savebar').onclick = null;
    };
  };
})(window);
