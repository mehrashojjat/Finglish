'use strict';
/**
 * The repository IS the website: these checks keep it publishable as it stands.   node --test tests/site.test.js
 *   - index.html sits at the root and every local file it uses exists (nothing breaks on a static host)
 *   - the download link points at a real disk image in downloads/, and the version shown matches the Mac build
 *   - LICENSE is the unmodified official AGPL-3.0 text, and the footer and package.json say so
 *   - nothing of the old reverse-engineering work is left in the repository
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');

const PAGES = { fa: 'index.html', en: 'en/index.html' };
const enHtml = read(PAGES.en);

test('the pages are at the repository root and everything they load exists', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'app')), 'the old app/ folder must be gone: the root is the website');
  for (const file of [...Object.values(PAGES), 'privacy/index.html', 'en/privacy/index.html', '404.html']) {
    const dir = path.dirname(file), text = read(file);
    const refs = [...text.matchAll(/\b(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:|\/\/)/.test(u));
    assert.ok(refs.length >= 5, `expected ${file} to reference its css, scripts and logo: ${refs.length}`);
    for (const u of refs) {
      assert.ok(!u.startsWith('/'), `"${u}" in ${file} must be relative (so it works at any URL, also under /repo-name/)`);
      const target = path.normalize(path.join(dir, u));
      assert.ok(!target.startsWith('..'), `${file}: "${u}" leaves the site`);
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${file} refers to ${u}, which does not exist`);
    }
  }
  const css = 'assets/css/style.css';
  for (const m of read(css).matchAll(/url\("?([^")]+)"?\)/g)) assert.ok(fs.existsSync(path.join(ROOT, path.dirname(css), m[1])), `${css} refers to ${m[1]}, which does not exist`);
});

test('the download button serves the Mac disk image from this repository', () => {
  const link = html.match(/<a\b[^>]*\bid="dl-mac"[^>]*>/);
  assert.ok(link, 'the macOS download link (#dl-mac) is missing');
  const href = link[0].match(/\bhref="([^"]+)"/)[1];
  assert.match(href, /^downloads\/[^/]+\.dmg$/, 'a relative link into downloads/');
  const enLink = enHtml.match(/<a\b[^>]*\bid="dl-mac"[^>]*>/)[0];
  assert.ok(enLink.includes('href="../' + href + '"') && /\bdownload="Finglish\.dmg"/.test(enLink), 'the English page links to the same file');
  assert.ok(/\bdownload(=|\s|>)/.test(link[0]), 'the link must carry the `download` attribute: the browser then saves the file instead of navigating to it');
  const file = path.join(ROOT, href);
  assert.ok(fs.existsSync(file), href + ' does not exist: run `npm run mac:release`');
  const fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size; const tail = Buffer.alloc(512);
  fs.readSync(fd, tail, 0, 512, size - 512); fs.closeSync(fd);
  assert.strictEqual(tail.subarray(0, 4).toString('latin1'), 'koly', 'downloads/*.dmg is not a disk image (no "koly" trailer)');
  assert.ok(size > 1e6 && size < 90e6, `unexpected image size ${size} (GitHub refuses files over 100 MB)`);
  const version = read('mac/build.sh').match(/^VERSION="([^"]+)"/m)[1];
  assert.strictEqual(html.match(/id="dl-version">([^<]+)</)[1], version, 'the version shown in the dialog must be the Mac build\'s version');
  assert.ok(link[0].includes('download="Finglish.dmg"'), 'the file is saved as Finglish.dmg');
  assert.strictEqual(JSON.parse(read('package.json')).version, version, 'package.json version must match the Mac build');
  assert.ok(/Windows[\s\S]{0,400}به‌زودی/.test(html), 'Windows says «به‌زودی» (coming soon)');
});

test('LICENSE is the official, unmodified GNU AGPL-3.0 text', () => {
  const text = fs.readFileSync(path.join(ROOT, 'LICENSE'));
  assert.match(text.toString('utf8'), /^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  assert.strictEqual(crypto.createHash('sha256').update(text).digest('hex'), '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0',
    'LICENSE differs from https://www.gnu.org/licenses/agpl-3.0.txt — restore the official text, do not edit it');
  assert.strictEqual(JSON.parse(read('package.json')).license, 'AGPL-3.0-only');
});

test('the footer carries the copyright and the licence, on the website and in the Mac app', () => {
  assert.match(html, /<footer[^>]*>[\s\S]*©\s*۲۰۲۶[\s\S]*AGPL-3\.0[\s\S]*<\/footer>/);
  assert.ok(/© ۲۰۲۶ مهراس حجت · مجوز/.test(read('mac/Sources/Settings/AboutInfo.swift')) && /AGPL-3\.0/.test(read('mac/Sources/Settings/AboutInfo.swift')), 'the Mac app footer text is missing');
  assert.ok(/Link\(AboutInfo\.licenseName/.test(read('mac/Sources/Settings/SettingsView.swift')), 'the Mac settings window must show the footer');
  assert.ok(/LICENSE/.test(read('mac/build.sh')), 'the Mac build must put LICENSE inside the app');
  assert.ok(!/قلم/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'the word for a typeface is «فونت», not «قلم»');
});

test('the bilingual privacy policy is linked from both footers and included in the sitemap', () => {
  const fa = read('privacy/index.html'), en = read('en/privacy/index.html');
  assert.ok(/<html lang="fa" dir="rtl">/.test(fa) && /حریم خصوصی فینگلیش/.test(fa));
  assert.ok(/<html lang="en" dir="ltr">/.test(en) && /Finglish Privacy Policy/.test(en));
  assert.ok(/href="privacy\/"[^>]*>حریم خصوصی/.test(html));
  assert.ok(/href="privacy\/"[^>]*>Privacy/.test(enHtml));
  assert.ok(fa.includes('https://finglish.mehrashojjat.com/privacy/') && fa.includes('https://finglish.mehrashojjat.com/en/privacy/'));
  assert.ok(en.includes('https://finglish.mehrashojjat.com/privacy/') && en.includes('https://finglish.mehrashojjat.com/en/privacy/'));
  assert.match(fa, /localStorage/); assert.match(en, /local storage/);
  assert.match(fa, /Cloudflare Pages/); assert.match(en, /Cloudflare Pages/);
  const sitemap = read('sitemap.xml');
  assert.ok(sitemap.includes('<loc>https://finglish.mehrashojjat.com/privacy/</loc>'));
  assert.ok(sitemap.includes('<loc>https://finglish.mehrashojjat.com/en/privacy/</loc>'));
});

test('the website and the Mac app link to the source code (AGPL) and the Mac app links to the website', () => {
  const GH = 'https://github.com/mehrashojjat/Finglish', SITE = 'https://finglish.mehrashojjat.com';
  for (const file of Object.values(PAGES)) assert.ok(read(file).includes(`href="${GH}"`), `${file} links to the source code on GitHub`);
  const pkg = JSON.parse(read('package.json'));
  assert.ok(/mehrashojjat\/Finglish/.test(pkg.repository.url) && /mehrashojjat\/Finglish\/issues/.test(pkg.bugs.url), 'package.json names the repository');
  assert.strictEqual(pkg.homepage, SITE + '/');
  const about = read('mac/Sources/Settings/AboutInfo.swift'), view = read('mac/Sources/Settings/SettingsView.swift');
  assert.ok(about.includes(`"${GH}"`) && about.includes(`"${SITE}"`), 'the Mac app knows the source address and the website address');
  assert.ok(/Link\([^\n]*AboutInfo\.source\)/.test(view) && /Link\([^\n]*AboutInfo\.site\)/.test(view), 'the Mac settings window links to both');
  for (const f of ['mac/Resources/Settings-Info.plist', 'mac/Resources/IME-Info.plist']) assert.ok(read(f).includes(GH), `${f}: the copyright line names the source`);
  assert.ok(/CC BY-SA 4\.0/.test(about) && /AboutInfo\.dataCredit/.test(view), 'the Mac app credits the CC BY-SA data its word lists are built from');
});

test('the old reverse-engineering work is gone', () => {
  for (const d of ['reference', 'research', 'Screenshots']) assert.ok(!fs.existsSync(path.join(ROOT, d)), d + '/ must not exist');
  assert.ok(!fs.existsSync(path.join(ROOT, 'docs/REVERSE_ENGINEERING.md')));
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => f && fs.existsSync(path.join(ROOT, f)));
  const text = f => !/\.(png|ttf|woff2|dmg|icns|tiff|jsonl)$/.test(f) && !/^(assets\/data|data\/build|engine\/dist)\//.test(f);
  const leaks = files.filter(f => f !== 'tests/site.test.js' && text(f) && /inputtools\.google|gstatic\.com|REVERSE_ENGINEERING|google-copy|research\/probes/i.test(read(f)));
  assert.deepStrictEqual(leaks, [], 'files still pointing at the removed reverse-engineering material');
});

// ------------------------------------------------------------------ search engines and AI assistants
const flat = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const textOf = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ldBlocks = h => [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
const meta = (h, name) => (h.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`)) || [])[1];

test('each page has the head a search engine looks for, in its own language', () => {
  for (const [lang, file] of Object.entries(PAGES)) {
    const h = read(file), title = h.match(/<title>(.*?)<\/title>/)[1], desc = meta(h, 'description');
    assert.ok(h.startsWith('<!doctype html>') && h.includes(`<html lang="${lang}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">`), `${file}: <html lang dir>`);
    assert.ok(title.length >= 25 && title.length <= 70, `${file}: title length ${title.length}`);
    assert.ok(desc.length >= 90 && desc.length <= 175, `${file}: description length ${desc.length}`);
    assert.strictEqual((h.match(/<h1[\s>]/g) || []).length, 1, `${file}: exactly one <h1>`);
    assert.ok(/<meta name="viewport"/.test(h) && /<meta name="robots" content="index, follow/.test(h) && /<meta name="theme-color"/.test(h));
    for (const k of ['og:title', 'og:description', 'og:type', 'og:locale', 'og:site_name', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description'])
      assert.ok(meta(h, k), `${file}: <meta ${k}>`);
    assert.strictEqual(meta(h, 'og:title'), title); assert.strictEqual(meta(h, 'og:description'), desc);
    assert.ok(/<link rel="icon" href="(\.\.\/)?favicon\.ico"/.test(h) && /<link rel="apple-touch-icon"/.test(h));
    assert.ok(/<!-- seo:start -->[\s\S]*<!-- seo:end -->/.test(h), `${file}: the seo block markers (tools/seo.js) are missing`);
    for (const m of h.matchAll(/<script src="([^"]+)"([^>]*)>/g)) assert.ok(/\bdefer\b/.test(m[2]), `${file}: ${m[1]} should be deferred (the text must paint before the 11 MB of word lists arrive)`);
  }
  const fa = read(PAGES.fa), fatext = textOf(fa);
  for (const w of ['فینگلیش', 'پینگلیش', 'تایپ فارسی', 'حروف انگلیسی', 'رایگان']) assert.ok(fa.match(/<title>(.*?)<\/title>/)[1].includes(w) || meta(fa, 'description').includes(w) || fatext.includes(w), 'Persian page lacks the search term ' + w);
  const en = textOf(enHtml);
  for (const w of ['Finglish', 'Pinglish', 'Persian', 'English letters', 'free', 'offline']) assert.ok(en.includes(w), 'English page lacks the search term ' + w);
  assert.ok(/<h1>[\s\S]*Finglish[\s\S]*<\/h1>/.test(fa) && /<h1>[\s\S]*Finglish[\s\S]*<\/h1>/.test(enHtml));
});

test('the two language versions point at each other and have the same controls', () => {
  assert.ok(/<a class="lang-switch" href="en\/" hreflang="en"/.test(read(PAGES.fa)) && /<a class="lang-switch" href="\.\.\/" hreflang="fa"/.test(enHtml));
  const ids = h => [...h.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).sort();
  const a = ids(read(PAGES.fa)), b = ids(enHtml);
  assert.deepStrictEqual(a.filter(x => !b.includes(x)), [], 'ids only on the Persian page (the scripts need the same ids on both)');
  assert.deepStrictEqual(b.filter(x => !a.includes(x)), [], 'ids only on the English page');
});

test('structured data: valid, honest, and the FAQ is exactly the visible FAQ', () => {
  const faqCounts = [];
  for (const [lang, file] of Object.entries(PAGES)) {
    const h = read(file), blocks = ldBlocks(h);
    const app = blocks.find(b => b['@type'] === 'WebApplication'), faq = blocks.find(b => b['@type'] === 'FAQPage');
    assert.ok(app && faq, `${file}: WebApplication and FAQPage`);
    assert.strictEqual(app.name, 'Finglish'); assert.strictEqual(app.offers.price, '0'); assert.strictEqual(app.isAccessibleForFree, true);
    assert.strictEqual(app.license, 'https://www.gnu.org/licenses/agpl-3.0.html'); assert.strictEqual(app.author.url, 'https://mehrashojjat.com');
    assert.ok(app.applicationCategory === 'UtilitiesApplication' && Array.isArray(app.featureList) && app.featureList.length >= 5);
    assert.ok(!('aggregateRating' in app) && !('review' in app), 'no invented ratings or reviews');
    const visible = [...h.matchAll(/<details class="q"><summary>(.*?)<\/summary><div class="a"><p>(.*?)<\/p><\/div><\/details>/gs)].map(m => [flat(m[1]), flat(m[2])]);
    assert.ok(visible.length >= 9, `${file}: ${visible.length} visible questions`);
    faqCounts.push(visible.length);
    assert.deepStrictEqual(faq.mainEntity.map(q => [q.name, q.acceptedAnswer.text]), visible, `${file}: FAQ structured data differs from the visible FAQ`);
    assert.strictEqual(faq.inLanguage, lang);
  }
  assert.strictEqual(faqCounts[0], faqCounts[1], `the Persian and English pages must answer the same questions (${faqCounts.join(' vs ')})`);
});

test('the example table and the accuracy figures on the page are true', () => {
  const { Engine } = require('../engine/src/engine');
  const eng = Engine.fromTSV(read('data/build/lexicon.tsv')); eng.setAliases(read('data/aliases.tsv'));
  const rows = [...read(PAGES.fa).matchAll(/<td><bdi dir="ltr"><code>([^<]+)<\/code><\/bdi><\/td><td lang="fa" dir="rtl">([^<]+)<\/td>/g)];
  assert.ok(rows.length >= 8, 'the examples table');
  for (const [, latin, persian] of rows) assert.strictEqual(eng.candidates(latin, { max: 1 })[0].text, persian, `example ${latin}`);
  assert.deepStrictEqual([...enHtml.matchAll(/<td><bdi dir="ltr"><code>([^<]+)<\/code><\/bdi><\/td><td lang="fa" dir="rtl">([^<]+)<\/td>/g)].map(m => m[1] + '=' + m[2]), rows.map(m => m[1] + '=' + m[2]), 'both pages show the same examples');
  const results = read('docs/RESULTS.md'), top1 = +results.match(/natural_2 held-out[^|]*\|\s*\d+\s*\|\s*([\d.]+)%/)[1], top5 = +results.match(/natural_2 held-out[^|]*\|\s*\d+\s*\|\s*[\d.]+%\s*\|\s*[\d.]+%\s*\|\s*([\d.]+)%/)[1];
  assert.ok(top1 >= 91.5 && top1 < 92.5 && top5 > 98, `the FAQ says about 92% / more than 98%; docs/RESULTS.md says ${top1}% / ${top5}% — update the FAQ`);
});

test('robots.txt, llms.txt, 404 page, icons and the address-dependent files', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*\nAllow: \//m); assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), 'robots.txt must not block the site');
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot']) assert.ok(robots.includes('User-agent: ' + bot), bot + ' is named');
  const llms = read('llms.txt');
  assert.ok(llms.startsWith('# Finglish') && /^> /m.test(llms) && /^## /m.test(llms) && llms.includes('transliterat'), 'llms.txt: title, summary, sections');
  assert.ok(/noindex/.test(read('404.html')));
  const png = f => { const b = fs.readFileSync(path.join(ROOT, f)); assert.strictEqual(b.subarray(1, 4).toString(), 'PNG', f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepStrictEqual(png('assets/img/og.png'), [1200, 630]); assert.deepStrictEqual(png('apple-touch-icon.png'), [180, 180]); assert.deepStrictEqual(png('assets/img/icon-512.png'), [512, 512]);
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico')); assert.strictEqual(ico.readUInt16LE(2), 1, 'favicon.ico is an icon'); assert.ok(ico.readUInt16LE(4) >= 2, 'several sizes');
  // the files that need the site's address are either all there (an address is set) or all absent — never half
  const home = JSON.parse(read('package.json')).homepage;
  for (const file of Object.values(PAGES)) {
    const h = read(file);
    assert.strictEqual(/<link rel="canonical"/.test(h), !!home, `${file}: canonical iff an address is set`);
    assert.strictEqual(/hreflang="x-default"/.test(h), !!home);
    assert.strictEqual(/property="og:image" content="/.test(h), !!home);
  }
  assert.strictEqual(fs.existsSync(path.join(ROOT, 'sitemap.xml')), !!home, 'sitemap.xml iff an address is set');
  assert.strictEqual(/^Sitemap: /m.test(robots), !!home);
  const r = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools/seo.js'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'node tools/seo.js --check: ' + r.stderr);
});
