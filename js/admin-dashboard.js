/* Admin dashboard: guards the page behind a real Supabase session, auto-logs
   out after 5 minutes idle, auto-saves an in-progress post as a draft so an
   idle logout never loses her work, requires a password re-check before any
   post is published, deleted, or edited, and supports scheduling a post for
   a future date/time. */
(function () {
  const DRAFT_KEY = 'wanderer_post_draft';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date} at ${time}`;
  }

  // datetime-local inputs want "YYYY-MM-DDTHH:mm" in local wall-clock time.
  function nowForInput() {
    const d = new Date();
    d.setSeconds(0, 0);
    const tzOffsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
  }

  function estimateReadingMinutes(blocks) {
    const wordCount = blocks.reduce((total, b) => total + b.text.split(/\s+/).filter(Boolean).length, 0);
    return Math.max(1, Math.round(wordCount / 200));
  }

  function renderPreviewBlock(block) {
    const text = escapeHtml(block.text);
    switch (block.style) {
      case 'title': return `<h2>${text}</h2>`;
      case 'subtitle': return `<h3 class="post-block-subtitle">${text}</h3>`;
      case 'paragraph-lg': return `<p class="post-block-lead">${text}</p>`;
      case 'paragraph-sm': return `<p class="post-block-sm">${text}</p>`;
      default: return `<p>${text}</p>`;
    }
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // ---------- Password re-confirmation modal ----------
  // Used before any write action (publish, delete, edit) so a session left
  // open on a device still can't change the blog without her password.
  const confirmModal = document.getElementById('confirmModal');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmPassword = document.getElementById('confirmPassword');
  const confirmError = document.getElementById('confirmError');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');

  function confirmWithPassword(actionLabel) {
    confirmMessage.textContent = `Enter your password to ${actionLabel}.`;
    confirmPassword.value = '';
    confirmError.classList.remove('show');
    confirmModal.style.display = 'flex';
    confirmPassword.focus();

    return new Promise((resolve) => {
      function cleanup(result) {
        confirmModal.style.display = 'none';
        confirmSubmitBtn.removeEventListener('click', onSubmit);
        confirmCancelBtn.removeEventListener('click', onCancel);
        confirmPassword.removeEventListener('keydown', onKeydown);
        resolve(result);
      }

      async function onSubmit() {
        const password = confirmPassword.value;
        if (!password) return;

        confirmSubmitBtn.disabled = true;
        confirmSubmitBtn.textContent = 'Checking...';
        try {
          const session = await BlogAuth.getSession();
          await BlogAuth.login(session.user.email, password);
          cleanup(true);
        } catch (err) {
          confirmError.classList.add('show');
          confirmPassword.value = '';
          confirmPassword.focus();
        } finally {
          confirmSubmitBtn.disabled = false;
          confirmSubmitBtn.textContent = 'Confirm';
        }
      }

      function onCancel() {
        cleanup(false);
      }

      function onKeydown(e) {
        if (e.key === 'Enter') onSubmit();
      }

      confirmSubmitBtn.addEventListener('click', onSubmit);
      confirmCancelBtn.addEventListener('click', onCancel);
      confirmPassword.addEventListener('keydown', onKeydown);
    });
  }

  // ---------- Published posts list ----------
  async function renderPostsList() {
    const list = document.getElementById('postsList');
    list.innerHTML = '<p style="color:var(--ink-light);">Loading...</p>';

    const posts = await BlogData.getPosts();

    if (posts.length === 0) {
      list.innerHTML = '<p style="color:var(--ink-light);">No posts yet.</p>';
      return;
    }

    list.innerHTML = posts.map((post) => {
      const scheduled = new Date(post.date) > new Date();
      const meta = scheduled ? `Scheduled for ${formatDateTime(post.date)}` : formatDate(post.date);
      return `
      <div class="post-row" data-id="${escapeHtml(post.id)}">
        <div>
          <div class="post-row-title">${escapeHtml(post.title)}</div>
          <div class="post-row-meta">${escapeHtml(post.category)} &middot; ${meta}</div>
        </div>
        <div class="post-row-actions">
          <a class="icon-btn" href="/post/?id=${encodeURIComponent(post.id)}">View</a>
          <button class="icon-btn danger" data-delete="${escapeHtml(post.id)}">Delete</button>
        </div>
      </div>
    `;
    }).join('');

    list.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        const ok = await confirmWithPassword('delete this post');
        if (!ok) return;
        await BlogData.deletePost(id);
        renderPostsList();
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

  document.getElementById('addBlockBtn').addEventListener('click', () => {
    addBlock('paragraph', '');
    handleFormChangeDebounced();
  });

  contentBlocks.addEventListener('click', (e) => {
    const row = e.target.closest('.content-block-row');
    if (!row) return;

    if (e.target.classList.contains('remove-block')) {
      if (contentBlocks.children.length > 1) row.remove();
      handleFormChangeDebounced();
      return;
    }
    if (e.target.classList.contains('move-up')) {
      const prev = row.previousElementSibling;
      if (prev) contentBlocks.insertBefore(row, prev);
      handleFormChangeDebounced();
      return;
    }
    if (e.target.classList.contains('move-down')) {
      const next = row.nextElementSibling;
      if (next) contentBlocks.insertBefore(next, row);
      handleFormChangeDebounced();
    }
  });

  // Raw = keeps empty blocks too, so an in-progress draft doesn't lose structure.
  function collectBlocksRaw() {
    return Array.from(contentBlocks.querySelectorAll('.content-block-row')).map((row) => ({
      style: row.querySelector('.block-style').value,
      text: row.querySelector('.block-text').value
    }));
  }

  function collectBlocks() {
    return collectBlocksRaw()
      .map((b) => ({ style: b.style, text: b.text.trim() }))
      .filter((b) => b.text !== '');
  }

  function restoreBlocks(blocks) {
    contentBlocks.innerHTML = '';
    if (!blocks || blocks.length === 0) {
      addBlock('paragraph-lg', '');
      return;
    }
    blocks.forEach((b) => addBlock(b.style, b.text));
  }

  resetBlocks();

  // ---------- Cover image ----------
  const imageFileInput = document.getElementById('imageFile');
  const imagePreview = document.getElementById('imagePreview');
  let currentImageDataUrl = null;

  imageFileInput.addEventListener('change', async () => {
    const file = imageFileInput.files[0];
    if (!file) {
      currentImageDataUrl = null;
      imagePreview.style.display = 'none';
      handleFormChange();
      return;
    }
    currentImageDataUrl = await BlogData.resizeImageToDataUrl(file);
    imagePreview.src = currentImageDataUrl;
    imagePreview.style.display = '';
    handleFormChange();
  });

  // ---------- Schedule toggle ----------
  const scheduleToggle = document.getElementById('scheduleToggle');
  const schedulePanel = document.getElementById('schedulePanel');
  const publishAtInput = document.getElementById('publishAt');

  scheduleToggle.addEventListener('change', () => {
    if (scheduleToggle.checked) {
      schedulePanel.classList.add('open');
      if (!publishAtInput.value) publishAtInput.value = nowForInput();
    } else {
      schedulePanel.classList.remove('open');
    }
    handleFormChangeDebounced();
  });

  // ---------- Live preview ----------
  const previewContent = document.getElementById('previewContent');

  function updatePreview() {
    const title = document.getElementById('title').value.trim();
    const category = document.getElementById('category').value;
    const blocks = collectBlocks();
    const hasImage = !!imageFileInput.files[0] || !!currentImageDataUrl;

    const previewDate = (scheduleToggle.checked && publishAtInput.value)
      ? new Date(publishAtInput.value)
      : new Date();
    const readingMinutes = blocks.length ? estimateReadingMinutes(blocks) : 1;

    const bodyHtml = blocks.length
      ? blocks.map(renderPreviewBlock).join('')
      : '<p class="preview-placeholder">Start writing to see your post come together here...</p>';

    const imageHtml = hasImage && currentImageDataUrl
      ? `<img class="post-hero-img" src="${currentImageDataUrl}" alt="">`
      : '';

    previewContent.classList.add('fade-swap');
    requestAnimationFrame(() => {
      previewContent.innerHTML = `
        <div class="preview-post-hero">
          <span class="post-category">${escapeHtml(category || 'Category')}</span>
          <h1>${escapeHtml(title || 'Your Post Title')}</h1>
          <div class="post-meta">${formatDate(previewDate.toISOString())} &middot; by Tearri &middot; ${readingMinutes} min read</div>
        </div>
        ${imageHtml}
        <div class="post-body-preview">${bodyHtml}</div>
      `;
      requestAnimationFrame(() => previewContent.classList.remove('fade-swap'));
    });
  }

  // ---------- Draft autosave ----------
  function saveDraft() {
    const draft = {
      title: document.getElementById('title').value,
      category: document.getElementById('category').value,
      excerpt: document.getElementById('excerpt').value,
      scheduled: scheduleToggle.checked,
      publishAt: publishAtInput.value,
      blocks: collectBlocksRaw(),
      imageDataUrl: currentImageDataUrl
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }
  function handleFormChange() {
    saveDraft();
    updatePreview();
  }
  const handleFormChangeDebounced = debounce(handleFormChange, 400);

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  function applyDraft(draft) {
    document.getElementById('title').value = draft.title || '';
    document.getElementById('category').value = draft.category || '';
    document.getElementById('excerpt').value = draft.excerpt || '';
    scheduleToggle.checked = !!draft.scheduled;
    publishAtInput.value = draft.publishAt || '';
    schedulePanel.classList.toggle('open', scheduleToggle.checked);
    restoreBlocks(draft.blocks);
    if (draft.imageDataUrl) {
      currentImageDataUrl = draft.imageDataUrl;
      imagePreview.src = draft.imageDataUrl;
      imagePreview.style.display = '';
    }
  }

  function resetForm() {
    document.getElementById('postForm').reset();
    currentImageDataUrl = null;
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    resetBlocks();
    scheduleToggle.checked = false;
    schedulePanel.classList.remove('open');
    publishAtInput.value = '';
    updatePreview();
  }

  document.getElementById('postForm').addEventListener('input', handleFormChangeDebounced);
  document.getElementById('postForm').addEventListener('change', handleFormChangeDebounced);

  document.getElementById('discardDraftBtn').addEventListener('click', () => {
    clearDraft();
    resetForm();
    document.getElementById('draftRestored').classList.remove('show');
  });

  // ---------- Publish ----------
  document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const hasImage = !!imageFileInput.files[0] || !!currentImageDataUrl;
    if (!hasImage) {
      alert('Add a cover image before publishing.');
      return;
    }

    const content = collectBlocks();
    if (content.length === 0) {
      alert('Add at least one content block with some text before publishing.');
      return;
    }

    const publishAtDate = (scheduleToggle.checked && publishAtInput.value)
      ? new Date(publishAtInput.value)
      : new Date();
    const isScheduled = publishAtDate.getTime() > Date.now();
    const actionLabel = isScheduled
      ? `schedule this post for ${formatDateTime(publishAtDate.toISOString())}`
      : 'publish this post';

    const ok = await confirmWithPassword(actionLabel);
    if (!ok) return;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = isScheduled ? 'Scheduling...' : 'Publishing...';

    try {
      const title = document.getElementById('title').value.trim();
      const category = document.getElementById('category').value;
      const excerpt = document.getElementById('excerpt').value.trim();
      const image = imageFileInput.files[0]
        ? await BlogData.uploadImage(imageFileInput.files[0])
        : await BlogData.uploadImageFromDataUrl(currentImageDataUrl);

      await BlogData.addPost({
        title,
        category,
        image,
        excerpt,
        content,
        publishAt: publishAtDate.toISOString()
      });

      clearDraft();
      resetForm();
      document.getElementById('draftRestored').classList.remove('show');

      const successBox = document.getElementById('formSuccess');
      successBox.textContent = isScheduled
        ? `Post scheduled for ${formatDateTime(publishAtDate.toISOString())}!`
        : "Post published! It's now live on the blog.";
      successBox.classList.add('show');
      setTimeout(() => successBox.classList.remove('show'), 4000);

      renderPostsList();
    } catch (err) {
      alert('Something went wrong publishing this post: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish Post';
    }
  });

  // ---------- Idle auto-logout ----------
  const IDLE_LIMIT_MS = 5 * 60 * 1000;
  let idleTimer;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      await BlogAuth.logout();
      window.location.href = '/admin/login/';
    }, IDLE_LIMIT_MS);
  }

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, resetIdleTimer);
  });

  // ---------- Auth guard ----------
  (async function init() {
    const session = await BlogAuth.getSession();
    if (!session) {
      window.location.href = '/admin/login/';
      return;
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await BlogAuth.logout();
      window.location.href = '/admin/login/';
    });

    const draft = loadDraft();
    if (draft && (draft.title || draft.excerpt || draft.imageDataUrl || (draft.blocks || []).some((b) => b.text))) {
      applyDraft(draft);
      document.getElementById('draftRestored').classList.add('show');
    }
    updatePreview();

    resetIdleTimer();
    renderPostsList();
  })();
})();
