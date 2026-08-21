/* Sitewide scroll-reveal: fades/slides in any .reveal, .reveal-left,
   .reveal-right, or .reveal-group element as it enters the viewport.
   Pages with dynamically-injected content (post cards, etc.) should call
   ScrollReveal.observe(el) right after rendering that content, since it
   won't exist yet for the initial DOMContentLoaded scan. */
window.ScrollReveal = (function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const observer = prefersReduced ? null : new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  function observe(el) {
    if (!el) return;
    if (prefersReduced) {
      el.classList.add('is-visible');
      return;
    }
    el.classList.remove('is-visible');
    observer.observe(el);
  }

  function scan(root) {
    const scope = root || document;
    scope.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-group').forEach(observe);
  }

  document.addEventListener('DOMContentLoaded', () => scan());

  return { scan, observe };
})();
