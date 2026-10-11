#!/usr/bin/env node
'use strict';
/**
 * Tiny dependency-free static server for the website. The website IS the repository root (index.html + assets/ + downloads/),
 * exactly as a static host (GitHub Pages, Netlify, …) publishes it.
 *
 *   npm start                      rebuild the web data, serve the site on http://localhost:8080 and open the browser
 *   node tools/serve.js [--port 8080] [--no-open] [--dir .]
 *
 * Only the public parts are served — index.html, en/, the SEO files (robots.txt, sitemap.xml, llms.txt, 404.html, icons), assets/ and downloads/ —
 * never .git, node_modules, tests, source data…
 * Binds to 127.0.0.1 only (nothing else on your network can reach it). If the port is busy it tries the next ones.
 * Files are sent with `Cache-Control: no-store`, so a reload always shows your latest edit. Files in downloads/ are sent as
 * attachments, the way a real host makes the browser download them instead of showing them.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const root = path.resolve(__dirname, '..', opt('--dir', '.'));
const PUBLIC = /^\/(index\.html|en\/index\.html|404\.html|robots\.txt|sitemap\.xml|llms\.txt|favicon\.ico|apple-touch-icon\.png|assets\/.+|downloads\/.+)$/;       // everything else in the repository stays private
const startPort = parseInt(opt('--port', process.env.PORT || '8080'), 10);
const noOpen = args.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json',
  '.dmg': 'application/octet-stream', '.xml': 'application/xml; charset=utf-8',
};

function handler(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (pathname === '/en') { res.writeHead(301, { Location: '/en/' }); return res.end(); }       // like the static hosts do
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (!PUBLIC.test(pathname) || /(^|\/)\./.test(pathname)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 not found: ' + pathname); }
  const file = path.normalize(path.join(root, pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('forbidden'); }   // no ../ escapes
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 not found: ' + pathname); }
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
    };
    if (pathname.startsWith('/downloads/')) headers['Content-Disposition'] = 'attachment';       // no file name here: the page's `download="…"` attribute names the saved file
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (e) { /* user can click the link */ }
}

function listen(port, attemptsLeft) {
  const server = http.createServer(handler);
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) return listen(port + 1, attemptsLeft - 1);
    console.error('Could not start the server:', err.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log(`\n  Finglish → فارسی is running:  ${url}\n  serving ${root}\n  stop with Ctrl-C\n`);
    if (!noOpen) openBrowser(url);
  });
}

if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('No index.html in ' + root); process.exit(1); }
listen(startPort, 20);
