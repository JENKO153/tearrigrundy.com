// Earnings feed for the admin dashboard (Supabase Edge Function, Deno).
//
// The API tokens live ONLY here, as Supabase secrets, never in the website code:
//   supabase secrets set TRAVELPAYOUTS_TOKEN=...      (Travelpayouts -> Profile -> API token)
//   supabase secrets set STAY22_API_KEY=...           (Stay22 Hub -> Settings -> Hub Data Reporting API)
//   supabase secrets set TRAVELPAYOUTS_CAMPAIGN_IDS=100,84   (optional: only these programme IDs)
// Deploy with:   supabase functions deploy earnings
//
// Only a signed-in admin (public.admins, and a 2-step code when that is required) gets any data.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ALLOWED = ['https://tearrigrundy.com', 'https://www.tearrigrundy.com', 'http://localhost:8123', 'http://localhost:8150'];

type Bucket = { confirmed: number; pending: number; count: number; statuses?: Record<string, number> };
type Feed = { configured: boolean; ok: boolean; error?: string; currency?: string; months: Record<string, Bucket> };

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

async function adminError(auth: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/admin_status`, {
    method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (r.status === 404) return 'Run supabase/02-security.sql first: the earnings feed only opens for people on the admins list.';
  if (!r.ok) return 'Please sign in again.';
  const st = await r.json();
  if (!st?.is_admin) return 'This account is not on the admins list.';
  if (st.require_mfa && st.aal !== 'aal2') return 'Enter your two-step code to see earnings.';
  return null;
}

const bucket = (m: Record<string, Bucket>, month: string) => (m[month] ||= { confirmed: 0, pending: 0, count: 0 });
const monthOf = (d: string) => String(d).slice(0, 7);

/* ------------------------------ Travelpayouts ------------------------------ */
async function travelpayouts(start: string): Promise<Feed> {
  const token = Deno.env.get('TRAVELPAYOUTS_TOKEN');
  const feed: Feed = { configured: !!token, ok: false, months: {} };
  if (!token) return feed;
  const base = 'https://api.travelpayouts.com/statistics/v1';
  const headers = { 'X-Access-Token': token, 'Content-Type': 'application/json' };
  try {
    // Ask Travelpayouts which fields exist, so a renamed field can't silently break this.
    const fl = await fetch(`${base}/get_fields_list`, { headers });
    if (!fl.ok) throw new Error(`Travelpayouts refused the token (${fl.status}). Check TRAVELPAYOUTS_TOKEN.`);
    const names = new Set(((await fl.json()).fields || []).map((f: { name: string }) => f.name));
    const paidField = ['paid_profit_usd', 'paid_profit_aud', 'paid_profit_eur'].find((n) => names.has(n));
    if (!paidField) throw new Error('Travelpayouts did not list a paid-profit field for this account.');
    const pendingField = ['profit_usd', 'profit_aud', 'profit_eur'].find((n) => names.has(n));
    const fields = ['action_id', 'date', 'state', paidField, ...(pendingField ? [pendingField] : [])];

    const ids = (Deno.env.get('TRAVELPAYOUTS_CAMPAIGN_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const runs: (number | null)[] = ids.length ? ids.map(Number) : [null];
    let currency = '';
    for (const campaign of runs) {
      const filters: unknown[] = [{ field: 'type', op: 'eq', value: 'action' }, { field: 'date', op: 'ge', value: start }];
      if (campaign) filters.push({ field: 'campaign_id', op: 'eq', value: campaign });
      const r = await fetch(`${base}/execute_query`, {
        method: 'POST', headers,
        body: JSON.stringify({ fields, filters, sort: [{ field: 'date', order: 'asc' }], offset: 0, limit: 10000 }),
      });
      if (!r.ok) throw new Error(`Travelpayouts said: ${(await r.text()).slice(0, 300)}`);
      for (const row of (await r.json()).results || []) {
        const paidKey = Object.keys(row).find((k) => k.startsWith('paid_profit_')) || paidField;
        const pendKey = Object.keys(row).find((k) => /^profit_(usd|aud|eur)$/.test(k));
        currency = (paidKey.split('_').pop() || '').toUpperCase() || currency;
        const b = bucket(feed.months, monthOf(row.date));
        const state = String(row.state || '').toLowerCase();
        if (state === 'paid') { b.confirmed += Number(row[paidKey]) || 0; b.count++; }
        else if (state === 'processing') { b.pending += Number(row[pendKey || paidKey]) || 0; b.count++; }
      }
    }
    feed.currency = currency || 'USD';
    feed.ok = true;
  } catch (e) { feed.error = (e as Error).message; }
  return feed;
}

/* ---------------------------------- Stay22 --------------------------------- */
async function stay22(start: string, end: string): Promise<Feed> {
  const key = Deno.env.get('STAY22_API_KEY');
  const feed: Feed = { configured: !!key, ok: false, months: {} };
  if (!key) return feed;
  try {
    let currency = '';
    for (let page = 0; page < 20; page++) {
      const u = `https://api.stay22.com/v1/reporting/transactions?format=json&dateFilter=bookedDate&startDate=${start}&endDate=${end}&limit=500&page=${page}`;
      const r = await fetch(u, { headers: { 'X-API-KEY': key } });
      if (r.status === 401) throw new Error('Stay22 refused the key. Generate a new one in the Stay22 Hub and update STAY22_API_KEY. (A new key only becomes active after its first successful use.)');
      if (!r.ok) throw new Error(`Stay22 said: ${(await r.text()).slice(0, 300)}`);
      const body = await r.json();
      const rows: Record<string, unknown>[] = body.data || [];
      for (const row of rows) {
        const status = String(row.bookingStatus || 'unknown').toLowerCase();
        currency = String(row.currency || currency || 'USD');
        const b = bucket(feed.months, monthOf(String(row.bookedDate || row.startDate || start)));
        (b.statuses ||= {})[status] = (b.statuses[status] || 0) + 1;
        if (/cancel|refund|void|no.?show/.test(status)) continue;
        const amount = Number(row.commission) || 0;
        if (/confirm|complete|paid|approved|checked|payable/.test(status)) b.confirmed += amount; else b.pending += amount;
        b.count++;
      }
      if (rows.length < 500) break;
    }
    feed.currency = currency || 'USD';
    feed.ok = true;
  } catch (e) { feed.error = (e as Error).message; }
  return feed;
}

