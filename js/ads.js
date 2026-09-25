/*
 * Earnings on the public site: Google AdSense slots, the Travelpayouts script and the
 * affiliate disclosure. Nothing is configured in code any more: everything comes from
 * Admin -> Earnings (saved as settings.money, see site-content.js), so a switched-off or
 * half-filled service renders nothing, takes up no space and loads no third-party script.
 *
 * Ad placements are named "slots": footer-banner (bottom of every page) and in-post
 * (after the first block of a post). A page calls AdSlots.renderSlot(name, element); it is
 * safe to call before the settings have arrived, the slot fills in as soon as they do.
 */
window.AdSlots = (function () {
  const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
  const SLOT_KEY = { 'footer-banner': 'footer', 'in-post': 'inPost', 'blog-listing': 'listing' };
  const CLIENT_RE = /^ca-pub-\d{10,20}$/;
  const SLOT_RE = /^\d{6,20}$/;

  const pending = [];
  let adsenseLoaded = false;
  let travelpayoutsLoaded = false;

  const money = () => (window.SiteContent && window.SiteContent.settings && window.SiteContent.settings.money) || {};
  const httpsUrl = (u) => (/^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : null);

  function loadAdsense(client) {
    if (adsenseLoaded) return;
    adsenseLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    document.head.appendChild(s);
  }

  function draw(name, el) {
    const ad = money().adsense || {};
    const slot = String(ad[SLOT_KEY[name]] || '').trim();
    const on = !PREVIEW && ad.enabled && CLIENT_RE.test(ad.client || '') && SLOT_RE.test(slot);
    if (!on) { el.style.display = 'none'; el.innerHTML = ''; delete el.dataset.adKey; return; }
    const key = `${ad.client}/${slot}`;
    if (el.dataset.adKey === key) return; // already showing this exact ad
    loadAdsense(ad.client);
    el.style.display = '';
    el.dataset.adKey = key;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = ad.client;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    el.innerHTML = '';
    el.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (err) { console.error('AdSense failed for slot ' + name, err); }
  }

  function loadTravelpayouts() {
    const tp = money().travelpayouts || {};
    const src = httpsUrl(tp.script);
    if (PREVIEW || travelpayoutsLoaded || !tp.enabled || !src) return;
    travelpayoutsLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    s.dataset.tearriAffiliate = 'travelpayouts';
    document.head.appendChild(s);
  }

  // Stay22 "Let Me Allez": swaps hotel/booking links for earning ones. The script address is fixed;
  // only the owner's script ID is configurable.
  let stay22Loaded = false;
  function loadStay22() {
    const st = money().stay22 || {};
    if (PREVIEW || stay22Loaded || !st.linkSwap || !/^[A-Za-z0-9_-]{8,64}$/.test(st.lma || '')) return;
    stay22Loaded = true;
    window.Stay22 = window.Stay22 || {};
    window.Stay22.params = { lmaID: st.lma };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://scripts.stay22.com/letmeallez.js';
    document.head.appendChild(s);
  }

  function refresh() {
    pending.forEach((p) => { if (p.el.isConnected) draw(p.name, p.el); });
    loadTravelpayouts();
    loadStay22();
  }

  function renderSlot(name, el) {
    if (!el) return;
    if (!pending.some((p) => p.el === el)) pending.push({ name, el });
    draw(name, el);
  }

  document.addEventListener('tg:content', refresh);
  document.addEventListener('DOMContentLoaded', () => { loadTravelpayouts(); loadStay22(); });

  return { renderSlot, money, refresh };
})();
