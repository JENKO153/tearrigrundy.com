/*
 * Site configuration. Loaded first on every page that talks to the database.
 *
 * The publishable key below is safe to expose: row-level security in Supabase
 * (supabase/*.sql) decides what anyone can read or write, not this file.
 * NEVER put the secret / service_role key in the website.
 *
 * While the two Supabase values are placeholders ("YOUR_...") the admin runs in
 * DEMO MODE: sample posts, a browser-only login and no database connection.
 */
window.TG_CONFIG = Object.freeze({
  supabaseUrl: 'https://cbadidkhyepefebjnvsl.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYWRpZGtoeWVwZWZlYmpudnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMDE2NjAsImV4cCI6MjEwMjg3NzY2MH0.P_qjeExCaflk4hhP7JT-8PnRCD7HJU8bKvXRFV2nAdw',

  // Optional bot check on the admin login (recommended once live). Turn on Captcha in
  // Supabase (Authentication -> Attack Protection -> Turnstile), paste Cloudflare's SECRET
  // key there and the SITE key here. See SECURITY.md.
  captcha: { provider: 'turnstile', siteKey: '' },

  // The admin signs itself out after this many minutes without any activity.
  adminIdleMinutes: 5,
});
