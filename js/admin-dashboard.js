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
    saveDraftDebounced();
  });

  contentBlocks.addEventListener('click', (e) => {
    const row = e.target.closest('.content-block-row');
    if (!row) return;

    if (e.target.classList.contains('remove-block')) {
      if (contentBlocks.children.length > 1) row.remove();
      saveDraftDebounced();
      return;
    }
    if (e.target.classList.contains('move-up')) {
      const prev = row.previousElementSibling;
      if (prev) contentBlocks.insertBefore(row, prev);
      saveDraftDebounced();
      return;
    }
    if (e.target.classList.contains('move-down')) {
      const next = row.nextElementSibling;
      if (next) contentBlocks.insertBefore(next, row);
      saveDraftDebounced();
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
      saveDraftDebounced();
      return;
    }
    currentImageDataUrl = await BlogData.resizeImageToDataUrl(file);
    imagePreview.src = currentImageDataUrl;
    imagePreview.style.display = '';
    saveDraftDebounced();
  });

  // ---------- Draft autosave ----------
  function saveDraft() {
    const draft = {
      title: document.getElementById('title').value,
      category: document.getElementById('category').value,
      excerpt: document.getElementById('excerpt').value,
      publishAt: document.getElementById('publishAt').value,
      blocks: collectBlocksRaw(),
      imageDataUrl: currentImageDataUrl
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }
  const saveDraftDebounced = debounce(saveDraft, 500);

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
    document.getElementById('publishAt').value = draft.publishAt || nowForInput();
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
    document.getElementById('publishAt').value = nowForInput();
  }

  document.getElementById('postForm').addEventListener('input', saveDraftDebounced);
  document.getElementById('postForm').addEventListener('change', saveDraftDebounced);

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

    const publishAtValue = document.getElementById('publishAt').value;
    const publishAtDate = new Date(publishAtValue);
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
    } else {
      document.getElementById('publishAt').value = nowForInput();
    }

    resetIdleTimer();
    renderPostsList();
  })();
})();
