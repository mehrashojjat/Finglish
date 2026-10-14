#!/usr/bin/env node
'use strict';
/**
 * Static audit: can this project touch the network at all?   node tests/audit_offline.js
 * Rule 1  engine/ has no network API, no URL, no non-relative require.
 * Rule 2  the website (index.html + assets/) has NO network API anywhere (fetch, XHR, WebSocket, EventSource, sendBeacon, importScripts):
 *         it is a purely local page, so nothing may use one.
 * Rule 3  nothing external is *loaded* by the page: no src/href/@import/url() pointing at http(s):// or //. (Plain links <a href> the user
 *         clicks — the developer's site, the data sources, the download file — are not loading anything and are listed separately.
 *         Neither are <link rel="canonical|alternate"> — hints for search engines that a browser never fetches — nor the <base> of 404.html
 *         when it is the site's own address, package.json's "homepage": that is the site itself, not another origin.)
 * Rule 4  the page's own scripts contain no web address at all, so nothing could be requested even indirectly.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c && !x ? '' : (x ? '   ' + (typeof x === 'string' ? x : JSON.stringify(x)) : ''))); if (!c) failed++; };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = f => path.relative(ROOT, f);
const NET = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/;
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');   // drop comments (keeps URLs in strings)

// Rule 1
const engineFiles = walk(path.join(ROOT, 'engine/src')).filter(f => f.endsWith('.js'));
const e1 = engineFiles.flatMap(f => strip(fs.readFileSync(f, 'utf8')).split('\n').map((l, i) => [rel(f), i + 1, l]).filter(([, , l]) => NET.test(l) || /https?:\/\/|require\((?!['"]\.\/)/.test(l)));
ok(e1.length === 0, `engine/src (${engineFiles.length} files): no network API, no URL, only relative requires`, e1);

// Rule 2
const siteFiles = [path.join(ROOT, 'index.html'), path.join(ROOT, 'en/index.html'), path.join(ROOT, 'privacy/index.html'), path.join(ROOT, 'en/privacy/index.html'), path.join(ROOT, '404.html'), ...walk(path.join(ROOT, 'assets'))];
const pageJs = siteFiles.filter(f => /\.(js|html)$/.test(f) && !/assets\/data\//.test(f) && !/assets\/vendor\//.test(f));
const hits = pageJs.flatMap(f => strip(fs.readFileSync(f, 'utf8')).split('\n').map((l, i) => [rel(f), i + 1, l.trim().slice(0, 90)]).filter(([, , l]) => NET.test(l)));
ok(hits.length === 0, `website (${pageJs.length} js/html files): no network API anywhere`, hits);
const vendor = fs.readFileSync(path.join(ROOT, 'assets/vendor/farsi-ime-engine.js'), 'utf8');
ok(!NET.test(strip(vendor)), 'assets/vendor/farsi-ime-engine.js (the engine as shipped to the page): no network API');

// Rule 3
const loaded = [], links = [];
const HOME = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).homepage || null;
const notLoaded = (name, attrs, url) => name === 'a' || (name === 'link' && /\brel\s*=\s*["'](?:canonical|alternate)["']/i.test(attrs)) || (name === 'base' && !!HOME && url === HOME);
for (const f of siteFiles.filter(f => /\.(html|css)$/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  for (const tag of t.matchAll(/<(\w+)\b([^>]*)>/g)) {
    for (const m of tag[2].matchAll(/\b(?:src|href|data|poster|srcset)\s*=\s*["']\s*((?:https?:)?\/\/[^"']+)["']/gi)) (notLoaded(tag[1].toLowerCase(), tag[2], m[1]) ? links : loaded).push([rel(f), tag[1], m[1]]);
  }
  for (const m of t.matchAll(/(?:@import\s+(?:url\()?|url\()\s*["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi)) loaded.push([rel(f), 'css', m[1]]);
}
ok(loaded.length === 0, 'the page loads nothing external (no src/href/@import/url() to http(s):// or //; fonts are bundled)', loaded);
console.log(`     (${links.length} plain links the user can click, loading nothing: ${Array.from(new Set(links.map(l => new URL(l[2]).hostname))).join(', ')})`);

// Rule 4
const withUrl = pageJs.filter(f => f.endsWith('.js')).flatMap(f => strip(fs.readFileSync(f, 'utf8')).split('\n').map((l, n) => [rel(f), n + 1, l.trim().slice(0, 90)]).filter(([, , l]) => /(https?:)?\/\/[a-z0-9-]+\.[a-z]{2,}/i.test(l)));
ok(withUrl.length === 0, 'the page\'s own scripts (assets/js/) contain no web address', withUrl);

console.log(failed ? `\n${failed} audit rule(s) FAILED` : '\nSTATIC AUDIT PASSED');
process.exit(failed ? 1 : 0);
