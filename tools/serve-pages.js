// Serves _site the way GitHub Pages does: only under the repository path, static files only.
// Run `node tools/build-pages.js` first, then `node tools/serve-pages.js` and open
// http://localhost:4000/unifiedtree-logistics/
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '_site');
const BASE = (process.env.PAGES_BASE != null ? process.env.PAGES_BASE : '/unifiedtree-logistics').replace(/\/$/, '');
const PORT = Number(process.env.PORT) || 4000;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(fs.existsSync(path.join(ROOT, '404.html')) ? fs.readFileSync(path.join(ROOT, '404.html')) : 'Not found'); };
  if (!rel.startsWith(BASE + '/') && rel !== BASE) return notFound();
  rel = rel.slice(BASE.length) || '/';
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return notFound();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) return notFound();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`GitHub Pages preview: http://localhost:${PORT}${BASE}/`));
