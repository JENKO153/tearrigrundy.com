/* Single post page: reads ?id= from the URL, renders the post and related posts. */
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

  function renderNotFound() {
    document.getElementById('postContainer').innerHTML = `
      <div class="container" style="padding:80px 24px;text-align:center;">
        <h1>Post Not Found</h1>
        <p style="color:var(--ink-light);">This post may have been removed or the link is incorrect.</p>
        <a class="btn" href="/blog/">Back to the Blog</a>
      </div>
    `;
  }

  // Content blocks are objects like { style: 'title'|'subtitle'|'paragraph'|'paragraph-lg'|'paragraph-sm', text }.
  // Older posts stored content as plain strings, so those are treated as normal paragraphs.
  function normalizeBlock(block) {
    if (typeof block === 'string') return { style: 'paragraph', text: block };
    return { style: block.style || 'paragraph', text: block.text || '' };
  }

  function renderBlock(block) {
    const text = escapeHtml(block.text);
    switch (block.style) {
      case 'title':
        return `<h2>${text}</h2>`;
      case 'subtitle':
        return `<h3 class="post-block-subtitle">${text}</h3>`;
      case 'paragraph-lg':
        return `<p class="post-block-lead">${text}</p>`;
      case 'paragraph-sm':
        return `<p class="post-block-sm">${text}</p>`;
      default:
        return `<p>${text}</p>`;
    }
  }

  function estimateReadingMinutes(blocks) {
    const wordCount = blocks.reduce((total, b) => total + b.text.split(/\s+/).filter(Boolean).length, 0);
    return Math.max(1, Math.round(wordCount / 200));
  }

  function renderPost(post) {
    document.getElementById('pageTitle').textContent = `${post.title} | Tearri Grundy`;

    const blocks = (post.content || []).map(normalizeBlock).filter((b) => b.text.trim() !== '');
    const bodyHtml = blocks.map(renderBlock).join('');
    const readingMinutes = estimateReadingMinutes(blocks);

    document.getElementById('postContainer').innerHTML = `
      <div class="post-hero">
        <div class="container">
          <span class="post-category">${escapeHtml(post.category)}</span>
          <h1>${escapeHtml(post.title)}</h1>
          <div class="post-meta">${formatDate(post.date)} &middot; by ${escapeHtml(post.author)} &middot; ${readingMinutes} min read</div>
        </div>
      </div>
      <div class="container">
        <img class="post-hero-img" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">
        <div class="post-body">
          ${bodyHtml}
          <div class="post-body-footer">
            <a class="btn btn-outline" href="/blog/">&larr; Back to All Posts</a>
          </div>
        </div>
      </div>
    `;
  }

  function renderRelated(post, allPosts) {
    const related = allPosts
      .filter((p) => p.id !== post.id && p.category === post.category)
      .slice(0, 3);

    if (related.length === 0) return;

    document.getElementById('relatedSection').style.display = '';
    document.getElementById('relatedPosts').innerHTML = related.map((p) => `
      <article class="post-card">
        <img class="post-card-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}">
        <div class="post-card-body">
          <span class="post-category">${escapeHtml(p.category)}</span>
          <h3><a href="/post/?id=${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a></h3>
          <div class="post-meta">${formatDate(p.date)}</div>
          <p class="post-excerpt">${escapeHtml(p.excerpt)}</p>
          <a class="read-more" href="/post/?id=${encodeURIComponent(p.id)}">Read More &rarr;</a>
        </div>
      </article>
    `).join('');
  }

  (async function init() {
    document.getElementById('postContainer').innerHTML = '<div class="container" style="padding:80px 24px;text-align:center;color:var(--ink-light);">Loading...</div>';

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const post = id ? await BlogData.getPostById(id) : null;

    if (!post) {
      renderNotFound();
      return;
    }

    renderPost(post);
    const allPosts = await BlogData.getPosts();
    renderRelated(post, allPosts);
  })();
})();
