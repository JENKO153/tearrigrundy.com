/*
 * Admin data + auth layer (used only by the admin pages).
 *
 * Two backends with the same interface:
 *   - Supabase (config.js has real keys): the real thing. The admin session lives in
 *     sessionStorage, so closing the browser signs her out.
 *   - Demo (placeholder keys): everything lives in this browser's localStorage so the
 *     dashboard can be tried out before / without touching the live site.
 *
 * The admin degrades gracefully if the newer database pieces (supabase/01-dashboard.sql,
 * 02-security.sql) have not been run yet: drafts are then kept in this browser only, and the
 * password check is done by the app rather than the database. CMS.caps says what is available.
 *
 * Post shape used everywhere in the admin:
 *   { id, slug, title, category, excerpt, image, date (ISO), status: 'draft'|'published',
 *     content: [{style, text, image}], author, updated_at }
 */
(function (window) {
  const cfg = window.TG_CONFIG;
  const configured = !String(cfg.supabaseUrl).startsWith('YOUR_') && !String(cfg.supabaseKey).startsWith('YOUR_');

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'post';
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const newSlug = (title) => `${slugify(title)}-${Date.now().toString(36)}`;

  // Post state as the visitor would see it.
  const postState = (p) => (p.status === 'draft' ? 'draft' : (new Date(p.date) > new Date() ? 'scheduled' : 'live'));

  /* ---------- photos: resize, re-encode as WebP (this also strips EXIF/GPS) ---------- */
  const isHeic = (f) => /^image\/hei[cf]$/.test(f.type) || (!f.type && /\.hei[cf]$/i.test(f.name || ''));
  const imageOk = (f) => /^image\/(jpeg|png|webp|avif|gif)$/.test(f.type) || isHeic(f);
  async function processImage(file, maxSize = 1800, quality = 0.84) {
    if (!imageOk(file)) throw new Error('Photos must be JPG, PNG, WebP or iPhone HEIC files.');
    if (file.size > 25 * 1024 * 1024) throw new Error('That photo is over 25MB.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch (e) {
      throw new Error(isHeic(file)
        ? `${file.name}: this browser can't open iPhone HEIC photos. Use Safari, or set the iPhone camera to "Most Compatible".`
        : `${file.name} couldn't be opened. Try saving it again as a JPG.`);
    }
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
    if (!blob) throw new Error('Could not process that photo.');
    return blob;
  }
  const blobToDataUrl = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

  // Reads that stall: ask again after 1.5s and 4s, take whichever answers first. Reads only.
  function hedged(run, waves = [1500, 4000]) {
    return new Promise((resolve, reject) => {
      let settled = false, running = 0, failures = 0;
      const attempt = () => {
        running++;
        run().then(
          (v) => { if (!settled) { settled = true; resolve(v); } },
          (e) => { if (++failures >= running && !settled) { settled = true; reject(e); } });
      };
      attempt();
      waves.forEach((ms) => setTimeout(() => { if (!settled) attempt(); }, ms));
    });
  }

  const caps = { drafts: true, confirmRpc: true, audit: true, mfa: true };

  /* Drafts kept in this browser when the database can't hold them yet. */
  const localDrafts = {
    key: 'tg_local_drafts',
    all() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch (e) { return []; } },
    save(list) { try { localStorage.setItem(this.key, JSON.stringify(list)); } catch (e) { throw new Error('This browser is out of space for drafts. Publish or delete something first.'); } },
    put(p) {
      const list = this.all();
      const i = list.findIndex((x) => x.id === p.id);
      i === -1 ? list.unshift(p) : (list[i] = p);
      this.save(list);
    },
    remove(id) { this.save(this.all().filter((x) => x.id !== id)); },
  };

  /* =====================================================================
     Supabase backend
     ===================================================================== */
  function supabaseBackend() {
    let client;
    const admin = () => client ||= window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const throwaway = () => window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const missingFn = (e) => e && (e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message || ''));
    const missingCol = (e) => e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message || ''));
    const missingTable = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''));

    const fail = (error, fallback) => {
      if (!error) return;
      console.error(error);
      const denied = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '');
      throw new Error(denied ? 'Not allowed. Confirm your password and try again.' : fallback || error.message);
    };
    // Row-level security refuses an update/delete by changing 0 rows rather than erroring.
    const changed = (data, error, fallback) => {
      fail(error, fallback);
      if (!data || !data.length) throw new Error('Not saved: the database refused the change. Confirm your password and try again.');
    };

    const toPost = (r) => ({
      id: r.id, slug: r.slug, title: r.title, category: r.category, excerpt: r.excerpt,
      image: r.image_url || '', date: r.published_at, status: r.status === 'draft' ? 'draft' : 'published',
      content: r.content || [], author: r.author || 'Tearri', updated_at: r.updated_at || r.created_at,
    });

    const bucketPath = (url) => {
      const marker = '/storage/v1/object/public/post-images/';
      const i = String(url).indexOf(marker);
      return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
    };

    // Confirm fallback (database function not installed yet): re-check the password with a
    // throwaway client so the real session (and its MFA level) is left untouched.
    const LOCK_KEY = 'tg_confirm_fails';
    async function fallbackConfirm(password) {
      let fails = [];
      try { fails = (JSON.parse(sessionStorage.getItem(LOCK_KEY)) || []).filter((t) => t > Date.now() - 15 * 60e3); } catch (e) { /* none */ }
      if (fails.length >= 5) return { ok: false, reason: 'locked' };
      const { data: { session } } = await admin().auth.getSession();
      if (!session) return { ok: false, reason: 'not_admin' };
      const probe = throwaway();
      const { error } = await probe.auth.signInWithPassword({ email: session.user.email, password });
      if (error) {
        fails.push(Date.now());
        try { sessionStorage.setItem(LOCK_KEY, JSON.stringify(fails)); } catch (e) { /* ignore */ }
        return { ok: false, reason: 'incorrect', remaining: 5 - fails.length };
      }
      probe.auth.signOut({ scope: 'local' });
      return { ok: true };
    }

    let draftProbe;
    const probeDrafts = () => draftProbe ||= (async () => {
      const { error } = await admin().from('posts').select('status').limit(1);
      caps.drafts = !missingCol(error);
      return caps.drafts;
    })();

    return {
      mode: 'supabase',

      /* ---- auth ---- */
      async login(email, password, captchaToken) {
        const { error } = await admin().auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
        if (error) throw new Error(/captcha/i.test(error.message) ? 'Bot check failed. Reload the page and try again.' : 'Incorrect email or password.');
        return this.nextStep();
      },
      // Works out what is still needed after a password: nothing, a code, or authenticator set-up.
      async nextStep() {
        const sb = admin();
        const { data: st, error } = await sb.rpc('admin_status');
        if (error && missingFn(error)) {
          // Security SQL not installed yet: any signed-in user of this project is the owner.
          caps.mfa = false;
          const { data: { session } } = await sb.auth.getSession();
          return session ? { status: 'ok' } : { status: 'not_admin' };
        }
        if (error || !st || !st.is_admin) { await sb.auth.signOut({ scope: 'local' }); return { status: 'not_admin' }; }
        const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal.currentLevel === 'aal2') return { status: 'ok' };
        if (aal.nextLevel === 'aal2') return { status: 'mfa_verify' };
        return { status: st.require_mfa ? 'mfa_enroll' : 'ok' };
      },
      async verifyMfa(code) {
        const sb = admin();
        const { data } = await sb.auth.mfa.listFactors();
        const factor = data && data.totp && data.totp[0];
        if (!factor) throw new Error('No authenticator is set up on this account.');
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) throw new Error("That code didn't work. Check the time on your phone and try again.");
      },
      async startMfaEnroll() {
        const sb = admin();
        const { data: list } = await sb.auth.mfa.listFactors();
        for (const f of ((list && list.all) || []).filter((x) => x.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Tearri admin ${new Date().toISOString().slice(0, 10)}` });
        if (error) throw new Error(error.message);
        return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
      },
      async finishMfaEnroll(factorId, code) {
        const { error } = await admin().auth.mfa.challengeAndVerify({ factorId, code });
        if (error) throw new Error("That code didn't work. Try the newest code in your app.");
      },
      async getAdmin() {
        const sb = admin();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return null;
        const step = await this.nextStep();
        if (step.status !== 'ok') return { needs: step.status };
        const { data: factors } = await sb.auth.mfa.listFactors();
        return { email: session.user.email, mfa: !!(factors && factors.totp && factors.totp.length) };
      },
      logout: (everywhere = false) => admin().auth.signOut({ scope: everywhere ? 'global' : 'local' }),
      async changePassword(current, next) {
        const res = await this.confirm(current);
        if (!res.ok) throw new Error('Your current password is not right.');
        const { error } = await admin().auth.updateUser({ password: next });
        if (error) throw new Error(error.message);
      },

      /* ---- password-confirmed writes ---- */
      async confirm(password) {
        const { data, error } = await admin().rpc('confirm_password', { password });
        if (!error) { caps.confirmRpc = true; return data; }
        if (!missingFn(error)) throw new Error('Could not check your password. Try again.');
        caps.confirmRpc = false;
        return fallbackConfirm(password);
      },
      async endWrite() { if (caps.confirmRpc) await admin().rpc('end_write_grant'); },

      /* ---- posts ---- */
      async listPosts() {
        await probeDrafts();
        const { data, error } = await hedged(() => admin().from('posts').select('*').order('published_at', { ascending: false }).then((r) => r));
        fail(error, 'Could not load your posts.');
        const list = data.map(toPost);
        return caps.drafts ? list : list.concat(localDrafts.all());
      },
      async savePost(p) {
        await probeDrafts();
        const isLocal = !p.id || String(p.id).startsWith('local-');
        if (p.status === 'draft' && !caps.drafts) {
          if (!isLocal) throw new Error('Un-publishing needs the dashboard database update (supabase/01-dashboard.sql).');
          const draft = { ...clone(p), id: p.id || `local-${Date.now().toString(36)}`, updated_at: new Date().toISOString(), date: p.date || new Date().toISOString() };
          localDrafts.put(draft);
          return draft;
        }
        const row = {
          title: p.title, category: p.category, excerpt: p.excerpt, image_url: p.image || '',
          content: p.content, author: p.author || 'Tearri', published_at: p.date || new Date().toISOString(),
        };
        if (caps.drafts) row.status = p.status === 'draft' ? 'draft' : 'published';
        if (isLocal) {
          const { data, error } = await admin().from('posts').insert({ ...row, slug: p.slug || newSlug(p.title) }).select().single();
          fail(error, 'Could not save this post.');
          if (p.id) localDrafts.remove(p.id);
          return toPost(data);
        }
        const { data, error } = await admin().from('posts').update(row).eq('id', p.id).select();
        changed(data, error, 'Could not save this post.');
        return toPost(data[0]);
      },
      async deletePost(p) {
        if (String(p.id).startsWith('local-')) { localDrafts.remove(p.id); return; }
        const { data, error } = await admin().from('posts').delete().eq('id', p.id).select('id');
        changed(data, error);
        const paths = [p.image, ...(p.content || []).map((b) => b.image)].map((u) => u && bucketPath(u)).filter(Boolean);
        if (paths.length) admin().storage.from('post-images').remove(paths).catch(() => {});
      },

      async renameCategory(from, to) {
        const { data, error } = await admin().from('posts').update({ category: to }).eq('category', from).select('id');
        fail(error, 'Could not rename that category.');
        if (data && data.length === 0 && !localDrafts.all().some((p) => p.category === from)) throw new Error('Not saved: the database refused the change. Confirm your password and try again.');
        localDrafts.save(localDrafts.all().map((p) => (p.category === from ? { ...p, category: to } : p)));
      },

      /* ---- photos ---- */
      prepareImage: (file) => processImage(file),
      async uploadImage(file, folder = 'posts', prepared) {
        const blob = await (prepared || processImage(file));
        const path = `${folder}/${crypto.randomUUID()}.webp`;
        const { error } = await admin().storage.from('post-images').upload(path, blob, { contentType: 'image/webp', upsert: false });
        fail(error, 'Photo upload failed.');
        return admin().storage.from('post-images').getPublicUrl(path).data.publicUrl;
      },

      /* ---- homepage / about wording ---- */
      async loadSettings() {
        const { data, error } = await hedged(() => admin().from('site_settings').select('data').eq('id', 1).maybeSingle().then((r) => r));
        if (error && missingTable(error)) return { data: {}, available: false };
        fail(error, 'Could not load the page content.');
        return { data: (data && data.data) || {}, available: true };
      },
      async saveSettings(value) {
        const { data, error } = await admin().from('site_settings').upsert({ id: 1, data: value }).select('id');
        changed(data, error, 'Could not save the page content.');
      },

      /* ---- earnings (live feeds come from the `earnings` Edge Function; manual figures from a private table) ---- */
      async loadEarnings(months = 6) {
        const out = { live: null, liveError: null, manual: [], manualAvailable: true };
        const m = await admin().from('earnings_manual').select('*').order('month', { ascending: false });
        if (m.error) out.manualAvailable = false; else out.manual = m.data;
        const currencies = [...new Set(out.manual.map((r) => r.currency).filter((c) => c && c !== 'AUD'))];
        try {
          const { data, error } = await admin().functions.invoke('earnings', { body: { months, currencies } });
          if (error) {
            let status = 0, message = '';
            try { status = error.context.status; message = (await error.context.json()).error || ''; } catch (e) { /* keep defaults */ }
            out.liveError = { status, message: message || error.message };
          } else out.live = data;
        } catch (e) { out.liveError = { status: 0, message: e.message }; }
        return out;
      },
      async saveManualEarning(row) {
        const { data, error } = await admin().from('earnings_manual').upsert(row).select('month');
        changed(data, error, 'Could not save that figure.');
      },
      async deleteManualEarning(month, platform) {
        const { data, error } = await admin().from('earnings_manual').delete().eq('month', month).eq('platform', platform).select('month');
        changed(data, error);
      },

      /* ---- activity ---- */
      async auditLog() {
        const { data, error } = await admin().from('audit_log').select('*').order('at', { ascending: false }).limit(100);
        if (error) { caps.audit = false; return null; }
        return data;
      },
      async serverStatus() {
        await probeDrafts();
        const { data, error } = await admin().rpc('admin_status');
        const settings = await admin().from('site_settings').select('id').limit(1);
        return {
          drafts: caps.drafts,
          security: !missingFn(error),
          require_mfa: data && data.require_mfa,
          settings: !missingTable(settings.error),
        };
      },
      caps,
    };
  }

  /* =====================================================================
     Demo backend: browser-only
     ===================================================================== */
  function demoBackend() {
    const DEMO = { email: 'tearri@demo.test', password: 'butterfly-demo' };
    const KEY = 'tg_demo_';
    const read = (k, fb) => { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : clone(fb); } catch (e) { return clone(fb); } };
    const write = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { throw new Error('Browser storage is full. Use smaller photos in demo mode.'); } };
    const session = {
      get: () => { try { return JSON.parse(sessionStorage.getItem(KEY + 'session')); } catch (e) { return null; } },
      set: (v) => sessionStorage.setItem(KEY + 'session', JSON.stringify(v)),
      clear: () => sessionStorage.removeItem(KEY + 'session'),
    };
    let writeUntil = 0;
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    const seed = () => [
      { id: 'd1', slug: 'two-days-in-kyoto-demo', title: 'Two Days in Kyoto', category: 'Destinations', excerpt: 'Temples at sunrise, a very good bowl of ramen and one wrong train.', image: '/images/blog-banner.jpg', date: ago(72), status: 'published', author: 'Tearri', updated_at: ago(72),
        content: [{ style: 'paragraph-lg', text: 'Kyoto was on the list for years, and it did not disappoint.' }, { style: 'title', text: 'Start early' }, { style: 'paragraph', text: 'The temples are quiet before 8am and the light is unreal.' }, { style: 'bullets', text: 'Fushimi Inari at sunrise\nNishiki Market for lunch\nGion at dusk' }] },
      { id: 'd2', slug: 'lisbon-food-demo', title: 'What to Eat in Lisbon', category: 'Food & Drink', excerpt: 'Custard tarts, sardines and the tiny bar worth queueing for.', image: '/images/banner-hero.jpg', date: ago(240), status: 'published', author: 'Tearri', updated_at: ago(240),
        content: [{ style: 'paragraph-lg', text: 'Lisbon is a city best explored one snack at a time.' }] },
      { id: 'd3', slug: 'packing-tips-demo', title: 'Carry-On Only: My Packing List', category: 'Travel Tips', excerpt: 'Everything I actually use across two weeks.', image: '', date: ago(2), status: 'draft', author: 'Tearri', updated_at: ago(2),
        content: [{ style: 'paragraph-lg', text: 'Still working on this one…' }] },
      { id: 'd4', slug: 'bali-scheduled-demo', title: 'Slow Mornings in Ubud', category: 'Culture', excerpt: 'Rice terraces, warung breakfasts and a very patient scooter.', image: '/images/banner-hero.jpg', date: new Date(Date.now() + 3 * 86400e3).toISOString(), status: 'published', author: 'Tearri', updated_at: ago(1),
        content: [{ style: 'paragraph-lg', text: 'Going live soon.' }] },
    ];
    const posts = () => read('posts', seed());
    const log = (action, entity, summary) => {
      const list = read('audit', []);
      list.unshift({ id: Date.now(), at: new Date().toISOString(), email: DEMO.email, action, entity, summary });
      write('audit', list.slice(0, 100));
    };
    const guard = () => { if (Date.now() > writeUntil) throw new Error('Not allowed. Confirm your password and try again.'); };

    return {
      mode: 'demo',
      demoCredentials: DEMO,
      async login(email, password) {
        await new Promise((r) => setTimeout(r, 350));
        if (email.trim().toLowerCase() !== DEMO.email || password !== DEMO.password) throw new Error('Incorrect email or password.');
        session.set({ email: DEMO.email, at: Date.now() });
        return { status: 'ok' };
      },
      nextStep: async () => ({ status: session.get() ? 'ok' : 'not_admin' }),
      verifyMfa: async () => {}, startMfaEnroll: async () => ({}), finishMfaEnroll: async () => {},
      getAdmin: async () => (session.get() ? { email: DEMO.email, mfa: false, demo: true } : null),
      logout: async () => session.clear(),
      async changePassword() { throw new Error('Passwords cannot be changed in demo mode.'); },
      async confirm(password) {
        await new Promise((r) => setTimeout(r, 250));
        const fails = read('fails', []).filter((t) => t > Date.now() - 15 * 60e3);
        if (fails.length >= 5) return { ok: false, reason: 'locked' };
        if (password !== DEMO.password) { fails.push(Date.now()); write('fails', fails); return { ok: false, reason: 'incorrect', remaining: 5 - fails.length }; }
        writeUntil = Date.now() + 5 * 60e3;
        return { ok: true };
      },
      endWrite: async () => { writeUntil = 0; },

      listPosts: async () => posts().sort((a, b) => new Date(b.date) - new Date(a.date)),
      async savePost(p) {
        if (p.status !== 'draft') guard();
        const list = posts();
        const item = { ...clone(p), updated_at: new Date().toISOString() };
        if (!item.id) { item.id = 'd' + Date.now().toString(36); item.slug = newSlug(item.title); }
        if (!item.date) item.date = new Date().toISOString();
        const i = list.findIndex((x) => x.id === item.id);
        if (i !== -1 && list[i].status !== 'draft') guard();
        i === -1 ? list.push(item) : (list[i] = item);
        write('posts', list);
        log(i === -1 ? 'insert' : 'update', 'posts', item.title);
        return item;
      },
      async deletePost(p) {
        guard();
        write('posts', posts().filter((x) => x.id !== p.id));
        log('delete', 'posts', p.title);
      },
      async renameCategory(from, to) {
        guard();
        write('posts', posts().map((p) => (p.category === from ? { ...p, category: to } : p)));
        log('update', 'posts', `Category “${from}” → “${to}”`);
      },
      prepareImage: (file) => processImage(file, 1400, 0.78),
      async uploadImage(file, folder, prepared) {
        const blob = await (prepared || processImage(file, 1400, 0.78));
        return blobToDataUrl(blob);
      },
      loadSettings: async () => ({ data: read('settings', {}), available: true }),
      async saveSettings(value) { guard(); write('settings', value); log('update', 'site_settings', 'Homepage & About content'); },
      async loadEarnings(months = 6) {
        const now = new Date(), live = { travelpayouts: { configured: true, ok: true, currency: 'USD', months: {} }, stay22: { configured: true, ok: true, currency: 'USD', months: {} } };
        for (let i = 0; i < months; i++) {
          const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)), k = d.toISOString().slice(0, 7);
          const f = (n) => Math.round(n * 100) / 100;
          live.travelpayouts.months[k] = { confirmed: f(38 + i * 11.3), pending: i === 0 ? 24.5 : 0, count: 4 + i };
          live.stay22.months[k] = { confirmed: f(52 + i * 7.9), pending: i < 2 ? 31.2 : 0, count: 6 + i, statuses: { confirmed: 5, cancelled: 1 } };
        }
        const fx = { USD: { latest: 1.52 } };
        for (let i = 0; i < months; i++) fx.USD[new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7)] = 1.5 + i * 0.01;
        return { live: { updated: now.toISOString(), platforms: live, fx, fxSource: 'demo rates' }, liveError: null, manual: read('manual_earnings', []), manualAvailable: true };
      },
      async saveManualEarning(row) {
        guard();
        const list = read('manual_earnings', []).filter((r) => !(r.month === row.month && r.platform === row.platform));
        list.push(row); write('manual_earnings', list); log('update', 'earnings', `${row.platform} ${row.month}`);
      },
      async deleteManualEarning(month, platform) {
        guard();
        write('manual_earnings', read('manual_earnings', []).filter((r) => !(r.month === month && r.platform === platform)));
      },
      auditLog: async () => read('audit', []),
      serverStatus: async () => ({ drafts: true, security: true, settings: true, demo: true }),
      caps: { drafts: true, confirmRpc: true, audit: true, mfa: false },
      resetDemo() { ['posts', 'settings', 'audit', 'fails'].forEach((k) => localStorage.removeItem(KEY + k)); },
    };
  }

  const backend = configured && window.supabase ? supabaseBackend() : demoBackend();
  backend.captchaEnabled = configured && !!(cfg.captcha && cfg.captcha.siteKey);
  window.CMS = Object.assign(backend, { configured, esc, slugify, postState, processImage, blobToDataUrl, imageOk });
  window.esc = esc;
})(window);
