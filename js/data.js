/*
 * Public data layer: what any visitor can read, straight from Supabase.
 *
 * This client never logs in and never stores a session, so the public pages show
 * exactly what a visitor sees (no drafts, nothing scheduled) even while the owner
 * is signed in to the admin in the same browser. Row-level security decides what
 * the anonymous key may read; nothing here can write. The admin has its own
 * client in cms.js.
 */
(function (window) {
  const cfg = window.TG_CONFIG;
  const configured = !String(cfg.supabaseUrl).startsWith('YOUR_') && !String(cfg.supabaseKey).startsWith('YOUR_');

  const client = configured && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    : null;

  function rowToPost(row) {
    return {
      id: row.slug,
      title: row.title,
      category: row.category,
      excerpt: row.excerpt,
      image: row.image_url,
      date: row.published_at,
      author: row.author,
      content: row.content
    };
  }

  async function getPosts() {
    if (!client) return [];
    const { data, error } = await client
      .from('posts')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) {
      console.error('Could not load posts', error);
      return [];
    }
    return data.map(rowToPost);
  }

  async function getPostById(slug) {
    if (!client) return null;
    const { data, error } = await client
      .from('posts')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return rowToPost(data);
  }

  async function getCategories() {
    const posts = await getPosts();
    return Array.from(new Set(posts.map((p) => p.category))).sort();
  }

  // Editable wording/photos (Admin -> Homepage & About). Empty until the owner saves something.
  async function getSettings() {
    if (!client) return {};
    try {
      const { data, error } = await client.from('site_settings').select('data').eq('id', 1).maybeSingle();
      return error || !data ? {} : (data.data || {});
    } catch (e) {
      return {};
    }
  }

  window.BlogData = { getPosts, getPostById, getCategories, getSettings };
})(window);
