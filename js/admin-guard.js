/* Loaded first on every admin page: refuse to be shown inside someone else's frame
   (clickjacking). The dashboard's own live preview frames the public site, never the reverse. */
(function () {
  if (window.top !== window.self) {
    try { window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = 'none'; }
  }
})();
