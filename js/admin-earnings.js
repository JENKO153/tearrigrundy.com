/*
 * Earnings: Google AdSense, Stay22 and Travelpayouts, plus the affiliate disclosure.
 * Values are saved inside the site settings as `money` (see js/ads.js and js/post.js, which read
 * them on the public site). Anything switched off or incomplete renders nothing on the site.
 */
(function (window) {
  const A = window.Admin;
  const esc = A.esc, $ = A.$;

  const DEF = {
    adsense: { enabled: false, client: '', footer: '', inPost: '' },
    stay22: { enabled: false, aid: '', linkSwap: false, lma: '' },
    travelpayouts: { enabled: false, marker: '', script: '' },
    disclosure: '',
  };
  const RE = {
    client: /^ca-pub-\d{10,20}$/, slot: /^\d{6,20}$/, aid: /^[A-Za-z0-9_-]{2,60}$/, lma: /^[A-Za-z0-9_-]{8,64}$/, marker: /^\d{3,12}$/, script: /^https:\/\/[^\s"'<>]+$/,
  };
  const DEFAULT_DISCLOSURE = 'This post contains affiliate links and maps. If you book through them I may earn a small commission, at no extra cost to you.';

  const merge = (saved) => {
    const out = JSON.parse(JSON.stringify(DEF));
    const m = saved || {};
    Object.keys(out).forEach((k) => {
      if (k === 'disclosure') { if (typeof m.disclosure === 'string') out.disclosure = m.disclosure; return; }
      Object.keys(out[k]).forEach((f) => { if (m[k] && typeof m[k][f] === typeof out[k][f]) out[k][f] = m[k][f]; });
    });
    return out;
  };
  const status = (m) => ({
    adsense: !m.adsense.enabled ? 'off' : RE.client.test(m.adsense.client) && (RE.slot.test(m.adsense.footer) || RE.slot.test(m.adsense.inPost)) ? 'live' : 'todo',
    stay22: (() => {
      const s = m.stay22, map = s.enabled, swap = s.linkSwap;
      if (!map && !swap) return 'off';
      const mapOk = !map || RE.aid.test(s.aid), swapOk = !swap || RE.lma.test(s.lma);
      return mapOk && swapOk ? 'live' : 'todo';
    })(),
    travelpayouts: !m.travelpayouts.enabled ? 'off' : RE.script.test(m.travelpayouts.script) ? 'live' : 'todo',
  });
  A.moneyStatus = (money) => status(merge(money));
  const chip = (s) => `<span class="a-pill ${s === 'live' ? 'live' : s === 'todo' ? 'draft' : ''}">${s === 'live' ? 'Live' : s === 'todo' ? 'Needs details' : 'Off'}</span>`;

  /* =====================================================================
     Earnings table: live feeds (Travelpayouts, Stay22) + figures typed in by hand (AdSense etc.)
     ===================================================================== */
  const PLATFORMS = [['travelpayouts', 'Travelpayouts'], ['stay22', 'Stay22'], ['adsense', 'Google AdSense']];
  const cache = { at: 0, data: null };
  A.getEarnings = async (force) => {
    if (!force && cache.data && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
    cache.data = await CMS.loadEarnings(6);
    cache.at = Date.now();
    return cache.data;
  };
  const money = (n, cur) => `${cur || ''} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  const lastMonths = (n) => {
    const now = new Date(), out = [];
    for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    return out;
  };
  const monthName = (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Works out what to show in every cell. A figure typed in by hand wins over the live feed for that month.
  function buildGrid(data) {
    const months = lastMonths(6), grid = {}, totals = {}, byCurrency = {};
    const liveFeeds = (data.live && data.live.platforms) || {};
    months.forEach((m) => {
      grid[m] = {};
      PLATFORMS.forEach(([p]) => {
        const manual = data.manual.find((r) => r.month === m && r.platform === p);
        const feed = liveFeeds[p];
        let cell = null;
        if (manual) cell = { amount: Number(manual.amount), pending: 0, currency: manual.currency, manual: true };
        else if (feed && feed.ok) { const b = feed.months[m]; cell = b ? { amount: b.confirmed, pending: b.pending, currency: feed.currency } : { amount: 0, pending: 0, currency: feed.currency }; }
        // Everything is shown in Australian dollars, converted at that month's average exchange rate.
        if (cell && cell.currency !== 'AUD') {
          const table = (data.live && data.live.fx && data.live.fx[cell.currency]) || {};
          const rate = table[m] || table.latest;
          if (rate) cell = { ...cell, amount: cell.amount * rate, pending: cell.pending * rate, currency: 'AUD', from: cell.currency, orig: cell.amount };
        }
        grid[m][p] = cell;
        if (cell) {
          const t = (totals[p] ||= { amount: 0, pending: 0, currency: cell.currency });
          t.amount += cell.amount; t.pending += cell.pending;
          const c = (byCurrency[m] ||= {}); c[cell.currency] = (c[cell.currency] || 0) + cell.amount;
        }
      });
    });
    return { months, grid, totals, byCurrency };
  }
  A.earningsThisMonth = (data) => { const g = buildGrid(data); return g.byCurrency[g.months[0]] || {}; };

  const COLORS = { travelpayouts: '#4a7c74', stay22: '#c96f4a', adsense: '#d6a44b' };
  const shortMonth = (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const joinMoney = (byCur) => { const parts = Object.entries(byCur || {}).filter(([, n]) => n > 0).map(([cur, n]) => money(n, cur)); return parts.length ? parts.join(' + ') : ''; };

  function platformState(data, p) {
    const f = data.live && data.live.platforms && data.live.platforms[p];
    const hasManual = data.manual.some((r) => r.platform === p);
    if (p === 'adsense') return hasManual ? { kind: 'manual', pill: 'Typed in', text: '' } : { kind: 'off', pill: 'Type it in', text: 'Add your monthly figure below.' };
    if (data.liveError) return { kind: 'todo', pill: 'Setup needed', text: 'Live feed not switched on yet.' };
    if (!f || !f.configured) return hasManual ? { kind: 'manual', pill: 'Typed in', text: '' } : { kind: 'off', pill: 'Not connected', text: '' };
    if (!f.ok) return { kind: 'bad', pill: 'Problem', text: f.error || 'Could not load.' };
    return { kind: 'live', pill: 'Live', text: '' };
  }
  const pillClass = (k) => (k === 'live' ? 'live' : k === 'bad' ? 'bad' : k === 'todo' ? 'draft' : k === 'manual' ? 'scheduled' : '');

  function chartHtml(g) {
    const totalsByCur = {};
    Object.values(g.byCurrency).forEach((c) => Object.entries(c).forEach(([cur, n]) => { totalsByCur[cur] = (totalsByCur[cur] || 0) + n; }));
    const main = Object.keys(totalsByCur).sort((a, b) => totalsByCur[b] - totalsByCur[a])[0];
    if (!main) return '<div class="a-empty">No earnings to chart yet.</div>';
    const cols = g.months.slice().reverse().map((m) => {
      const segs = PLATFORMS.map(([p, l]) => ({ p, l, v: g.grid[m][p] && g.grid[m][p].currency === main ? g.grid[m][p].amount : 0 }));
      return { m, segs, total: segs.reduce((a, x) => a + x.v, 0) };
    });
    const max = Math.max(...cols.map((c) => c.total), 1);
    const bars = cols.map((c) => `<div class="e-col"><div class="e-val">${c.total ? Math.round(c.total) : ''}</div>
      <div class="e-stack" role="img" aria-label="${monthName(c.m)}: ${money(c.total, main)}">${c.segs.filter((x) => x.v > 0).map((x) => `<span style="height:${(x.v / max) * 100}%;background:${COLORS[x.p]}" title="${x.l}: ${money(x.v, main)}"></span>`).join('')}</div>
      <div class="e-lbl">${shortMonth(c.m)}</div></div>`).join('');
    const other = Object.keys(totalsByCur).filter((c) => c !== main);
    return `<div class="e-chart">${bars}</div>
      <div class="e-legend">${PLATFORMS.map(([p, l]) => `<span><i style="background:${COLORS[p]}"></i>${l}</span>`).join('')}<span class="m">Chart shows ${main}${other.length ? ` only (${other.join(', ')} figures are in the table)` : ''}</span></div>`;
  }

  function tableHtml(g) {
    const cell = (c) => (!c ? '<span class="m">—</span>' : `<b${c.from ? ` title="Converted from ${money(c.orig, c.from)}"` : ''}>${money(c.amount, c.currency)}</b>${c.pending ? `<div class="m">+ ${money(c.pending, c.currency)} pending</div>` : ''}${c.manual ? '<div class="m">typed in</div>' : ''}`);
    return `<div class="a-scroll"><table class="a-table a-earn"><thead><tr><th>Month</th>${PLATFORMS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      ${g.months.map((m) => `<tr><td>${monthName(m)}</td>${PLATFORMS.map(([p]) => `<td>${cell(g.grid[m][p])}</td>`).join('')}<td>${joinMoney(g.byCurrency[m]) ? `<b>${joinMoney(g.byCurrency[m])}</b>` : '<span class="m">—</span>'}</td>`).join('')}
      </tbody></table></div>`;
  }

  // The headline total + one card per platform. Used on the Earnings page and on the Overview.
  function summaryHtml(data, opts = {}) {
    const g = buildGrid(data), now = g.months[0], prev = g.months[1];
    const cur = g.byCurrency[now] || {};
    const pend = {};
    PLATFORMS.forEach(([p]) => { const c = g.grid[now][p]; if (c && c.pending) pend[c.currency] = (pend[c.currency] || 0) + c.pending; });
    let delta = '';
    const curKeys = Object.keys(cur);
    if (curKeys.length === 1) {
      const c = curKeys[0], before = (g.byCurrency[prev] || {})[c];
      if (before > 0) { const pct = Math.round(((cur[c] - before) / before) * 100); delta = `<span class="e-delta ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${monthName(prev).split(' ')[0]}</span>`; }
    }
    const updated = data.live && data.live.updated ? `Live figures updated ${A.ago(data.live.updated)}` : 'Live figures not connected yet';
    const cards = PLATFORMS.map(([p, label]) => {
      const c = g.grid[now][p], t = g.totals[p], st = platformState(data, p);
      return `<div class="e-card" style="--c:${COLORS[p]}">
        <div class="e-card-top"><span class="e-name"><i></i>${label}</span><span class="a-pill ${pillClass(st.kind)}">${st.pill}</span></div>
        <div class="e-amt">${c ? money(c.amount, c.currency) : '—'}</div>
        <div class="e-note">${c && c.pending ? `+ ${money(c.pending, c.currency)} pending` : 'this month'}</div>
        <div class="e-six">${t ? `${money(t.amount, t.currency)} over 6 months` : 'No figures yet'}</div>
        ${st.text ? `<div class="${st.kind === 'bad' || st.kind === 'todo' ? 'e-warn' : 'e-hint'}">${esc(st.text)}</div>` : ''}
        ${st.kind === 'live' || st.kind === 'manual' || p === 'adsense' ? '' : '<a class="e-link" href="#earnings/connections">Connect →</a>'}
      </div>`;
    }).join('');
    const converted = Object.values(g.grid).some((row) => Object.values(row).some((c) => c && c.from));
    const note = converted ? `Converted to AUD at each month's average exchange rate (${esc((data.live && data.live.fxSource) || 'ECB')}), so treat it as approximate.` : '';
    return `
      <div class="e-hero"><div>
          <div class="e-eyebrow">Earned in ${monthName(now)}</div>
          <div class="e-big">${joinMoney(cur) || '<span class="e-none">Nothing yet</span>'}</div>
          <div class="e-sub">${joinMoney(pend) ? `+ ${joinMoney(pend)} pending · ` : ''}${delta}${!joinMoney(cur) ? 'Connect an account or type in a figure to get started.' : ''}</div>
          ${note && !opts.overview ? `<div class="e-fx">${note}</div>` : ''}
        </div>
        <div class="e-hero-side">${opts.overview ? '<a class="a-btn ghost sm" href="#earnings">Full breakdown →</a>' : '<button class="a-btn ghost sm" id="earnRefresh" type="button">↻ Refresh</button>'}<div class="e-updated">${updated}</div></div></div>
      <div class="e-cards">${cards}</div>`;
  }
  A.earningsSummaryHtml = (data, opts) => summaryHtml(data, opts);

  async function paintEarnings(box, force) {
    box.innerHTML = '<p class="hint" style="padding:30px 0;text-align:center">Loading your earnings…</p>';
    let data;
    try { data = await A.getEarnings(force); } catch (e) { box.innerHTML = `<div class="a-card"><p class="hint">Could not load earnings: ${esc(e.message)}</p></div>`; return; }
    const g = buildGrid(data);
    box.innerHTML = summaryHtml(data) + `
      <div class="a-card"><h2>Last 6 months</h2><p class="hint">Confirmed earnings each month. Hover a bar for the detail.</p>${chartHtml(g)}</div>
      <div class="a-card"><h2>Month by month</h2><p class="hint">“Pending” is booked but not paid out yet.</p>${tableHtml(g)}</div>
      <details class="a-how e-setup"><summary>Set up the live feeds (Travelpayouts &amp; Stay22)</summary><ol>
        <li>Run the database scripts in <code>supabase/00-run-everything.sql</code> once in the Supabase SQL Editor.</li>
        <li><b>Travelpayouts:</b> Profile → API token → copy the token.</li>
        <li><b>Stay22:</b> Stay22 Hub → Settings → Hub Data Reporting API → Generate → copy (shown once).</li>
        <li>In a terminal, from the website's folder:<pre class="a-code-block">supabase secrets set TRAVELPAYOUTS_TOKEN=paste-here STAY22_API_KEY=paste-here --project-ref cbadidkhyepefebjnvsl
supabase functions deploy earnings --project-ref cbadidkhyepefebjnvsl --use-api</pre></li>
        <li>Press <b>Refresh</b>. The tokens stay inside Supabase, never on the website.</li></ol></details>`;
    $('earnRefresh').onclick = () => paintEarnings(box, true);
    manualCard(data);
  }

  function manualCard(data) {
    const holder = $('earnManual');
    if (!holder) return;
    if (!data.manualAvailable) {
      holder.innerHTML = '<p class="hint">To type figures in by hand, run <code>supabase/00-run-everything.sql</code> once in the Supabase SQL Editor.</p>';
      return;
    }
    const thisMonth = lastMonths(1)[0];
    holder.innerHTML = `<details class="e-details"><summary>＋ Type in a figure by hand</summary><p class="hint">For AdSense, or to correct a month. A figure you type replaces the live number for that platform and month.</p>
      <div class="a-two"><div class="a-field"><label for="mPlat">Platform</label><select id="mPlat">${PLATFORMS.map(([p, l]) => `<option value="${p}" ${p === 'adsense' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="a-field"><label for="mMonth">Month</label><input type="month" id="mMonth" value="${thisMonth}" max="${thisMonth}"></div></div>
      <div class="a-two"><div class="a-field"><label for="mAmount">Amount earned</label><input id="mAmount" inputmode="decimal" placeholder="e.g. 42.50" autocomplete="off"></div>
        <div class="a-field"><label for="mCur">Currency</label><input id="mCur" value="AUD" maxlength="3" autocomplete="off"></div></div>
      <button class="a-btn sm" id="mSave" type="button">Save figure</button>
      ${data.manual.length ? `<ul class="a-list" style="margin-top:14px">${data.manual.slice(0, 12).map((r) => `<li><div class="grow"><div class="t">${PLATFORMS.find(([p]) => p === r.platform)?.[1] || esc(r.platform)} · ${monthName(r.month)}</div><div class="m">${money(r.amount, r.currency)}</div></div><button class="a-icon danger" data-mdel="${esc(r.month)}|${esc(r.platform)}">Remove</button></li>`).join('')}</ul>` : ''}</details>`;
    $('mSave').onclick = async () => {
      const amount = Number(String($('mAmount').value).replace(/[, ]/g, ''));
      const cur = $('mCur').value.trim().toUpperCase();
      if (!Number.isFinite(amount) || amount < 0 || $('mAmount').value.trim() === '') { A.toast('Enter the amount as a number, like 42.50.', 'bad'); return; }
      if (!/^[A-Z]{3}$/.test(cur)) { A.toast('Currency should be 3 letters, like AUD or USD.', 'bad'); return; }
      if (!$('mMonth').value) { A.toast('Pick a month.', 'bad'); return; }
      try {
        const res = await A.withWrite('save this earnings figure', () => CMS.saveManualEarning({ month: $('mMonth').value, platform: $('mPlat').value, amount: Math.round(amount * 100) / 100, currency: cur }));
        if (res.cancelled) return;
        A.toast('Figure saved', 'ok'); paintEarnings($('earnTable'), true);
      } catch (e) { A.toast(e.message, 'bad'); }
    };
    holder.onclick = async (e) => {
      const d = e.target.closest('[data-mdel]');
      if (!d) return;
      const [month, platform] = d.dataset.mdel.split('|');
      try {
        const res = await A.withWrite('remove this figure', () => CMS.deleteManualEarning(month, platform));
        if (!res.cancelled) { A.toast('Removed', 'ok'); paintEarnings($('earnTable'), true); }
      } catch (ex) { A.toast(ex.message, 'bad'); }
    };
  }

  A.views.earnings = async function (arg, root) {
    const { data: saved, available } = await CMS.loadSettings();
    const m = merge(saved.money);
    let touched = false;

    const sw = (path, label) => `<label class="a-switch"><input type="checkbox" data-path="${path}"><span class="track"></span><span>${label}</span></label>`;
    const field = (path, label, ph, hint, extra = '') => `<div class="a-field"><label for="e_${path.replace('.', '_')}">${label}</label><input id="e_${path.replace('.', '_')}" data-path="${path}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false" ${extra}>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;

    root.innerHTML = `<div class="a-view">
      <div class="a-head"><div><h1 class="a-h1">Earnings</h1><p class="a-lead">Your travel and ad income in one place.</p></div>
        <div class="a-tabs" id="earnTabs"><button type="button" class="a-tab on" data-tab="earn">Earnings</button><button type="button" class="a-tab" data-tab="conn">Connections</button></div></div>

      <div id="tabEarn"><div id="earnTable"></div><div class="a-card" id="earnManual"></div></div>

      <div id="tabConn" class="hidden">
      <p class="a-lead" style="margin-bottom:18px">Connect your accounts and choose what shows on the site. Nothing appears until a service is switched on and filled in.</p>
      ${available ? '' : '<div class="a-card" style="border-left:4px solid var(--a-warn)"><h2>One quick set-up step</h2><p class="hint" style="margin:0">Saving needs <code>supabase/00-run-everything.sql</code> to be run once.</p></div>'}

      <div class="a-card"><div class="a-card-top"><h2>Stay22 — hotel links &amp; maps</h2><span id="chip_stay22"></span></div>
        <p class="hint">Two ways to earn from hotel bookings. Use either or both.</p>
        <h3 class="a-sub">Link swapping (Let Me Allez script)</h3>
        <p class="hint">Turns links to hotel and booking sites inside your posts into links that earn a commission. It runs on every page.</p>
        ${sw('stay22.linkSwap', 'Turn link swapping on')}
        ${field('stay22.lma', 'Your script ID', 'e.g. 6ab6459828c02a2c437e2fef', 'In the code Stay22 gave you it is the long value after <code>lmaID:</code>.')}
        <h3 class="a-sub">Hotel map block</h3>
        <p class="hint">An interactive map of places to stay, added to any post with the <b>+ Hotel map</b> block.</p>
        ${sw('stay22.enabled', 'Turn hotel maps on')}
        ${field('stay22.aid', 'Your Stay22 affiliate ID', 'e.g. tearrigrundy', 'Found in your Stay22 dashboard (sometimes shown as “AID”). This can be different from the script ID above.')}
        <details class="a-how"><summary>How do I link Stay22?</summary><ol>
          <li>Sign up at <b>stay22.com</b> as a creator and add tearrigrundy.com.</li>
          <li><b>Link swapping:</b> in Stay22 go to <b>Create your script</b>, keep the domain as tearrigrundy.com (leave the optional link-format box empty) and create it. In the code they give you, copy the value after <code>lmaID:</code> and paste it into <b>Your script ID</b>. You don't need to add their code anywhere else, the site loads it for you.</li>
          <li><b>Hotel maps:</b> paste your affiliate ID into the second box, then use <b>+ Hotel map</b> in a post and type a place like “Kyoto, Japan”.</li>
          <li>Tick what you want on and press Save.</li></ol></details></div>

      <div class="a-card"><div class="a-card-top"><h2>Travelpayouts — flights, hotels &amp; more</h2><span id="chip_travelpayouts"></span></div>
        <p class="hint">A travel affiliate network (flights, hotels, car hire…). Their site-wide script turns normal travel links into tracked ones, and their search boxes can go inside posts with <b>+ Travel widget</b>.</p>
        ${sw('travelpayouts.enabled', 'Turn Travelpayouts on')}
        ${field('travelpayouts.script', 'Site-wide script link', 'https://…', 'Optional but recommended. The link from your Travelpayouts script (the part inside <code>src="…"</code>).')}
        ${field('travelpayouts.marker', 'Your Travelpayouts ID (marker)', 'e.g. 123456', 'Just for your reference so it is written down in one place.')}
        <details class="a-how"><summary>How do I link Travelpayouts?</summary><ol>
          <li>Go to <b>travelpayouts.com</b> and create a free account.</li>
          <li>Add tearrigrundy.com as a project/website, and join the travel programs you want (flights, hotels, etc.).</li>
          <li>Open the tools area in your Travelpayouts dashboard and copy the <b>script code</b> they give you. Only copy the web address inside <code>src="…"</code> (it starts with <code>https://</code>) and paste it above.</li>
          <li>For a search box inside a post, create a widget there, copy its script link the same way, then use <b>+ Travel widget</b> in the post editor and paste it.</li>
          <li>Tick <b>Turn Travelpayouts on</b> and Save.</li></ol>
          <p class="hint"><b>Only paste links from your own Travelpayouts dashboard</b> — a link you paste here runs on every page.</p></details></div>

      <div class="a-card"><div class="a-card-top"><h2>Google AdSense — display ads</h2><span id="chip_adsense"></span></div>
        <p class="hint">Ads that pay per view and click. You choose where they can appear; each spot only shows once it has an ad unit number.</p>
        ${sw('adsense.enabled', 'Turn AdSense on')}
        ${field('adsense.client', 'Publisher ID', 'ca-pub-1234567890123456', 'From AdSense → Account → Account information (“Publisher ID”, starts with pub-). Enter it as ca-pub-…')}
        <div class="a-two">
          ${field('adsense.footer', 'Bottom-of-page ad unit', '1234567890', 'Shows above the footer on every page.')}
          ${field('adsense.inPost', 'Inside-post ad unit', '0987654321', 'Shows after the first block of each post.')}
        </div>
        <details class="a-how"><summary>How do I link AdSense?</summary><ol>
          <li>Go to <b>adsense.google.com</b>, sign in with a Google account and add <b>tearrigrundy.com</b>.</li>
          <li>Google needs a privacy policy page on the site and a cookie-consent banner for visitors in the UK/EU. Approval can take a few days to a few weeks.</li>
          <li>Once approved: <b>Ads → By ad unit → Display ads</b>, create one unit for the bottom of the page and one for inside posts. Each has a number (the <code>data-ad-slot</code>) — paste them above.</li>
          <li>Paste your <b>Publisher ID</b> above, tick <b>Turn AdSense on</b> and Save.</li>
          <li><b>ads.txt:</b> AdSense checks a file called <code>ads.txt</code> on your site. Copy the line below into <code>ads.txt</code> in the site's files and publish the site (ask your developer, or Claude, to do this).</li></ol></details>
        <div class="a-field" style="margin-top:14px"><label>Your ads.txt line</label><div class="a-secret" id="adsTxt">Enter your publisher ID above</div>
          <button class="a-btn ghost sm" id="copyAds" type="button" style="margin-top:8px">Copy line</button></div></div>

      <div class="a-card"><h2>Affiliate disclosure</h2><p class="hint">Shown at the bottom of any post that has a hotel map or travel widget. Most countries require this.</p>
        <div class="a-field" style="margin:0"><textarea data-path="disclosure" rows="3" maxlength="300" placeholder="${esc(DEFAULT_DISCLOSURE)}" aria-label="Disclosure text"></textarea><p class="hint">Leave blank to use the wording above.</p></div></div>
      </div>
    </div>`;

    let tab = 'earn';
    function showTab(t) {
      tab = t;
      $('tabEarn').classList.toggle('hidden', t !== 'earn');
      $('tabConn').classList.toggle('hidden', t !== 'conn');
      $('earnTabs').querySelectorAll('.a-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
      bar();
      window.scrollTo(0, 0);
    }
    $('earnTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
    root.addEventListener('click', (e) => { if (e.target.closest('[data-goto]')) showTab('conn'); });
    if (arg === 'connections') tab = 'conn';
    paintEarnings($('earnTable'), false);

    /* ---------- bind form <-> state ---------- */
    const get = (path) => path.split('.').reduce((o, k) => o[k], m);
    const set = (path, v) => { const [a, b] = path.split('.'); if (b) m[a][b] = v; else m[a] = v; };
    root.querySelectorAll('[data-path]').forEach((el) => {
      const v = get(el.dataset.path);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    const line = () => {
      const c = m.adsense.client.trim();
      $('adsTxt').textContent = RE.client.test(c) ? `google.com, pub-${c.slice(3).replace('pub-', '')}, DIRECT, f08c47fec0942fa0` : 'Enter your publisher ID above';
    };
    function paint() {
      const st = status(m);
      Object.keys(st).forEach((k) => { $(`chip_${k}`).innerHTML = chip(st[k]); });
      line();
    }
    paint();
    root.addEventListener('input', (e) => {
      const p = e.target.dataset && e.target.dataset.path;
      if (!p) return;
      set(p, e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim());
      if (p === 'disclosure') m.disclosure = e.target.value;
      touched = true; A.dirty = true; paint(); bar();
    });
    $('copyAds').onclick = async () => {
      const t = $('adsTxt').textContent;
      if (!t.startsWith('google.com')) { A.toast('Enter a valid publisher ID first.', 'bad'); return; }
      try { await navigator.clipboard.writeText(t); A.toast('Copied', 'ok'); } catch (e) { A.toast('Select the line and copy it manually.', 'bad'); }
    };

    /* ---------- save ---------- */
    function bar(msg) {
      const el = $('savebar');
      el.innerHTML = `<span class="status ${msg ? 'ok' : A.dirty ? 'dirty' : ''}">${msg || (A.dirty ? '● Unsaved changes' : 'No changes yet')}</span><button class="a-btn" id="eSave" type="button" ${A.dirty ? '' : 'disabled'}>Save earnings settings</button>`;
      el.classList.toggle('on', tab === 'conn');
    }
    function problem() {
      const a = m.adsense, s = m.stay22, t = m.travelpayouts;
      if (a.client && !RE.client.test(a.client)) return ['adsense.client', 'The AdSense publisher ID should look like ca-pub-1234567890123456.'];
      if (a.footer && !RE.slot.test(a.footer)) return ['adsense.footer', 'Ad unit numbers are digits only.'];
      if (a.inPost && !RE.slot.test(a.inPost)) return ['adsense.inPost', 'Ad unit numbers are digits only.'];
      if (s.aid && !RE.aid.test(s.aid)) return ['stay22.aid', 'The Stay22 ID can only use letters, numbers, - and _.'];
      if (s.lma && !RE.lma.test(s.lma)) return ['stay22.lma', 'The Stay22 script ID can only use letters, numbers, - and _.'];
      if (t.script && !RE.script.test(t.script)) return ['travelpayouts.script', 'The script link must start with https:// and have no spaces.'];
      if (t.marker && !RE.marker.test(t.marker)) return ['travelpayouts.marker', 'The Travelpayouts ID is a number.'];
      return null;
    }
    $('savebar').onclick = async (e) => {
      if (e.target.id !== 'eSave') return;
      const bad = problem();
      if (bad) { A.toast(bad[1], 'bad'); const el = root.querySelector(`[data-path="${bad[0]}"]`); if (el) el.focus(); return; }
      e.target.disabled = true;
      try {
        const res = await A.withWrite('save your earnings settings', async () => {
          const out = { ...saved, money: JSON.parse(JSON.stringify(m)) };
          await CMS.saveSettings(out);
          return out;
        });
        if (res.cancelled) { bar(); return; }
        Object.keys(saved).forEach((k) => delete saved[k]); Object.assign(saved, res.value);
        try { localStorage.setItem('tg_site_content', JSON.stringify(res.value)); } catch (x) { /* ignore */ }
        touched = false; A.dirty = false;
        bar(`✓ Saved ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
        A.toast('Earnings settings saved', 'ok');
      } catch (ex) { A.toast(ex.message, 'bad'); bar(); }
    };
    if (tab === 'conn') showTab('conn'); else bar();
    return function cleanup() { $('savebar').onclick = null; void touched; };
  };

  /* =====================================================================
     Categories: rename or merge across every post
     ===================================================================== */
  A.views.categories = async function (arg, root) {
    await A.loadPosts();
    const draw = () => {
      const counts = {};
      A.posts.forEach((p) => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
      const names = Object.keys(counts).sort();
      root.innerHTML = `<div class="a-view"><div class="a-head"><div><h1 class="a-h1">Categories</h1><p class="a-lead">The groups your posts sit in. Rename one and every post in it updates. Give it the same name as another to merge them.</p></div></div>
        <div class="a-card">${names.length ? `<ul class="a-list">${names.map((n) => `<li data-cat="${esc(n)}"><div class="grow"><div class="t">${esc(n)}</div><div class="m">${counts[n]} ${counts[n] === 1 ? 'post' : 'posts'}</div></div><button class="a-btn ghost sm" data-rename>Rename</button></li>`).join('')}</ul>` : '<div class="a-empty">No categories yet — they appear when you write your first post.</div>'}</div></div>`;
    };
    draw();
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-rename]');
      if (!btn) return;
      const li = btn.closest('li'), from = li.dataset.cat;
      li.innerHTML = `<div class="grow"><input class="a-input" maxlength="30" value="${esc(from)}" aria-label="New name"></div><button class="a-btn sm" data-save>Save</button><button class="a-btn ghost sm" data-cancel>Cancel</button>`;
      const input = li.querySelector('input'); input.focus(); input.select();
      li.querySelector('[data-cancel]').onclick = draw;
      const go = async () => {
        const to = input.value.trim();
        if (!to || to === from) { draw(); return; }
        try {
          const res = await A.withWrite(`rename “${from}” to “${to}”`, () => CMS.renameCategory(from, to));
          if (res.cancelled) return;
          A.toast('Category renamed', 'ok');
          await A.loadPosts(); draw();
        } catch (ex) { A.toast(ex.message, 'bad'); }
      };
      li.querySelector('[data-save]').onclick = go;
      input.onkeydown = (ev) => { if (ev.key === 'Enter') go(); if (ev.key === 'Escape') draw(); };
    });
  };
})(window);
