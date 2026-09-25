/* Single post page: reads ?id= from the URL, renders the post and related posts.
   With ?preview=1 (the admin's live preview) it instead renders whatever draft the
   editor sends it, using this exact same page and styling. */
(function () {
  const PREVIEW = new URLSearchParams(window.location.search).get('preview') === '1';
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('active');
    });
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
    if (!PREVIEW) { const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); }
    document.getElementById('postContainer').innerHTML = `
      <div class="container" style="padding:80px 24px;text-align:center;">
        <h1>Post Not Found</h1>
        <p style="color:var(--ink-light);">This post may have been removed or the link is incorrect.</p>
        <a class="btn" href="/blog/">Back to the Blog</a>
      </div>
    `;
  }

  // Content blocks are objects like
  // { style: 'title'|'subtitle'|'paragraph'|'paragraph-lg'|'paragraph-sm'|'bullets'|'photo', text, image }.
  // Older posts stored content as plain strings, so those are treated as normal paragraphs.
  function normalizeBlock(block) {
    if (typeof block === 'string') return { style: 'paragraph', text: block, image: '' };
    return { style: block.style || 'paragraph', text: block.text || '', image: block.image || '', caption: block.caption || '' };
  }

  // Affiliate embeds. They render as placeholders and are filled in by hydrateEmbeds() once the
  // Earnings settings are known (Stay22 hotel map, Travelpayouts widget).
  const DEFAULT_DISCLOSURE = 'This post contains affiliate links and maps. If you book through them I may earn a small commission, at no extra cost to you.';
  const embedSettings = () => (window.AdSlots && window.AdSlots.money()) || {};

  function hydrateEmbeds() {
    const money = embedSettings();
    const stay = money.stay22 || {}, tp = money.travelpayouts || {};
    let shown = 0;
    document.querySelectorAll('.post-embed').forEach((el) => {
      const kind = el.dataset.kind, value = el.dataset.value || '';
      if (kind === 'map') {
        const ok = stay.enabled && /^[A-Za-z0-9_-]{2,60}$/.test(stay.aid || '') && value.trim();
        if (!ok) { el.innerHTML = PREVIEW && value.trim() ? '<div class="post-embed-note">The hotel map appears here once Stay22 is switched on under Earnings.</div>' : ''; el.style.display = PREVIEW && value.trim() ? '' : 'none'; return; }
        if (el.dataset.done === `${stay.aid}|${value}`) { shown++; return; }
        el.dataset.done = `${stay.aid}|${value}`;
        el.style.display = '';
        const url = `https://www.stay22.com/embed/gm?aid=${encodeURIComponent(stay.aid)}&address=${encodeURIComponent(value)}&maincolor=4a7c74`;
        const label = el.dataset.caption || `Where to stay: ${value}`;
        el.innerHTML = `<h3 class="post-embed-title">${escapeHtml(label)}</h3><iframe class="post-embed-map" src="${escapeHtml(url)}" title="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
        shown++;
      } else if (kind === 'widget') {
        const ok = tp.enabled && /^https:\/\/[^\s"'<>]+$/.test(value);
        if (!ok || PREVIEW) { el.innerHTML = PREVIEW && /^https:\/\//.test(value) ? '<div class="post-embed-note">Your Travelpayouts widget shows here on the live site.</div>' : ''; el.style.display = PREVIEW && /^https:\/\//.test(value) ? '' : 'none'; return; }
        if (el.dataset.done === value) { shown++; return; }
        el.dataset.done = value;
        el.style.display = '';
        el.innerHTML = '';
        const s = document.createElement('script');
        s.async = true; s.charset = 'utf-8'; s.src = value;
        el.appendChild(s);
        shown++;
      }
    });
    const note = document.getElementById('postDisclosure');
    if (note) {
      const text = (money.disclosure || '').trim() || DEFAULT_DISCLOSURE;
      note.textContent = text;
      note.style.display = shown || document.querySelector('.post-body a[data-aff]') || (PREVIEW && document.querySelector('.post-embed[data-value]:not([data-value=""])')) ? '' : 'none';
    }
  }
  document.addEventListener('tg:content', hydrateEmbeds);

  // Links are written as [words](https://address) in the post editor. Text is escaped first, and only
  // https addresses are turned into links. Links to booking/travel sites are marked as sponsored.
  const AFF_HOSTS = /(^|\.)(booking\.com|expedia\.[a-z.]+|hotels\.com|hotelscombined\.[a-z.]+|kayak\.[a-z.]+|momondo\.[a-z.]+|agoda\.[a-z.]+|vrbo\.com|getyourguide\.[a-z.]+|viator\.com|skyscanner\.[a-z.]+|stay22\.com|tp\.st|tp\.media)$/i;
  function rich(escaped) {
    return escaped.replace(/\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,600})\)/g, (m, label, url) => {
      let host;
      try { host = new URL(url.replace(/&amp;/g, '&')).hostname; } catch (e) { return m; }
      const aff = AFF_HOSTS.test(host);
      return `<a href="${url}" target="_blank" rel="noopener${aff ? ' sponsored' : ''}"${aff ? ' data-aff="1"' : ''}>${label}</a>`;
    });
  }

  function renderBlock(block) {
    if (block.style === 'map' || block.style === 'widget') {
      if (!block.text.trim()) return '';
      return `<div class="post-embed" data-kind="${block.style}" data-value="${escapeHtml(block.text.trim())}" data-caption="${escapeHtml(block.caption || '')}" style="display:none"></div>`;
    }
    if (block.style === 'photo') {
      if (!block.image) return '';
      const caption = block.text ? `<figcaption>${escapeHtml(block.text)}</figcaption>` : '';
      return `<figure class="post-block-photo"><img src="${escapeHtml(block.image)}" alt="${escapeHtml(block.text || '')}" loading="lazy">${caption}</figure>`;
    }
    const text = escapeHtml(block.text);
    switch (block.style) {
      case 'title':
        return `<h2>${text}</h2>`;
      case 'subtitle':
        return `<h3 class="post-block-subtitle">${text}</h3>`;
      case 'paragraph-lg':
        return `<p class="post-block-lead">${rich(text)}</p>`;
      case 'paragraph-sm':
        return `<p class="post-block-sm">${rich(text)}</p>`;
      case 'bullets': {
        const items = text.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => `<li>${rich(s)}</li>`).join('');
        return items ? `<ul>${items}</ul>` : '';
      }
      default:
        return `<p>${rich(text)}</p>`;
    }
  }

  function estimateReadingMinutes(blocks) {
    const wordCount = blocks.filter((b) => b.style !== 'map' && b.style !== 'widget').reduce((total, b) => total + b.text.split(/\s+/).filter(Boolean).length, 0);
    return Math.max(1, Math.round(wordCount / 200));
  }

  // Search + social tags for this post (Google runs the page's JavaScript, so it reads these).
  const SITE = 'https://tearrigrundy.com';
  function setMeta(id, attr, value) { const el = document.getElementById(id); if (el) el.setAttribute(attr, value); }
  function applySeo(post) {
    if (PREVIEW) return;
    const title = `${post.title} | Tearri Grundy`;
    const desc = (post.excerpt || '').slice(0, 300);
    const url = `${SITE}/post/?id=${encodeURIComponent(post.id)}`;
    const img = /^https:\/\//.test(post.image || '') ? post.image : `${SITE}/images/banner-hero.jpg`;
    setMeta('seoDesc', 'content', desc);
    setMeta('seoCanonical', 'href', url);
    setMeta('ogTitle', 'content', title); setMeta('twTitle', 'content', title);
    setMeta('ogDesc', 'content', desc); setMeta('twDesc', 'content', desc);
    setMeta('ogUrl', 'content', url);
    setMeta('ogImage', 'content', img); setMeta('twImage', 'content', img);
    const old = document.getElementById('postJsonLd');
    if (old) old.remove();
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'postJsonLd';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: desc,
      image: [img], datePublished: post.date, dateModified: post.date, mainEntityOfPage: url,
      articleSection: post.category, author: { '@type': 'Person', name: post.author || 'Tearri Grundy', url: `${SITE}/about/` },
      publisher: { '@type': 'Person', name: 'Tearri Grundy' }
    }).replace(/</g, '\\u003c');
    document.head.appendChild(ld);
  }

  function renderPost(post) {
    document.getElementById('pageTitle').textContent = `${post.title} | Tearri Grundy`;
    applySeo(post);

    const blocks = (post.content || []).map(normalizeBlock)
      .filter((b) => (b.style === 'photo' ? !!b.image : b.text.trim() !== ''));
    const readingMinutes = estimateReadingMinutes(blocks);

    // Ad slot sits after the first block — a fixed, predictable spot
    // regardless of how the rest of the post is structured.
    const firstBlockHtml = blocks.length ? renderBlock(blocks[0]) : '';
    const restBlocksHtml = blocks.slice(1).map(renderBlock).join('');
    const bodyHtml = `${firstBlockHtml}<div class="ad-slot" id="adSlotInPost" style="display:none;"></div>${restBlocksHtml}`;

    const postContainer = document.getElementById('postContainer');
    postContainer.innerHTML = `
      <div class="reveal">
        <div class="post-hero">
          <div class="container">
            <span class="post-category">${escapeHtml(post.category)}</span>
            <h1>${escapeHtml(post.title)}</h1>
            <div class="post-meta">${formatDate(post.date)} &middot; by ${escapeHtml(post.author)} &middot; ${readingMinutes} min read</div>
          </div>
        </div>
        <div class="container">
          ${post.image ? `<img class="post-hero-img" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">` : ''}
          <div class="post-body">
            ${bodyHtml}
            <p class="post-disclosure" id="postDisclosure" style="display:none"></p>
            <div class="post-body-footer">
              <a class="btn btn-outline" href="/blog/">&larr; Back to All Posts</a>
            </div>
          </div>
        </div>
      </div>
    `;
    window.ScrollReveal.observe(postContainer.querySelector('.reveal'));
    window.AdSlots.renderSlot('in-post', document.getElementById('adSlotInPost'));
    hydrateEmbeds();
    document.dispatchEvent(new Event('tg:post-rendered'));
  }

  function renderRelated(post, allPosts) {
    const related = allPosts
      .filter((p) => p.id !== post.id && p.category === post.category)
      .slice(0, 3);

    if (related.length === 0) return;

    document.getElementById('relatedSection').style.display = '';
    const relatedGrid = document.getElementById('relatedPosts');
    relatedGrid.innerHTML = related.map((p) => `
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
    relatedGrid.classList.add('reveal-group');
    window.ScrollReveal.observe(relatedGrid);
  }

  if (PREVIEW) {
    document.getElementById('postContainer').innerHTML = '<div class="container" style="padding:80px 24px;text-align:center;color:var(--ink-light);">Your post appears here as you write it…</div>';
    window.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data && e.data.type === 'tg:preview' && e.data.post) {
        if (e.data.money && window.SiteContent) window.SiteContent.settings = Object.assign({}, window.SiteContent.settings, { money: e.data.money });
        renderPost(e.data.post);
      }
    });
    return;
  }

  (async function init() {
    document.getElementById('postContainer').innerHTML = '<div class="container" style="padding:80px 24px;text-align:center;color:var(--ink-light);">Loading...</div>';
    window.AdSlots.renderSlot('footer-banner', document.getElementById('adSlotFooter'));

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
