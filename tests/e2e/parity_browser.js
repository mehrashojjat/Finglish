'use strict';
/**
 * The WEBSITE's engine instance (window.__engine, in Chrome) must reproduce every vector in tests/golden/parity_vectors.jsonl —
 * the same file the Swift/JavaScriptCore host is checked against. node parity_browser.js   (cd tests/e2e)
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..', '..');
(async () => {
  const vectors = fs.readFileSync(path.join(ROOT, 'tests/golden/parity_vectors.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(process.env.APP_URL || ('file://' + path.join(ROOT, 'index.html')));
  await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 30000 });
  const res = await page.evaluate(vs => {
    let bad = 0; const examples = [];
    for (const v of vs) {
      const got = window.__engine.candidates(v.in, { max: 5, prev: v.prev || null });
      const ok = got.length === v.out.length && got.every((g, i) => g.text === v.out[i].t && g.kind === v.out[i].k && Math.abs(Math.round(g.score * 1000) / 1000 - v.out[i].s) <= 0.01);
      if (!ok) { bad++; if (examples.length < 5) examples.push({ in: v.in, got: got.map(g => g.text), want: v.out.map(o => o.t) }); }
    }
    return { n: vs.length, bad, examples };
  }, vectors);
  console.log(`website engine (Chrome): ${res.n} vectors, ${res.bad} mismatches`, res.bad ? JSON.stringify(res.examples) : '');
  await browser.close();
  process.exit(res.bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
