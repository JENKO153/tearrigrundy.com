/*
 * "Paste your whole post": turns one big block of text (from ChatGPT, Word, Google Docs, Notes…)
 * into post blocks: headings, paragraphs and bullet lists.
 *
 * It understands the formatting AI tools usually produce:
 *   # Heading / ## Heading       -> Heading            ### Heading -> Subheading
 *   **A whole line in bold**     -> Subheading
 *   - item / * item / 1. item    -> Bullet list (numbers are dropped)
 *   [words](https://address)     -> kept as a link (other addresses become plain words)
 *   **bold** and *italic*        -> kept (the post page shows them)
 *   --- lines and ![images]      -> ignored
 * Plain text works too: blank lines separate paragraphs, and a short line on its own with no
 * full stop is treated as a heading.
 */
(function (window) {
  const BULLET = /^\s*(?:[-*•–—▪◦]|\d{1,2}[.)])\s+(\S.*)$/;
  const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const BOLD_LINE = /^(\*\*|__)\s*(.+?)\s*\1\s*[:：]?$/;
  const RULE = /^(-{3,}|\*{3,}|_{3,}|={3,})$/;
  const IMAGE = /^!\[[^\]]*\]\([^)]*\)$/;

  const clean = (t) => String(t || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/\t/g, ' ');
  // Links to anything other than https become plain words (the site only allows https links).
  const safeLinks = (s) => s.replace(/\[([^\]]+)\]\((?!https:\/\/)[^)]*\)/g, '$1');
  const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
  const tidy = (s) => safeLinks(s).replace(/ {2,}/g, ' ').trim();

  function parse(raw) {
    const text = clean(raw).trim();
    const out = { title: '', excerpt: '', blocks: [] };
    if (!text) return out;

    const hasBlank = /\n[ ]*\n/.test(text);
    const blocks = [];
    let para = [], paraFromOneLine = false, bullets = [];

    const flushPara = () => {
      if (!para.length) return;
      blocks.push({ style: 'paragraph', text: tidy(para.join(' ')), _single: para.length === 1 });
      para = [];
    };
    const flushBullets = () => {
      if (!bullets.length) return;
      blocks.push({ style: 'bullets', text: bullets.map(tidy).join('\n') });
      bullets = [];
    };
    const flush = () => { flushPara(); flushBullets(); };

    text.split('\n').forEach((line) => {
      const t = line.trim();
      if (!t) { flush(); return; }
      if (RULE.test(t) || IMAGE.test(t)) { flush(); return; }

      let m = HEADING.exec(t);
      if (m) { flush(); blocks.push({ style: m[1].length <= 2 ? 'title' : 'subtitle', text: plain(m[2]), _md: m[1].length }); return; }

      m = BOLD_LINE.exec(t);
      if (m && t.length <= 110) { flush(); blocks.push({ style: 'subtitle', text: plain(m[2]).replace(/[:：]$/, '') }); return; }

      m = BULLET.exec(line);
      if (m) { flushPara(); bullets.push(m[1]); return; }

      flushBullets();
      if (hasBlank) para.push(t);
      else { flushPara(); para.push(t); flushPara(); }   // no blank lines anywhere: every line is a paragraph
    });
    flush();

    // Plain-text headings: a short single line, no full stop, followed by more writing.
    blocks.forEach((b, i) => {
      if (b.style !== 'paragraph' || !b._single || i === blocks.length - 1) return;
      const s = b.text;
      if (s.length <= 70 && s.split(/\s+/).length <= 10 && !/[.!?…,;:"”’)]$/.test(s) && !/[*_\[]/.test(s)) { b.style = 'title'; b.text = plain(s); b._guess = true; }
    });

    // A leading heading is the post title.
    if (blocks.length && blocks[0].style === 'title' && (blocks[0]._md === 1 || blocks[0]._guess) && blocks.length > 2) {
      out.title = blocks.shift().text;
    }
    // The first paragraph becomes the larger "lead" paragraph.
    const first = blocks.find((b) => b.style !== 'title' && b.style !== 'subtitle');
    if (first && first.style === 'paragraph' && blocks.indexOf(first) <= 1 && first.text.length <= 500) first.style = 'paragraph-lg';

    const firstPara = blocks.find((b) => b.style === 'paragraph-lg' || b.style === 'paragraph');
    if (firstPara) {
      const s = plain(firstPara.text);
      out.excerpt = s.length <= 155 ? s : `${s.slice(0, 155).replace(/\s+\S*$/, '')}…`;
    }
    out.blocks = blocks.map(({ style, text: t }) => ({ style, text: t }));
    return out;
  }

  window.Admin = window.Admin || {};
  window.Admin.parsePost = parse;
})(window);