/* ------------------------------ Exchange rates ------------------------------ */
// Free European Central Bank rates via frankfurter.dev (no key). For each currency we return the
// average daily rate for every month, so each month is converted at a fair rate for that month.
async function fxRates(currencies: string[], start: string, end: string): Promise<Record<string, Record<string, number>> | null> {
  const out: Record<string, Record<string, number>> = {};
  try {
    for (const cur of currencies) {
      if (cur === 'AUD') continue;
      const r = await fetch(`https://api.frankfurter.dev/v1/${start}..${end}?from=${cur}&to=AUD`);
      if (!r.ok) return null;
      const rates: Record<string, { AUD: number }> = (await r.json()).rates || {};
      const sums: Record<string, { t: number; n: number }> = {};
      let latest = 0;
      for (const [day, v] of Object.entries(rates).sort()) {
        const m = day.slice(0, 7);
        (sums[m] ||= { t: 0, n: 0 }).t += v.AUD; sums[m].n++;
        latest = v.AUD;
      }
      out[cur] = { latest };
      for (const [m, x] of Object.entries(sums)) out[cur][m] = x.t / x.n;
    }
    return out;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, origin);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Please sign in again.' }, 401, origin);
  const denied = await adminError(auth);
  if (denied) return json({ error: denied }, 403, origin);

  let months = 6;
  let extra: string[] = [];
  try {
    const body = await req.json();
    months = Math.min(12, Math.max(1, Number(body.months) || 6));
    extra = (Array.isArray(body.currencies) ? body.currencies : []).map(String).filter((c: string) => /^[A-Z]{3}$/.test(c)).slice(0, 5);
  } catch { /* defaults */ }
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const start = first.toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);

  const [tp, s22] = await Promise.all([travelpayouts(start), stay22(start, end)]);
  const wanted = [...new Set([tp.currency, s22.currency, ...extra].filter((c): c is string => !!c && c !== 'AUD'))];
  const fx = wanted.length ? await fxRates(wanted, start, end) : {};
  return json({ start, end, updated: now.toISOString(), fx, fxSource: 'European Central Bank via frankfurter.dev', platforms: { travelpayouts: tp, stay22: s22 } }, 200, origin);
});
