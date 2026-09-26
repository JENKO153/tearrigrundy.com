/*
 * Site colours. The owner picks a handful of colours in Admin -> Appearance; everything else
 * (tints, darker shades, glows) is worked out from them here so the site always stays in harmony.
 *
 * Only strict #rrggbb values are accepted, so nothing else can ever be written into the page's styles.
 * On public pages the last saved theme is applied straight away from the browser's cache (this file
 * loads in <head>), so there is no flash of the old colours. The dashboard pages skip that on purpose:
 * the dashboard keeps its own look.
 */
(function (window) {
  const DEFAULTS = {
    pine: '#0e2f30',      // dark surfaces: buttons, footer, ribbon, contact band
    accent: '#c0663f',    // highlights and small details
    link: '#1f6f70',      // links, small labels
    bg: '#fbf8f3',        // page background
    text: '#14292a',      // body text and headings
    menu: '#14292a',      // menu links on the solid bar
    logo: '#0e2f30',      // the site name in the menu bar
    menuHero: '#ffffff',  // menu + site name over a full-screen photo
  };
  const HEX = /^#[0-9a-f]{6}$/i;

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lighten = (h, t) => mix(h, '#ffffff', t);
  const darken = (h, t) => mix(h, '#000000', t);
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // Merge a saved theme over the defaults, dropping anything that isn't a proper colour.
  function normalise(theme) {
    const out = {};
    Object.keys(DEFAULTS).forEach((k) => { out[k] = theme && HEX.test(theme[k] || '') ? theme[k].toLowerCase() : DEFAULTS[k]; });
    return out;
  }

  function variables(theme) {
    const t = normalise(theme);
    return {
      '--pine': t.pine, '--pine-2': lighten(t.pine, 0.1),
      '--terracotta': t.accent, '--terracotta-dark': darken(t.accent, 0.22), '--glow': lighten(t.accent, 0.38),
      '--teal': t.link, '--glacier': lighten(t.link, 0.55),
      '--cream': t.bg, '--sand': darken(t.bg, 0.045), '--sand-dark': darken(t.bg, 0.11),
      '--mist': mix(t.bg, t.link, 0.08), '--blush': mix(t.bg, t.accent, 0.14),
      '--ink': t.text, '--ink-light': mix(t.text, t.bg, 0.35),
      '--menu': t.menu, '--logo': t.logo, '--menu-hero': t.menuHero,
    };
  }

  function apply(theme, target) {
    const el = (target || document.documentElement).style;
    if (!theme || typeof theme !== 'object' || !Object.keys(theme).length) {
      Object.keys(variables(null)).forEach((k) => el.removeProperty(k));   // back to the built-in colours
      return;
    }
    const v = variables(theme);
    Object.keys(v).forEach((k) => el.setProperty(k, v[k]));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', normalise(theme).bg);
  }

  window.TG_THEME = { DEFAULTS, HEX, normalise, variables, apply, contrast, mix, lighten, darken };

  // Public pages: apply the remembered theme immediately (before first paint).
  if (!location.pathname.startsWith('/admin/')) {
    try {
      const cached = JSON.parse(localStorage.getItem('tg_site_content') || 'null');
      if (cached && cached.theme) apply(cached.theme);
    } catch (e) { /* private mode / bad data: use the built-in colours */ }
  }
})(window);
