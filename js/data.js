/*
 * Shared post storage + auth for the blog, backed by Supabase.
 * The anon key below is safe to expose client-side — row-level security
 * policies on the `posts` table (and storage bucket) are what actually
 * gate writes to logged-in users. Loaded before every page-specific script.
 */
(function (window) {
  const SUPABASE_URL = 'https://cbadidkhyepefebjnvsl.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYWRpZGtoeWVwZWZlYmpudnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMDE2NjAsImV4cCI6MjEwMjg3NzY2MH0.P_qjeExCaflk4hhP7JT-8PnRCD7HJU8bKvXRFV2nAdw';

  // Session is kept in sessionStorage (not the default localStorage) so
  // logging in only lasts for that browser tab/session — closing the
  // browser logs her out automatically instead of staying signed in
  // indefinitely on that device.
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: window.sessionStorage }
  });

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

  function slugify(title) {
    const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${base}-${Date.now().toString(36)}`;
  }

  async function getPosts() {
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

  async function addPost(post) {
    const row = {
      slug: slugify(post.title || 'post'),
      title: post.title,
      category: post.category,
      excerpt: post.excerpt,
      image_url: post.image,
      content: post.content,
      author: post.author || 'Tearri',
      published_at: post.publishAt || new Date().toISOString()
    };
    const { data, error } = await client.from('posts').insert(row).select().single();
    if (error) throw error;
    return rowToPost(data);
  }

  async function deletePost(slug) {
    const { error } = await client.from('posts').delete().eq('slug', slug);
    if (error) throw error;
  }

  // Shrinks an uploaded image to a max dimension and returns it as a <canvas>.
  function scaleImageToCanvas(file, maxDim = 1600) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read that image file.'));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function resizeImage(file, maxDim = 1600, quality = 0.82) {
    const canvas = await scaleImageToCanvas(file, maxDim);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  // Used for the draft-autosave preview, since a resized data URL (unlike a
  // File/Blob) can actually survive being written to localStorage.
  async function resizeImageToDataUrl(file, maxDim = 1600, quality = 0.82) {
    const canvas = await scaleImageToCanvas(file, maxDim);
    return canvas.toDataURL('image/jpeg', quality);
  }

  function dataUrlToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadBlob(blob) {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await client.storage.from('post-images').upload(path, blob, {
      contentType: 'image/jpeg'
    });
    if (error) throw error;
    const { data } = client.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadImage(file) {
    const blob = await resizeImage(file);
    return uploadBlob(blob);
  }

  // For publishing a restored draft whose cover photo only survived as a
  // data URL (the original File object can't be persisted to localStorage).
  async function uploadImageFromDataUrl(dataUrl) {
    return uploadBlob(dataUrlToBlob(dataUrl));
  }

  async function login(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function logout() {
    await client.auth.signOut();
  }

  async function getSession() {
    const { data } = await client.auth.getSession();
    return data.session;
  }

  window.BlogData = {
    getPosts,
    getPostById,
    getCategories,
    addPost,
    deletePost,
    uploadImage,
    uploadImageFromDataUrl,
    resizeImageToDataUrl
  };

  window.BlogAuth = {
    login,
    logout,
    getSession
  };
})(window);
