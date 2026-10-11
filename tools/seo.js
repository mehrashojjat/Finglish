#!/usr/bin/env node
'use strict';
/**
 * Writes everything in the website that needs the site's ADDRESS, which is only known once it is published:
 * canonical and hreflang links, the share-preview (Open Graph / Twitter) URLs, the URLs inside the structured data, sitemap.xml,
 * the Sitemap line of robots.txt, the links in llms.txt and the <base> of 404.html.
 *
 *   node tools/seo.js https://example.org/          set the address (it is remembered as "homepage" in package.json)
 *   node tools/seo.js                               regenerate with the remembered address (or, if none, without any address)
 *   node tools/seo.js --check                       fail if the files on disk are not what this script would write (npm test runs it)
 *   node tools/seo.js --clear                       forget the address
 *
 * It also keeps the FAQ's structured data identical to the visible FAQ (the visible one is the source). Everything else that does NOT need the
 * address (titles, descriptions, headings, icons) is written in the pages themselves.
 * Without an address nothing is invented: the pages simply omit those tags, and sitemap.xml is not written.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, t) => fs.writeFileSync(path.join(ROOT, f), t);
const PKG = JSON.parse(read('package.json'));

const args = process.argv.slice(2);
const check = args.includes('--check'), clear = args.includes('--clear');
let base = args.find(a => /^https?:\/\//.test(a)) || (clear ? '' : PKG.homepage || '');
if (base && !base.endsWith('/')) base += '/';
if (base) new URL(base);                                       // throws on a malformed address
const today = new Date().toISOString().slice(0, 10);
const PAGES = [{ file: 'index.html', lang: 'fa', url: base }, { file: 'en/index.html', lang: 'en', url: base && base + 'en/' }];
const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended',
  'Applebot-Extended', 'CCBot', 'Meta-ExternalAgent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai'];
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const out = new Map();                                         // file -> text ('' = must not exist)

// ---- the pages
for (const p of PAGES) {
  let html = read(p.file);
  const title = html.match(/<title>(.*?)<\/title>/)[1], description = html.match(/<meta name="description" content="([^"]*)"/)[1];
  let block = '';
  if (base) {
    const og = base + 'assets/img/og.png';
    block = [
      `<link rel="canonical" href="${p.url}">`,
      `<link rel="alternate" hreflang="fa" href="${PAGES[0].url}">`,
      `<link rel="alternate" hreflang="en" href="${PAGES[1].url}">`,
      `<link rel="alternate" hreflang="x-default" href="${PAGES[0].url}">`,
      `<meta property="og:url" content="${p.url}">`,
      `<meta property="og:image" content="${og}">`,
      `<meta name="twitter:image" content="${og}">`,
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@graph': [
          { '@type': 'WebSite', '@id': base + '#website', url: base, name: 'Finglish', alternateName: ['فینگلیش', 'Finglish → فارسی'], inLanguage: ['fa', 'en'] },
          { '@type': 'WebPage', '@id': p.url + '#webpage', url: p.url, name: title, description, inLanguage: p.lang, isPartOf: { '@id': base + '#website' },
            primaryImageOfPage: { '@type': 'ImageObject', url: og, width: 1200, height: 630 }, dateModified: today }] })}</script>`,
    ].map(l => '  ' + l).join('\n');
  }
  html = html.replace(/(<!-- seo:start -->)[\s\S]*?(\s*<!-- seo:end -->)/, (m, a, b) => `${a}${block ? '\n' + block : ''}\n  <!-- seo:end -->`);
  // the FAQ's structured data is rebuilt from the visible FAQ (<details class="q">), so the two can never differ: edit the visible one, then run this script
  const flat = t => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const qa = [...html.matchAll(/<details class="q"><summary>(.*?)<\/summary><div class="a"><p>(.*?)<\/p><\/div><\/details>/gs)].map(m => ({ '@type': 'Question', name: flat(m[1]), acceptedAnswer: { '@type': 'Answer', text: flat(m[2]) } }));
  html = html.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?<\/script>/,
    () => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: p.lang, mainEntity: qa })}</script>`);
  // the WebApplication node of the page gets its address-bearing fields (or loses them again)
  html = html.replace(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"WebApplication".*?)<\/script>/, (m, json) => {
    const o = JSON.parse(json);
    for (const k of ['url', 'image', 'screenshot', 'downloadUrl', 'logo', 'dateModified']) delete o[k];
    if (base) Object.assign(o, { url: p.url, image: base + 'assets/img/og.png', screenshot: base + 'assets/img/og.png', logo: base + 'assets/img/icon-512.png', downloadUrl: base + 'downloads/Finglish.dmg', dateModified: today });
    return `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  });
  out.set(p.file, html);
}

// ---- 404.html: <base> makes its relative links work whatever path was asked for
{
  let h = read('404.html');
  h = h.replace(/(<!-- seo:start -->)[\s\S]*?(\s*<!-- seo:end -->)/, (m, a) => `${a}${base ? `\n  <base href="${base}">` : ''}\n  <!-- seo:end -->`);
  out.set('404.html', h);
}

// ---- robots.txt
out.set('robots.txt', [
  '# Everyone is welcome: this is a public, free tool. Search engines and AI assistants may read, index, quote and cite it.',
  'User-agent: *', 'Allow: /', '',
  '# AI crawlers and assistants, named explicitly (training, search and user-requested fetches alike)',
  ...AI_AGENTS.map(a => `User-agent: ${a}`), 'Allow: /', '',
  ...(base ? [`Sitemap: ${base}sitemap.xml`] : []), ''].join('\n'));

// ---- sitemap.xml (needs absolute URLs, so only with an address)
out.set('sitemap.xml', base ? `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="fa" href="${PAGES[0].url}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${PAGES[1].url}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${PAGES[0].url}"/>
  </url>`).join('\n')}
</urlset>
` : '');

// ---- llms.txt: a plain-text briefing for AI assistants (llmstxt.org format). The FAQ is taken from the English page's own structured data.
const faq = JSON.parse(read('en/index.html').match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/)[1]).mainEntity;
const link = (text, u, note) => base ? `- [${text}](${u}): ${note}` : `- ${text}: ${note}`;
out.set('llms.txt', `# Finglish (فینگلیش)

> Finglish is a free tool for typing Persian (Farsi) with a Latin keyboard: type "salam" and get "سلام". It converts Finglish (also called Pinglish — Persian written in Latin letters) to Persian script as you type, with candidate suggestions. It runs entirely in the browser (and as a macOS keyboard), works offline once loaded, and sends nothing anywhere. Open source under AGPL-3.0, made by Mehras Hojjat (https://mehrashojjat.com).

Key facts:
- What it does: Finglish / Pinglish → Persian (فارسی) transliteration while typing; the user picks from suggestions with Space or the keys 1–9.
- Privacy: the conversion happens in the user's browser; the page makes no network request to send text (verified by automated tests). Learned choices stay in the browser.
- Cost: free, no account.
- Platforms: any modern desktop browser (the website); a macOS keyboard for macOS 26 or later (signed and notarized disk image); Windows version coming soon.
- Languages of the site: Persian (default) and English.
- Accuracy: on an independent test set of chat-style words the first suggestion was right ~92% of the time, and more than 98% of the time the right word was in the first five.
- Not a machine-translation tool: it transliterates (changes the script), it does not translate English into Persian.

## Pages
${link('Finglish — Persian page', PAGES[0].url, 'the tool and its explanation in Persian (فارسی)')}
${link('Finglish — English page', PAGES[1].url, 'the same tool, explained in English')}
${link('macOS keyboard (DMG)', base + 'downloads/Finglish.dmg', 'the Finglish keyboard for macOS 26+, signed and notarized')}
${base ? '' : '(Absolute links are added once the site address is known: node tools/seo.js <address>.)\n'}
## Frequently asked questions
${faq.map(q => `### ${q.name}\n${q.acceptedAnswer.text}`).join('\n\n')}

## Licence
The program is released under the GNU Affero General Public License v3.0 (AGPL-3.0-only). The word lists are under CC BY-SA 4.0 (derived from Persian Wikipedia, Wiktionary and OpenSubtitles word counts); the Vazirmatn font is under the SIL OFL 1.1.
`);

// ---- write (or compare)
const norm = t => t.replace(/<lastmod>[^<]*<\/lastmod>/g, '').replace(/"dateModified":"[^"]*"/g, '');
if (check) {
  const bad = [];
  for (const [f, t] of out) { const have = fs.existsSync(path.join(ROOT, f)) ? read(f) : ''; if (norm(have) !== norm(t)) bad.push(f); }
  if (bad.length) { console.error('Out of date (run: node tools/seo.js' + (base ? ' ' + base : '') + '): ' + bad.join(', ')); process.exit(1); }
  console.log('seo files are up to date' + (base ? ' for ' + base : ' (no address set yet)')); process.exit(0);
}
for (const [f, t] of out) {
  if (t === '') { if (fs.existsSync(path.join(ROOT, f))) fs.unlinkSync(path.join(ROOT, f)); } else write(f, t);
}
if (args.some(a => /^https?:\/\//.test(a)) || clear) {
  if (base) PKG.homepage = base; else delete PKG.homepage;
  write('package.json', JSON.stringify(PKG, null, 2) + '\n');
}
console.log(base ? `site address ${base}: wrote canonical/hreflang/og tags, structured-data URLs, sitemap.xml, robots.txt, llms.txt, 404.html` : 'no site address set: wrote the address-free versions (robots.txt, llms.txt, 404.html); no sitemap.xml');
