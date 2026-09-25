#!/usr/bin/env python3
"""Regenerates sitemap.xml with every published post, so Google can find them.
Run from the project folder after publishing new posts:   python3 tools/build-sitemap.py
Then publish (commit + push) the updated sitemap.xml. Uses only the public anon key."""
import json, re, urllib.request, datetime, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
cfg = (root / 'js' / 'config.js').read_text()
url = re.search(r"supabaseUrl:\s*'([^']+)'", cfg).group(1)
key = re.search(r"supabaseKey:\s*'([^']+)'", cfg).group(1)
SITE = 'https://tearrigrundy.com'

req = urllib.request.Request(
    f"{url}/rest/v1/posts?select=slug,published_at&order=published_at.desc",
    headers={'apikey': key, 'Authorization': f'Bearer {key}'})
posts = json.load(urllib.request.urlopen(req, timeout=20))  # row-level security only returns live posts

def day(s): return (s or datetime.date.today().isoformat())[:10]
# No lastmod on the fixed pages, so the file only changes when the posts do.
urls = [(f'{SITE}/', None, '1.0'), (f'{SITE}/blog/', None, '0.9'), (f'{SITE}/about/', None, '0.6')]
urls += [(f"{SITE}/post/?id={p['slug']}", day(p['published_at']), '0.8') for p in posts]

out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, mod, pri in urls:
    lastmod = f'<lastmod>{mod}</lastmod>' if mod else ''
    out.append(f'  <url><loc>{loc.replace("&", "&amp;")}</loc>{lastmod}<priority>{pri}</priority></url>')
out.append('</urlset>')
(root / 'sitemap.xml').write_text('\n'.join(out) + '\n')
print(f'sitemap.xml written with {len(urls)} URLs ({len(posts)} posts)')
