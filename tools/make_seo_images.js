#!/usr/bin/env node
'use strict';
/**
 * Renders the images search engines and social networks look for, from the one logo (assets/img/logo.svg) and the bundled Vazirmatn font:
 *   assets/img/og.png          1200×630  the picture shown when the link is shared (Open Graph / Twitter card)
 *   assets/img/icon-512.png    512×512   the logo as a PNG (structured data "logo")
 *   apple-touch-icon.png       180×180   iPhone / iPad home screen
 *   favicon.ico                16/32/48  what crawlers request by default (/favicon.ico)
 * Needs Google Chrome (the same one the browser tests use) and Python 3 with Pillow (for the .ico).   node tools/make_seo_images.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require(path.join(__dirname, '../tests/e2e/node_modules/puppeteer-core'));
const ROOT = path.join(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = f => 'file://' + path.join(ROOT, f).split('/').map(encodeURIComponent).join('/');

const og = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:V;src:url("${url('assets/fonts/Vazirmatn-Bold.woff2')}");font-weight:700}
@font-face{font-family:V;src:url("${url('assets/fonts/Vazirmatn-Regular.woff2')}");font-weight:400}
html,body{margin:0;width:1200px;height:630px;font-family:V,sans-serif}
body{background:linear-gradient(135deg,#0f1115 0%,#172033 100%);color:#e7e9ee;display:flex;align-items:center;justify-content:center;gap:64px;padding:0 90px;box-sizing:border-box}
img{width:250px;height:250px;flex:none}
.t{display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:84px;line-height:1.15;font-weight:700;direction:ltr}
.fa{font-size:44px;line-height:1.7;direction:rtl;text-align:left;color:#9fbcff}
.en{font-size:30px;line-height:1.4;color:#8b93a3;direction:ltr}
</style><img src="${url('assets/img/logo.svg')}"><div class="t"><h1>Finglish → فارسی</h1><div class="fa">با حروف لاتین، فارسی بنویسید.</div><div class="en">Type Persian with English letters · free · offline</div></div>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const shoot = async (html, w, h, out, transparent) => {
    await page.setViewport({ width: w, height: h });
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finglish-img-')), 'page.html');      // a file:// page may load file:// fonts and images; about:blank may not
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(ROOT, out), omitBackground: !!transparent });
  };
  await shoot(og, 1200, 630, 'assets/img/og.png');
  const logo = size => `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${url('assets/img/logo.svg')}">`;
  await shoot(logo(512), 512, 512, 'assets/img/icon-512.png', true);
  await shoot(logo(180).replace('background:transparent', 'background:#2f6fed'), 180, 180, 'apple-touch-icon.png');           // iOS wants an opaque square and rounds the corners itself
  await shoot(logo(256), 256, 256, 'assets/img/.favicon-src.png', true);
  await browser.close();
  execFileSync('python3', ['-I', '-c', `
from PIL import Image
im = Image.open(${JSON.stringify(path.join(ROOT, 'assets/img/.favicon-src.png'))}).convert('RGBA')
im.save(${JSON.stringify(path.join(ROOT, 'favicon.ico'))}, sizes=[(16, 16), (32, 32), (48, 48)])
`]);
  fs.unlinkSync(path.join(ROOT, 'assets/img/.favicon-src.png'));
  for (const f of ['assets/img/og.png', 'assets/img/icon-512.png', 'apple-touch-icon.png', 'favicon.ico']) console.log(f, fs.statSync(path.join(ROOT, f)).size + ' bytes');
})().catch(e => { console.error(e); process.exit(1); });
