/* About page: mobile nav toggle + footer year. */
(function () {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }
  document.getElementById('year').textContent = new Date().getFullYear();

  // Live day counter: counts up from the day the blog launched, and keeps
  // itself correct if the page is left open past midnight.
  const LAUNCH_DATE = new Date('2026-08-21T00:00:00');

  function updateDayCount() {
    const msPerDay = 24 * 60 * 60 * 1000;
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysSinceLaunch = Math.round((todayMidnight - LAUNCH_DATE) / msPerDay) + 1;
    document.getElementById('dayCount').textContent = `Day ${Math.max(1, daysSinceLaunch)}`;
  }

  updateDayCount();
  setInterval(updateDayCount, 60 * 1000);
})();
