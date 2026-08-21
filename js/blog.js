/* Blog listing page: category filter buttons + live search over all posts. */
(function () {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('active');
    });
  }
  document.getElementById('year').textContent = new Date().getFullYear();

  const grid = document.getElementById('postsGrid');
  const filterTagsContainer = document.getElementById('filterTags');
  const searchInput = document.getElementById('searchInput');

  let activeCategory = 'all';
  let searchTerm = '';
  let allPosts = [];

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function buildFilterTags() {
    const categories = Array.from(new Set(allPosts.map((p) => p.category))).sort();
    const extraButtons = categories.map((cat) => `
      <button class="filter-tag" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
    `).join('');
    filterTagsContainer.insertAdjacentHTML('beforeend', extraButtons);

    filterTagsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-tag');
      if (!btn) return;
      activeCategory = btn.dataset.category;
      filterTagsContainer.querySelectorAll('.filter-tag').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPosts();
    });
  }

  function renderPosts() {
    let posts = allPosts;

    if (activeCategory !== 'all') {
      posts = posts.filter((p) => p.category === activeCategory);
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.trim().toLowerCase();
      posts = posts.filter((p) =>
        p.title.toLowerCase().includes(term) ||
        p.excerpt.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    }

    if (posts.length === 0) {
      grid.innerHTML = '<div class="empty-state">No posts match that search. Try a different keyword or category.</div>';
      return;
    }

    grid.innerHTML = posts.map((post) => `
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

    grid.classList.add('reveal-group');
    window.ScrollReveal.observe(grid);
  }

  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderPosts();
  });

  (async function init() {
    grid.innerHTML = '<div class="empty-state">Loading posts...</div>';
    allPosts = await BlogData.getPosts();
    buildFilterTags();
    renderPosts();
  })();
})();
