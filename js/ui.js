/*
 * Site-wide polish: header that turns frosted on scroll, reading-progress bar on posts,
 * gentle parallax on portrait photos and soft fade between pages.
 * Everything here is decoration: the site works without it, and it does nothing when the
 * visitor has asked their device for reduced motion.
 */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');
  const progress = document.getElementById('readProgress');
  const photos = [...document.querySelectorAll('.about-teaser img')];

  let ticking = false;
  function frame() {
    ticking = false;
    const y = window.scrollY;
    if (header) header.classList.toggle('scrolled', y > 24);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    }
    if (!reduce) {
      photos.forEach((img) => {
        const r = img.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const centre = r.top + r.height / 2 - window.innerHeight / 2;
        img.style.setProperty('--py', `${(-centre * 0.06).toFixed(1)}px`);
      });
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();

  // Fade out before moving to another page on this site (not for new tabs, downloads or #anchors).
  if (!reduce) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(() => { location.href = url.href; }, 240);
    });
    // coming back with the browser's back button shows the page again
    window.addEventListener('pageshow', () => document.body.classList.remove('is-leaving'));
  }
})();
