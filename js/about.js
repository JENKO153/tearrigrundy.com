/* About page: mobile nav toggle + footer year. */
(function () {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }
  document.getElementById('year').textContent = new Date().getFullYear();
})();
