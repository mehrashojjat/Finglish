'use strict';
/**
 * PROOF that the website is offline.   cd tests/e2e && node offline_proof.js
 * (The page has one, local engine and nothing else that could reach a network.)
 *
 * Passes, each with a fresh browser profile and DEFAULT settings:
 *   1. the page from disk (file://) with Chrome's network switched OFF at the protocol level (Network.emulateNetworkConditions),
 *   2. the page served from localhost, with every non-localhost request intercepted and recorded.
 * In both, the whole feature set is used (typing, picking, 0 / Latin row, undo, learning, the half-space setting, every settings checkbox). We fail
 * on ANY request to anything but the app's own files, and on any fetch/XHR/WebSocket/beacon/EventSource attempt made by the page's own code
 * (instrumented before the page loads).
 * POSITIVE CONTROL: the test itself fires one deliberate fetch to an outside address and the very same detectors must see it — proof that
 * "zero requests" above means something.
 */
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) failed++; };
/* ok() prints PASS/FAIL */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pass(label, url, { offline, control }) {
  console.log(`\n== ${label}`);
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  await page.evaluateOnNewDocument(() => {            // runs before any page script: count the page's own attempts to use the network
    window.__net = [];
    const rec = (k, a) => window.__net.push(k + ' ' + String(a));
    const f = window.fetch; window.fetch = function (...a) { rec('fetch', a[0]); return f.apply(this, a); };
    const o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (...a) { rec('xhr', a[1]); return o.apply(this, a); };
    if (navigator.sendBeacon) { const b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (...a) => { rec('beacon', a[0]); return b(...a); }; }
    for (const n of ['WebSocket', 'EventSource']) { const C = window[n]; if (C) window[n] = function (...a) { rec(n, a[0]); return new C(...a); }; }
  });
  if (offline) { const cdp = await page.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); }
  else { await page.setRequestInterception(true); page.on('request', r => { const u = new URL(r.url()); (u.hostname === 'localhost' || u.hostname === '127.0.0.1') ? r.continue() : r.abort('blockedbyclient'); }); }

  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 30000 });
  ok(await page.evaluate(() => !document.querySelector('.seg') && !document.getElementById('s-compare') && !document.getElementById('s-fallback')), 'the page has no engine buttons, no compare option and no fallback option');

  const type = s => page.keyboard.type(s, { delay: 12 });
  if (control) {          // POSITIVE CONTROL: a deliberate request made BY THE TEST — the very same detectors must fire
    await page.evaluate(() => fetch('https://example.com/request?text=salam').catch(() => {}));
    await sleep(800);
    const gReqs = reqs.filter(u => /example\.com/i.test(u)), gAtt = await page.evaluate(() => window.__net);
    ok(gReqs.length > 0, 'CONTROL: the request log DOES see a request to an outside address when one is made (' + gReqs.length + ')', gReqs);
    ok(gAtt.length > 0, 'CONTROL: the in-page instrumentation DOES see the fetch attempt (' + gAtt.length + ')', gAtt);
    await browser.close();
    return;
  }

  // ---- use everything the page offers
  await page.focus('#editor');
  await type('salam '); await type('khoobi'); await page.keyboard.press('Enter');
  await type('mikham'); await page.keyboard.press('2');
  await type('whatsapp '); await type('Hello'); await page.keyboard.press('0');
  await type('me@example.com'); await page.keyboard.press('Space');
  await type('ketabhayeman'); await page.keyboard.press('Space');
  await type('sher'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('PageDown'); await page.keyboard.press('Escape');
  await type('1,2? ');
  await page.keyboard.down('Meta'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Meta');
  await page.click('#s-zwnj'); await page.focus('#editor'); await type('mikhastam'); await page.keyboard.press('Space'); await page.click('#s-zwnj');   // half-space setting on, then off
  for (const id of ['inlinePreview', 'showLatin', 'autoSpace', 'persianDigits', 'mapPunct', 'context', 'learn', 'onlySpaceCommits']) { await page.click('#s-' + id); await page.click('#s-' + id); }   // every checkbox, off and on again
  await page.select('#s-pageSize', '9'); await page.select('#s-pageSize', '6');
  await page.focus('#editor'); await type('salam'); await sleep(300); await page.keyboard.press('Space');
  await page.click('#copy').catch(() => {}); await page.click('#clear'); await page.click('#clearLearn');
  await page.click('#dl-open'); await sleep(150); await page.keyboard.press('Escape');          // the download dialog opens and closes without loading anything (the file is fetched only when its link is clicked)
  await sleep(500);
  const value = await page.$eval('#editor', e => e.value);
  ok(true, 'ran the whole offline feature set without errors (editor now: ' + JSON.stringify(value) + ')');

  // ---- verdicts
  const external = reqs.filter(u => !/^(file:|data:|blob:|about:)/.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)[:\/]/.test(u));
  const attempts = await page.evaluate(() => window.__net);
  console.log(`   (${reqs.length} requests in total; all are the app's own files: ${Array.from(new Set(reqs.map(u => u.replace(/^(file:\/\/|http:\/\/localhost:\d+)/, '').split('/').slice(0, -1).join('/') || '/'))).join(', ')})`);
  ok(external.length === 0, 'zero requests to anything outside the app\'s own files', external);
  ok(attempts.length === 0, 'the page code never even attempted fetch / XHR / WebSocket / beacon / EventSource', attempts);
  await browser.close();
}

(async () => {
  await pass('A. from disk (file://), Chrome network emulation: OFFLINE', 'file://' + path.join(ROOT, 'index.html'), { offline: true });
  await pass('C. POSITIVE CONTROL: a deliberate request, so the detectors must fire', 'file://' + path.join(ROOT, 'index.html'), { offline: true, control: true });
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js'), '--no-open', '--port', '8099'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(res => srv.stdout.on('data', d => /is running/.test(String(d)) && res()));
  try {
    await pass('B. served from localhost, every non-localhost request intercepted', 'http://localhost:8099/', { offline: false });
    await pass('B2. the English page, served from localhost, every non-localhost request intercepted', 'http://localhost:8099/en/', { offline: false });
  }
  finally { srv.kill(); }
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nOFFLINE PROOF PASSED: the website makes no network request of any kind.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
