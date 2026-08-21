/* Home page: mobile nav toggle + renders the latest posts grid. */
(function () {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }

  document.getElementById('year').textContent = new Date().getFullYear();

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function renderLatestPosts() {
    const container = document.getElementById('latestPosts');
    container.innerHTML = '<div class="empty-state">Loading posts...</div>';

    const allPosts = await BlogData.getPosts();
    const posts = allPosts.slice(0, 3);

    if (posts.length === 0) {
      container.innerHTML = '<div class="empty-state">No posts yet — check back soon.</div>';
      return;
    }

    container.innerHTML = posts.map((post) => `
      <article class="post-card">
        <img class="post-card-img" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">
        <div class="post-card-body">
          <span class="post-category">${escapeHtml(post.category)}</span>
          <h3><a href="/post/?id=${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></h3>
          <div class="post-meta">${formatDate(post.date)} &middot; by ${escapeHtml(post.author)}</div>
          <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
          <a class="read-more" href="/post/?id=${encodeURIComponent(post.id)}">Read More &rarr;</a>
        </div>
      </article>
    `).join('');
  }

  renderLatestPosts();
})();
