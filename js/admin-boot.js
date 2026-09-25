/* Starts the dashboard: checks she is signed in, wires sign-out and the idle timer, then routes. */
(function (window) {
  const A = window.Admin, $ = A.$;
  const IDLE_MS = (window.TG_CONFIG.adminIdleMinutes || 5) * 60 * 1000;
  let idleTimer, warnTimer;

  async function signOut(reason) {
    try { await CMS.logout(); } catch (e) { /* ignore */ }
    window.location.replace(`/admin/login/${reason ? `?${reason}=1` : ''}`);
  }

  function resetIdle() {
    clearTimeout(idleTimer); clearTimeout(warnTimer);
    warnTimer = setTimeout(() => A.toast('Still there? You\'ll be signed out in 1 minute — move the mouse to stay.'), IDLE_MS - 60000);
    idleTimer = setTimeout(() => signOut('idle'), IDLE_MS);
  }

  (async function boot() {
    let me = null;
    try { me = await CMS.getAdmin(); } catch (e) { /* fall through */ }
    if (!me || me.needs) { window.location.replace('/admin/login/'); return; }
    A.me = me;
    $('who').textContent = me.email + (me.demo ? ' (demo)' : '');
    $('idleMins').textContent = IDLE_MS / 60000;
    $('shell').classList.remove('hidden');
    $('logoutBtn').addEventListener('click', () => signOut());
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));
    resetIdle();
    A.initMenu();
    A.route();
  })();
})(window);
