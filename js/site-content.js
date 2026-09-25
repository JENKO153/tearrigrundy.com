/*
 * Applies the owner's saved wording and photos to the page. The HTML already holds
 * the default content, so this only ever replaces things (an empty or missing value
 * leaves the default alone) and the site is never blank if the database is slow.
 *
 * Attributes it understands:
 *   data-cms="home.title"          replaces the element's text
 *   data-cms-src="about.photo"     sets an <img> src
 *   data-cms-bg="home.heroImage"   sets a CSS background-image
 *   data-cms-href="contact.instagram"   sets a link (https only)
 *   data-cms-mailto="contact.email"     sets a mailto: link
 *
 * The last saved content is remembered in this browser so repeat visits show it
 * instantly, then it's confirmed against the database. Inside the admin's live
 * preview (?preview=1) it instead listens for unsaved changes from the editor.
 */
(function () {
  const CACHE_KEY = 'tg_site_content';
  const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';

  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const text = (v) => (typeof v === 'string' && v.trim() ? v : null);
  const safeImage = (u) => (/^(https:\/\/|\/images\/|data:image\/(webp|jpeg|png|avif);base64,|blob:)/.test(u || '') ? u : null);
  const safeLink = (u) => (/^https:\/\//.test(u || '') ? u : null);
  const safeEmail = (e) => (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e || '') ? e : null);
  const cssUrl = (u) => `url("${u.replace(/["\\\n]/g, '')}")`;

  function apply(settings) {
    if (!settings || typeof settings !== 'object') return;

    document.querySelectorAll('[data-cms]').forEach((el) => {
      const v = text(get(settings, el.dataset.cms));
      if (v !== null) el.textContent = v;
    });
    document.querySelectorAll('[data-cms-src]').forEach((el) => {
      const v = safeImage(get(settings, el.dataset.cmsSrc));
      if (v) el.src = v;
    });
    document.querySelectorAll('[data-cms-bg]').forEach((el) => {
      const v = safeImage(get(settings, el.dataset.cmsBg));
      if (v) el.style.backgroundImage = cssUrl(v);
    });
    document.querySelectorAll('[data-cms-href]').forEach((el) => {
      const v = safeLink(get(settings, el.dataset.cmsHref));
      if (v) el.href = v;
    });
    document.querySelectorAll('[data-cms-mailto]').forEach((el) => {
      const v = safeEmail(get(settings, el.dataset.cmsMailto));
      if (v) el.href = 'mailto:' + v;
    });
    window.SiteContent.settings = settings;
    document.dispatchEvent(new CustomEvent('tg:content', { detail: settings }));
  }

  window.SiteContent = { apply, settings: {} };

  if (PREVIEW) {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      if (e.data && e.data.type === 'tg:preview-settings') apply(e.data.settings);
    });
    window.addEventListener('load', () => {
      if (window.parent !== window) window.parent.postMessage({ type: 'tg:preview-ready' }, location.origin);
    });
    return;
  }

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) apply(cached);
  } catch (e) { /* private mode or bad data: just use the defaults */ }

  if (window.BlogData && window.BlogData.getSettings) {
    window.BlogData.getSettings().then((s) => {
      if (!s || !Object.keys(s).length) return;
      apply(s);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    });
  }
})();
