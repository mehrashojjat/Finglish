'use strict';
/**
 * The website as a published page: the dev server serves only the public files, the download button really downloads (and never
 * navigates away), the dialog behaves, the footer is there, and the header and the dialog fit a phone.
 *   cd tests/e2e && node site.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8098, BASE = `http://localhost:${PORT}/`;
let failed = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '   -> ' + JSON.stringify(x))); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => http.get(BASE + p.replace(/^\//, ''), r => { const n = []; r.on('data', d => n.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(n) })); }).on('error', rej));

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js'), '--no-open', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(res => srv.stdout.on('data', d => /is running/.test(String(d)) && res()));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'finglish-dl-'));
  let browser;
  try {
    // ---- 1. the server hands out the public site and nothing else
    const home = await get('/');
    ok(home.status === 200 && /<html lang="fa"/.test(home.body.toString()), '"/" serves index.html, the Persian page (the website is the repository root)');
    const en = await get('/en/'); ok(en.status === 200 && /<html lang="en"/.test(en.body.toString()), '"/en/" serves the English page');
    const redir = await get('/en'); ok(redir.status === 301 && redir.headers.location === '/en/', '"/en" redirects to "/en/" (as the static hosts do)', redir.status);
    for (const f of ['/robots.txt', '/llms.txt', '/404.html', '/favicon.ico', '/apple-touch-icon.png', '/assets/img/og.png']) ok((await get(f)).status === 200, 'served: ' + f);
    ok((await get('/sitemap.xml')).status === (require('fs').existsSync(path.join(ROOT, 'sitemap.xml')) ? 200 : 404), '/sitemap.xml is served exactly when it exists');
    for (const p of ['/.git/config', '/.gitignore', '/package.json', '/LICENSE', '/README.md', '/tests/engine.test.js', '/mac/build.sh', '/data/aliases.tsv', '/tools/serve.js', '/engine/src/engine.js', '/tools/seo.js', '/en/../package.json', '/assets/../package.json', '/%2e%2e/package.json'])
      ok((await get(p)).status >= 400, 'not served: ' + p, (await get(p)).status);
    for (const p of ['/assets/css/style.css', '/assets/js/app.js', '/assets/js/download.js', '/assets/img/logo.svg', '/assets/fonts/Vazirmatn-Regular.woff2'])
      ok((await get(p)).status === 200, 'served: ' + p);
    const dmgFile = path.join(ROOT, 'downloads/Finglish.dmg');
    const dmg = await get('/downloads/Finglish.dmg');
    ok(dmg.status === 200 && dmg.body.length === fs.statSync(dmgFile).size, '/downloads/Finglish.dmg is served in full', dmg.status);
    ok(/attachment/.test(dmg.headers['content-disposition'] || '') && dmg.headers['content-type'] === 'application/octet-stream', 'the disk image is sent as an attachment (the browser saves it)', dmg.headers);

    // ---- 2. the page
    browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await page.goto(BASE);
    await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 20000 });

    // header: logo on the right, the download button at the far left
    const h = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const c = r('.editor-card');
      return { btnLeft: Math.round(r('#dl-open').left), cardLeft: Math.round(c.left), logoRight: Math.round(r('.logo').right), cardRight: Math.round(c.right), label: document.getElementById('dl-open').textContent.trim() }; });
    ok(h.label === 'دانلود', 'the header button says «دانلود»', h.label);
    ok(Math.abs(h.btnLeft - h.cardLeft) <= 2 && Math.abs(h.logoRight - h.cardRight) <= 2, 'the download button is at the top left (aligned with the cards), the logo at the top right', h);

    // dialog
    ok(await page.$eval('#dl', d => !d.open), 'the dialog is closed at first');
    await page.click('#dl-open'); await sleep(150);
    const d = await page.evaluate(() => { const dlg = document.getElementById('dl'); const mac = document.getElementById('dl-mac'); const soon = dlg.querySelector('.soon');
      return { open: dlg.open, rtl: dlg.dir === 'rtl', title: dlg.querySelector('h2').textContent.trim(), macText: mac.textContent.replace(/\s+/g, ' ').trim(), macHref: mac.getAttribute('href'), macDownload: mac.getAttribute('download'),
               soonText: soon.textContent.replace(/\s+/g, ' ').trim(), soonIsLink: !!soon.closest('a') || soon.tagName === 'A', items: dlg.querySelectorAll('.dl-item').length,
               focused: document.activeElement && document.activeElement.id }; });
    ok(d.open && d.rtl && d.title === 'دانلود فینگلیش', 'the button opens a right-to-left dialog «دانلود فینگلیش»', d);
    ok(d.items === 2 && /macOS/.test(d.macText) && /Windows/.test(d.soonText), 'it offers exactly two systems: macOS and Windows', d);
    ok(/به‌زودی/.test(d.soonText) && !d.soonIsLink, 'Windows says «به‌زودی» (coming soon) and is not a link', d);
    ok(d.macHref === 'downloads/Finglish.dmg' && d.macDownload === 'Finglish.dmg', 'macOS links to downloads/Finglish.dmg with the download attribute', d);
    ok(await page.$eval('#dl', e => e.querySelectorAll('p').length === 1 && e.querySelectorAll('li').length === 2), 'the dialog has nothing but the title, the subtitle and the two systems (no extra text)');
    const ico = await page.evaluate(() => Array.from(document.querySelectorAll('#dl .dl-ico')).map(i => { const r = i.getBoundingClientRect(); return [i.getAttribute('viewBox'), Math.round(r.width), Math.round(r.height), i.querySelectorAll('path').length]; }));
    ok(ico.length === 2 && ico[0].join() === ico[1].join(), 'both system icons are logos drawn the same way (same size, same viewBox, filled paths)', ico);
    ok(d.focused === 'dl-mac', 'the macOS download has the keyboard focus', d.focused);

    // Esc, ×, and a click on the dimmed area all close it
    await page.keyboard.press('Escape'); ok(await page.$eval('#dl', x => !x.open), 'Esc closes the dialog');
    await page.click('#dl-open'); await sleep(100); await page.click('.dl-x'); ok(await page.$eval('#dl', x => !x.open), '× closes the dialog');
    await page.click('#dl-open'); await sleep(100); await page.mouse.click(5, 5); ok(await page.$eval('#dl', x => !x.open), 'a click outside closes the dialog');

    // the download itself: the browser saves the file, the page stays where it is
    const urlBefore = page.url(), tabsBefore = (await browser.pages()).length;
    await page.click('#dl-open'); await sleep(100);
    await page.click('#dl-mac');
    const saved = path.join(downloads, 'Finglish.dmg');
    for (let i = 0; i < 100 && !fs.existsSync(saved); i++) await sleep(100);
    ok(fs.existsSync(saved), 'clicking macOS makes the browser save ' + path.basename(saved) + ' (a download, not a page)', fs.readdirSync(downloads));
    const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    ok(fs.existsSync(saved) && sha(saved) === sha(dmgFile), 'the saved file is byte-identical to downloads/Finglish.dmg');
    ok(page.url() === urlBefore && (await browser.pages()).length === tabsBefore, 'the browser stayed on the page: no navigation, no new tab', { url: page.url() });
    await sleep(500); ok(await page.$eval('#dl', x => !x.open), 'the dialog closes itself after the download starts');
    ok(await page.evaluate(() => document.body.dataset.engine === 'ready'), 'the page still works after the download');

    // footer
    const f = await page.evaluate(() => { const el = document.querySelector('footer'); const r = el.querySelector('p').getBoundingClientRect(); const a = el.querySelector('a');
      return { text: el.textContent.replace(/\s+/g, ' ').trim(), centre: Math.round(r.left + r.width / 2), vw: document.documentElement.clientWidth, align: getComputedStyle(el).textAlign, href: a && a.href, rtl: el.dir === 'rtl' }; });
    ok(f.text === '© ۲۰۲۶ مهراس حجت · مجوز AGPL-3.0' && f.rtl, 'the footer reads «© ۲۰۲۶ مهراس حجت · مجوز AGPL-3.0»', f);
    ok(f.align === 'center' && Math.abs(f.centre - f.vw / 2) <= 2, 'the footer is centred', f);
    ok(f.href === 'https://www.gnu.org/licenses/agpl-3.0.html', 'AGPL-3.0 links to the licence text', f.href);
    const order = await page.evaluate(() => { const fo = document.querySelector('footer'), ab = document.getElementById('about'), main = document.querySelector('main');
      return { after: !!(ab.compareDocumentPosition(fo) & Node.DOCUMENT_POSITION_FOLLOWING), outsideMain: !main.contains(fo), gap: Math.round(fo.getBoundingClientRect().top - ab.getBoundingClientRect().bottom) }; });
    ok(order.after && order.outsideMain && order.gap >= 0, 'the footer is the last thing on the page, below About', order);

    // Persian wording of the new parts: no English but the system names and the licence name
    const latin = await page.evaluate(() => { const bad = []; for (const sel of ['#dl', 'footer', '#dl-open']) { const t = document.querySelector(sel).textContent;
      for (const w of t.match(/[A-Za-z]{3,}/g) || []) if (!/^(macOS|Windows|AGPL)$/.test(w)) bad.push(w); } return bad; });
    ok(latin.length === 0, 'the dialog, the button and the footer have no English words (system and licence names aside)', latin);

    // the Persian page: Persian controls, a link to the English page
    ok(await page.evaluate(() => document.getElementById('copy').textContent.trim() === 'کپی' && document.getElementById('clear').textContent.trim() === 'پاک کردن' && /امتحان کنید/.test(document.querySelector('.hint').textContent)), 'the Persian page: Copy / Clear / "Try" are Persian');
    ok(await page.evaluate(() => { const a = document.querySelector('.lang-switch'); return a.href === location.origin + '/en/' && a.hreflang === 'en'; }), 'the Persian page links to /en/');
    ok(await page.evaluate(() => document.querySelectorAll('#faq details.q').length >= 9 && !!document.querySelector('#examples table.examples')), 'the Persian page has the FAQ and the examples table');
    await page.click('#faq details.q summary'); ok(await page.$eval('#faq details.q', d => d.open), 'a FAQ question opens when clicked');

    // the English page: the same tool, English controls
    await page.goto(BASE + 'en/');
    await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 20000 });
    const e = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), title: document.title,
      copy: document.getElementById('copy').textContent.trim(), count: document.getElementById('count').textContent, foot: document.querySelector('footer').textContent.replace(/\s+/g, ' ').trim(),
      sw: (() => { const a = document.querySelector('.lang-switch'); return [a.href, a.hreflang]; })(), dl: document.getElementById('dl-mac').href, dlTitle: document.querySelector('#dl h2').textContent.trim() }));
    ok(e.lang === 'en' && e.dir === 'ltr' && /Finglish → Persian/.test(e.h1) && /Persian/.test(e.title), 'the English page is lang="en" dir="ltr" with its own title and H1', e);
    ok(e.copy === 'Copy' && e.count === '0 words' && e.foot === '© 2026 Mehras Hojjat · Licensed under AGPL-3.0', 'English controls, word counter and footer', e);
    ok(e.sw[0] === BASE && e.sw[1] === 'fa' && e.dl === BASE + 'downloads/Finglish.dmg' && e.dlTitle === 'Download Finglish', 'the English page links back to / and downloads the same file', e);
    // Persian script on the English page is set in Vazirmatn, like on the Persian page (not in a system fallback font)
    const cdp2 = await page.createCDPSession(); await cdp2.send('DOM.enable'); await cdp2.send('CSS.enable');
    const fontsOf = async sel => { const { root } = await cdp2.send('DOM.getDocument'); const { nodeId } = await cdp2.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      return (await cdp2.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName); };
    const fSwitch = await fontsOf('.lang-switch'), fFaq = await fontsOf('#what .prose p'), fExamples = await fontsOf('#examples td[lang="fa"]');
    ok(fSwitch.length === 1 && fSwitch[0] === 'Vazirmatn', 'the «فارسی» link on the English page is set in Vazirmatn', fSwitch);
    ok(fFaq.includes('Vazirmatn') && fFaq.some(f => f !== 'Vazirmatn'), 'Persian words inside English text use Vazirmatn while the Latin letters keep the system font', fFaq);
    ok(fExamples.length === 1 && fExamples[0] === 'Vazirmatn', 'the Persian examples are set in Vazirmatn', fExamples);
    await page.focus('#editor'); await page.keyboard.type('salam ', { delay: 15 }); await page.keyboard.type('khobi', { delay: 15 }); await page.keyboard.press('Space');
    ok((await page.$eval('#editor', t => t.value)) === 'سلام خوبی ', 'typing works on the English page (salam khobi → سلام خوبی)');
    ok(await page.$eval('#count', c => c.textContent) === '2 words', 'the English word counter says "2 words"');
    await page.click('#dl-open'); await sleep(120);
    ok(await page.evaluate(() => { const d = document.getElementById('dl'); return d.open && /Coming soon/.test(d.querySelector('.soon').textContent) && /Download/.test(d.querySelector('#dl-mac').textContent); }), 'the English download dialog: macOS "Download", Windows "Coming soon"');
    await page.keyboard.press('Escape');
    await page.goto(BASE);
    await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 20000 });

    // phone width: nothing spills sideways, the dialog fits
    await page.setViewport({ width: 360, height: 740 });
    await sleep(100);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bl: Math.round(document.getElementById('dl-open').getBoundingClientRect().left), br: Math.round(document.getElementById('dl-open').getBoundingClientRect().right) }));
    ok(m.sw <= m.cw && m.bl >= 0 && m.br <= m.cw, 'on a 360 px phone the header fits (no sideways scrolling, the button is on screen)', m);
    await page.click('#dl-open'); await sleep(150);
    const dr = await page.$eval('#dl', e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: document.documentElement.clientWidth }; });
    ok(dr.l >= 0 && dr.r <= dr.w, 'and the dialog fits the screen', dr);
    await page.keyboard.press('Escape');

    ok(errors.length === 0, 'no console/page errors', errors);
  } finally {
    if (browser) await browser.close();
    srv.kill();
    fs.rmSync(downloads, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
