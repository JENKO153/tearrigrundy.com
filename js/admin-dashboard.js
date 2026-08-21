/* Admin dashboard: guards the page behind a real Supabase session, handles
   publishing new posts (with cover photo upload) and deleting existing ones. */
(function () {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function renderPostsList() {
    const list = document.getElementById('postsList');
    list.innerHTML = '<p style="color:var(--ink-light);">Loading...</p>';

    const posts = await BlogData.getPosts();

    if (posts.length === 0) {
      list.innerHTML = '<p style="color:var(--ink-light);">No posts yet.</p>';
      return;
    }

    list.innerHTML = posts.map((post) => `
      <div class="post-row" data-id="${escapeHtml(post.id)}">
        <div>
          <div class="post-row-title">${escapeHtml(post.title)}</div>
          <div class="post-row-meta">${escapeHtml(post.category)} &middot; ${formatDate(post.date)}</div>
        </div>
        <div class="post-row-actions">
          <a class="icon-btn" href="../post.html?id=${encodeURIComponent(post.id)}" target="_blank" rel="noopener">View</a>
          <button class="icon-btn danger" data-delete="${escapeHtml(post.id)}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        if (confirm('Delete this post? This cannot be undone.')) {
          await BlogData.deletePost(id);
          renderPostsList();
        }
      });
    });
  }

  // ---------- Content block editor ----------
  const contentBlocks = document.getElementById('contentBlocks');
  const BLOCK_STYLES = [
    { value: 'title', label: 'Title (large)' },
    { value: 'subtitle', label: 'Subtitle' },
    { value: 'paragraph-lg', label: 'Paragraph — Large' },
    { value: 'paragraph', label: 'Paragraph — Normal' },
    { value: 'paragraph-sm', label: 'Paragraph — Small' }
  ];

  function createBlockRow(style, text) {
    const row = document.createElement('div');
    row.className = 'content-block-row';

    const options = BLOCK_STYLES.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');
    row.innerHTML = `
      <div class="block-row-top">
        <select class="block-style">${options}</select>
        <div class="block-row-actions">
          <button type="button" class="icon-btn move-up" title="Move up">&uarr;</button>
          <button type="button" class="icon-btn move-down" title="Move down">&darr;</button>
          <button type="button" class="icon-btn danger remove-block" title="Remove block">Remove</button>
        </div>
      </div>
      <textarea class="block-text" placeholder="Write this block's text..."></textarea>
    `;
    row.querySelector('.block-style').value = style || 'paragraph';
    row.querySelector('.block-text').value = text || '';
    return row;
  }

  function addBlock(style, text) {
    contentBlocks.appendChild(createBlockRow(style, text));
  }

  function resetBlocks() {
    contentBlocks.innerHTML = '';
    addBlock('paragraph-lg', '');
  }

  document.getElementById('addBlockBtn').addEventListener('click', () => addBlock('paragraph', ''));

  contentBlocks.addEventListener('click', (e) => {
    const row = e.target.closest('.content-block-row');
    if (!row) return;

    if (e.target.classList.contains('remove-block')) {
      if (contentBlocks.children.length > 1) row.remove();
      return;
    }
    if (e.target.classList.contains('move-up')) {
      const prev = row.previousElementSibling;
      if (prev) contentBlocks.insertBefore(row, prev);
      return;
    }
    if (e.target.classList.contains('move-down')) {
      const next = row.nextElementSibling;
      if (next) contentBlocks.insertBefore(next, row);
    }
  });

  function collectBlocks() {
    return Array.from(contentBlocks.querySelectorAll('.content-block-row'))
      .map((row) => ({
        style: row.querySelector('.block-style').value,
        text: row.querySelector('.block-text').value.trim()
      }))
      .filter((block) => block.text !== '');
  }

  resetBlocks();

  // ---------- Cover image preview ----------
  const imageFileInput = document.getElementById('imageFile');
  const imagePreview = document.getElementById('imagePreview');
  let previewObjectUrl = null;

  imageFileInput.addEventListener('change', () => {
    const file = imageFileInput.files[0];
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);

    if (!file) {
      imagePreview.style.display = 'none';
      return;
    }
    previewObjectUrl = URL.createObjectURL(file);
    imagePreview.src = previewObjectUrl;
    imagePreview.style.display = '';
  });

  // ---------- Publish ----------
  document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = imageFileInput.files[0];
    if (!file) return;

    const content = collectBlocks();
    if (content.length === 0) {
      alert('Add at least one content block with some text before publishing.');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Publishing...';

    try {
      const title = document.getElementById('title').value.trim();
      const category = document.getElementById('category').value;
      const excerpt = document.getElementById('excerpt').value.trim();
      const image = await BlogData.uploadImage(file);

      await BlogData.addPost({ title, category, image, excerpt, content });

      e.target.reset();
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      imagePreview.style.display = 'none';
      resetBlocks();

      const successBox = document.getElementById('formSuccess');
      successBox.classList.add('show');
      setTimeout(() => successBox.classList.remove('show'), 3000);

      renderPostsList();
    } catch (err) {
      alert('Something went wrong publishing this post: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish Post';
    }
  });

  // ---------- Auth guard ----------
  (async function init() {
    const session = await BlogAuth.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await BlogAuth.logout();
      window.location.href = 'login.html';
    });

    renderPostsList();
  })();
})();
