'use strict';
/**
 * Browser smoke test for the website (it is offline-only; tests/e2e/offline_proof.js proves it makes no request at all).
 *   cd tests/e2e && npm install && node smoke.js [--shots]
 * Drives system Chrome through puppeteer-core: types Finglish with real key events, checks the inline text, the
 * popup, number-key selection, Esc, punctuation/digits, and (with --shots) saves the README's screenshot, docs/screenshots/app_popup.png.
 */
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shots = process.argv.includes('--shots');
let failed = 0;
const ok = (cond, msg, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg + (cond ? '' : '   -> ' + JSON.stringify(extra))); if (!cond) failed++; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1100,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.APP_URL || ('file://' + path.join(ROOT, 'index.html')));   // APP_URL=http://localhost:8080/ tests the served site
  await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 20000 });
  const value = () => page.$eval('#editor', e => e.value);
  const popupText = () => page.$eval('#popup', p => p.hidden ? null : Array.from(p.querySelectorAll('.cp-list li')).map(li => li.querySelector('.cp-t').textContent));
  const type = s => page.keyboard.type(s, { delay: 15 });

  await page.focus('#editor');
  await page.evaluate(() => { document.getElementById('editor').value = ''; });

  await type('salam');
  ok((await value()) === 'سلام', 'inline preview shows best candidate while typing', await value());
  let list = await popupText();
  ok(list && list[0] === 'سلام' && list.includes('سالم'), 'popup lists candidates', list);

  await page.keyboard.press('Space');
  ok((await value()) === 'سلام ', 'space commits + adds a space', await value());
  ok((await popupText()) === null, 'popup hidden after commit');

  await type('khoobi');
  await page.keyboard.press('Enter');
  ok((await value()) === 'سلام خوبی ', 'enter commits + adds a space', await value());

  await type('salam');
  list = await popupText();
  const latinRow = () => page.$eval('#popup', p => { const r = p.querySelector('.cp-latin'); return r ? { text: r.querySelector('.cp-t').textContent, n: r.querySelector('.cp-n').textContent, last: p.lastElementChild === r || r.nextElementSibling === null || r.nextElementSibling.className === 'cp-foot' } : null; });
  const lr = await latinRow();
  ok(lr && lr.text === 'salam' && lr.n === '۰.', 'typed Latin is pinned as the last row, numbered ۰', lr);
  ok(list.length <= 6 && !list.includes('salam'), 'the numbered rows are Persian only', list);
  await page.keyboard.press('2');
  const v2 = await value();
  ok(v2 === 'سلام خوبی سالم ', 'digit 2 picks 2nd candidate + space', v2);

  await type('mikham');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  ok((await value()).includes('میخام') || (await value()).includes('میخوایم'), 'tab moves to next candidate before commit', await value());
  await page.evaluate(() => { document.getElementById('editor').value = ''; });

  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await type('man');
  await page.keyboard.press('Escape');
  ok((await value()) === '' && (await popupText()) === null, 'escape discards the composition', await value());

  await type('Hello');
  await page.keyboard.press('0');
  ok((await value()) === 'Hello ', 'key 0 commits the English exactly as typed (capitals kept) + space', await value());

  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await type('man');
  await page.keyboard.press('ArrowUp');
  const latSel = await page.$eval('#popup .cp-latin', e => e.classList.contains('sel'));
  ok(latSel, 'arrow up from the first candidate wraps to the Latin row');
  ok((await value()) === 'man', 'inline preview shows the Latin when its row is highlighted', await value());
  await page.keyboard.press('Space');
  ok((await value()) === 'man ', 'space commits the highlighted Latin row', await value());

  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await type('1,2?');
  ok((await value()) === '۱،۲؟', 'digits and punctuation are Persian', await value());

  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await type('mersi');
  await page.keyboard.press('Backspace');
  ok((await value()) !== '' && (await popupText()) !== null, 'backspace edits the Latin buffer', await value());
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  ok((await value()) === '' && (await popupText()) === null, 'backspace to empty cancels composition', await value());

  // typing with surrounding text: composition must not disturb the text around the caret
  await page.evaluate(() => { const e = document.getElementById('editor'); e.value = 'الف ب'; e.setSelectionRange(4, 4); });
  await type('dar');
  await page.keyboard.press('Space');
  const mid = await value();
  ok(mid.startsWith('الف ') && mid.endsWith('ب') && mid.includes('در'), 'composition in the middle of text', mid);

  if (shots) {
    await page.evaluate(() => { document.getElementById('editor').value = ''; });
    await type('salam khoobi chetori ');
    await type('mikham');
    await page.screenshot({ path: path.join(ROOT, 'docs/screenshots/app_popup.png') });
  }

  // There is no Persian on/off switch any more (and no other engine): the controls are gone, the old shortcut does nothing,
  // and a settings object saved by an older version (enabled:false, mode:'online'…) cannot switch anything off or on.
  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await page.focus('#editor');
  ok(await page.evaluate(() => !document.getElementById('fa-toggle') && !document.querySelector('.seg') && !document.getElementById('status') && !document.getElementById('latency') && !document.getElementById('debug') && !/آفلاین|offline/i.test(document.querySelector('footer').textContent)),
     'the switch, the engine buttons, the status chip, the latency and the compare panel are gone from the page (the footer is only the copyright line, no offline text)');
  await type('salam');
  await page.keyboard.down('Alt'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyT'); await page.keyboard.up('Shift'); await page.keyboard.up('Alt');
  ok((await popupText()) !== null && (await popupText())[0] === 'سلام', 'Alt+Shift+T does nothing: the word is still being converted', await popupText());
  await page.keyboard.press('Space');
  await page.evaluate(() => localStorage.setItem('fa-ime-settings', JSON.stringify({ enabled: false, mode: 'online', compare: true, fallback: false })));
  await page.reload(); await page.waitForFunction(() => document.body.dataset.engine === 'ready', { timeout: 20000 });
  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await page.focus('#editor'); await type('mersi'); await page.keyboard.press('Space');
  ok((await value()) === 'مرسی ', 'settings saved by an older version (enabled:false, mode:online) are ignored: Persian typing works', await value());
  await page.evaluate(() => { localStorage.removeItem('fa-ime-settings'); document.getElementById('editor').value = ''; });
  await page.focus('#editor');

  // experiment: only Space (Enter, 0) ends a word — signs stay inside it
  const clearBox = async () => { await page.evaluate(() => { document.getElementById('editor').value = ''; }); await page.focus('#editor'); };
  const rows = () => page.$eval('#popup', p => ({ shown: !p.hidden, persian: p.querySelectorAll('.cp-list li').length, latin: (p.querySelector('.cp-latin .cp-t') || {}).textContent, label: (p.querySelector('.cp-mode') || {}).textContent }));
  await clearBox();
  await type('me@example.com');
  const sg = await rows();
  ok(sg.shown && sg.persian === 0 && sg.latin === 'me@example.com' && sg.label !== '', 'signs stay in the word: only the "as typed" row, no conversion', sg);
  ok((await value()) === 'me@example.com', 'the e-mail is shown inline while typing', await value());
  await page.keyboard.press('0');
  ok((await value()) === 'me@example.com ', 'key 0 commits the e-mail as typed + space', await value());
  await clearBox();
  await type('https://x.io/a?b=1'); await page.keyboard.press('Space');
  ok((await value()) === 'https://x.io/a?b=1 ', 'a link with : / ? = and a digit is typed uninterrupted, Space commits', await value());
  await clearBox();
  await type('salam@'); await page.keyboard.press('Backspace');
  const back = await rows();
  ok(back.persian > 0 && (await value()) === 'سلام', 'deleting the sign brings the Persian candidates back', { back, v: await value() });
  await page.keyboard.press('Escape'); await clearBox();
  // signs AFTER the letters stay attached to the Persian word (the word is still converted)
  await clearBox();
  await type('salam?');
  const tr = await rows();
  ok(tr.shown && tr.persian > 0 && tr.label === '', 'a sign after the word keeps the Persian candidates', tr);
  ok((await popupText())[0] === 'سلام؟' && (await value()) === 'سلام؟', 'rows and preview show the word WITH the sign (سلام؟)', { v: await value(), list: await popupText() });
  ok((await page.$eval('#popup .cp-latin .cp-t', e => e.textContent)) === 'salam?', 'the English row still offers exactly what was typed');
  await page.keyboard.press('Space');
  ok((await value()) === 'سلام؟ ', 'Space commits the Persian word with the sign', await value());
  await clearBox();
  await type('salam.'); await page.keyboard.press('Space');
  ok((await value()) === 'سلام. ', 'salam. + Space -> سلام. (full stop stays a full stop)', await value());
  await clearBox();
  await type('salam,'); await page.keyboard.press('Space');
  ok((await value()) === 'سلام، ', 'salam, + Space -> سلام، (Persian comma)', await value());
  await clearBox();
  await type('salam?!'); await page.keyboard.press('2');
  ok((await value()) === 'سالم؟! ', 'several signs + a digit picks that candidate with the signs: سالم؟!', await value());
  await clearBox();
  await type('salam?'); await page.keyboard.press('0');
  ok((await value()) === 'salam? ', '0 commits the English exactly as typed: salam?', await value());
  await clearBox();
  await type('salam?e');
  const lit = await rows();
  ok(lit.persian === 0 && lit.label !== '', 'letters AFTER a sign make it literal text again (e-mails, links)', lit);
  await page.keyboard.press('Escape');
  // setting off -> the previous behaviour (a sign commits the highlighted word, then is typed / converted)
  await page.click('#s-onlySpaceCommits');
  await clearBox();
  await type('salam,');
  ok((await value()) === 'سلام،' && (await popupText()) === null, 'setting OFF: a comma commits the word and becomes ،', await value());
  await clearBox();
  await type('salam.');
  ok((await value()) === 'سلام.', 'setting OFF: a full stop commits the word', await value());
  const keyHelp = await page.$eval('#key-signs', e => e.hidden);
  ok(keyHelp === true, 'the key help row for signs is hidden when the setting is off', keyHelp);
  await page.click('#s-onlySpaceCommits');       // back ON
  ok((await page.$eval('#key-signs', e => e.hidden)) === false, 'and shown again when it is on');
  await clearBox();

  // undo / redo: one step per word
  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await page.focus('#editor');
  await type('salam'); await page.keyboard.press('Space');
  await type('khoobi'); await page.keyboard.press('Space');
  const undo = async () => { await page.keyboard.down('Meta'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Meta'); };
  const redo = async () => { await page.keyboard.down('Meta'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Shift'); await page.keyboard.up('Meta'); };
  await undo();
  ok((await value()) === 'سلام ', 'Cmd+Z removes the last committed word (one step per word)', await value());
  await undo();
  ok((await value()) === '', 'second Cmd+Z removes the first word', await value());
  await redo();
  ok((await value()) === 'سلام ', 'Shift+Cmd+Z redoes', await value());
  await type('man');
  await undo();
  ok((await value()) === 'سلام ' && (await popupText()) === null, 'Cmd+Z while composing cancels the composition only', await value());

  // half-space: a plain checkbox, off by default (joined letters); on = the orthographic half-space where known
  ok(await page.$eval('#s-zwnj', e => e.type === 'checkbox' && !e.checked), 'half-space is a checkbox and is off by default');
  await clearBox(); await page.focus('#editor');
  await type('mikhastam'); await page.keyboard.press('Space');
  ok((await value()) === 'میخواستم ', 'half-space off: میخواستم (joined)', await value());
  await clearBox(); await page.click('#s-zwnj'); await page.focus('#editor');
  await type('mikhastam'); await page.keyboard.press('Space');
  ok((await value()) === 'می\u200cخواستم ', 'half-space on: می‌خواستم (with the invisible half-space)', await value());
  await clearBox(); await page.click('#s-zwnj');
  ok(await page.$eval('.logo', e => e.complete && e.naturalWidth > 0), 'the logo (img/logo.svg) loads');
  ok(!(await page.$('#myAliases')) && !(await page.$('#shortcuts')), 'there is no "My shortcuts" section any more');

  // Shift+Space = half-space (نیم‌فاصله), as on a Persian keyboard
  const shiftSpace = async () => { await page.keyboard.down('Shift'); await page.keyboard.press('Space'); await page.keyboard.up('Shift'); };
  await clearBox(); await page.focus('#editor');
  await type('salam'); await shiftSpace();
  ok((await value()) === 'سلام\u200c' && (await popupText()) === null, 'Shift+Space commits the word + a half-space, with no space', JSON.stringify(await value()));
  await shiftSpace();
  ok((await value()) === 'سلام\u200c\u200c', 'Shift+Space with nothing being typed inserts a half-space', JSON.stringify(await value()));
  await type('khoobi'); await page.keyboard.press('Space');
  ok((await value()).startsWith('سلام\u200c\u200cخوبی') && (await value()).endsWith(' '), 'typing goes on normally after it', JSON.stringify(await value()));
  await clearBox(); await page.focus('#editor');
  await type('me@x.io'); await shiftSpace();
  ok((await value()) === 'me@x.io ', 'Shift+Space inside an e-mail is a plain space', JSON.stringify(await value()));
  await clearBox();
  ok(await page.$eval('#count', e => /^([۰-۹]+|صفر) کلمه$/.test(e.textContent)), 'the word counter is Persian');

  // a lone key gives its own letter first (s → س, h → ه, not اس / ها); a word in no list is typed letter by letter (↑ ↑ = the last Persian row)
  await clearBox(); await page.focus('#editor');
  await type('s'); const sRows = await popupText();
  ok(sRows && sRows[0] === 'س' && sRows[1] === 'ص', 'lone s: the letter س is the first row, then ص', sRows);
  await page.keyboard.press('Space');
  await type('h'); ok((await popupText())[0] === 'ه', 'lone h: the letter ه is the first row (not ها)');
  await page.keyboard.press('Space');
  ok((await value()) === 'س ه ', 'Space commits the letters: س ه', await value());
  await type('mmd'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
  ok((await value()) === 'س ه ممد ', '↑ ↑ then Space types the letter-by-letter spelling (mmd → ممد)', await value());
  await clearBox();

  // the Keys help, the settings and the word counter are 100 % Persian: no Latin word (3+ letters) outside the key caps (<kbd>) and the typed
  // examples (<code>) — texts, tooltips and aria labels included
  const latinLeft = await page.evaluate(() => {
    const allowed = /^(Space|Alt|Shift)$/, found = [];
    for (const sel of ['.sub', '.keys', '#settings', '#count']) {
      const el = document.querySelector(sel).cloneNode(true);
      el.querySelectorAll('kbd, code').forEach(n => n.remove());
      const texts = [el.textContent, ...Array.from(el.querySelectorAll('[title],[aria-label]')).map(e => (e.title || '') + ' ' + (e.getAttribute('aria-label') || ''))].join(' ');
      for (const w of texts.match(/[A-Za-z]{3,}/g) || []) if (!allowed.test(w)) found.push(w);
      if (/(?<![۰-۹])۰(?![۰-۹])/.test(el.textContent)) found.push('a lone ۰ in ' + sel + ' (looks like a dot: write صفر)');     // a zero inside a number (۱۰) is fine
      if (/تأیید|تمام کند/.test(el.textContent)) found.push('old wording in ' + sel + ' (use تایید کند)');
    }
    return found;
  });
  ok(latinLeft.length === 0, 'Tagline, Keys help, settings and word counter have no English words left (key caps aside)', latinLeft);
  ok(await page.$eval('#settings', e => e.dir === 'rtl' && e.lang === 'fa'), 'the settings card is right-to-left Persian');
  const head = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const m = document.querySelector('.editor-card').getBoundingClientRect();
    return { logoRight: Math.round(r('.logo').right), mainRight: Math.round(m.right), logoLeft: r('.logo').left, titleRight: r('h1').right, subRight: Math.round(r('.sub').right), titleRightR: Math.round(r('h1').right) }; });
  ok(head.logoLeft >= head.titleRight - 1 && Math.abs(head.logoRight - head.mainRight) <= 2, 'the header is right-to-left: the logo lines up with the right edge of the cards, the text sits to its left', head);
  ok(Math.abs(head.subRight - head.titleRightR) <= 2, 'the title and the tagline are lined up on the right', head);
  // About: the same text as the Mac app, who made it (linked), and the credits for the data
  const about = await page.evaluate(() => {
    const a = document.getElementById('about'); if (!a) return null;
    const link = t => { const x = Array.from(a.querySelectorAll('a')).find(e => e.textContent.includes(t)); return x ? x.href : null; };
    return { rtl: a.dir === 'rtl', text: a.textContent, dev: link('مهراس حجت'), subs: link('OpenSubtitles'), wiki: link('ویکی‌پدیا'), wikt: link('Wiktionary'), cc: link('CC BY-SA'), font: link('Vazirmatn'),
             icon: !!a.querySelector('img.about-icon') && a.querySelector('img.about-icon').naturalWidth > 0 };
  });
  ok(about && about.rtl && about.icon && about.text.includes('سازنده') && about.text.includes('اینترنت لازم نیست') && about.text.includes('روی سیستم شما اجرا می‌شود'), 'About: icon, the app text (local, no internet) and «سازنده»', about && about.text.slice(0, 80));
  ok(about && about.dev === 'https://mehrashojjat.com/', 'About: the developer name links to mehrashojjat.com', about && about.dev);
  ok(about && about.subs && about.wiki && about.wikt && /creativecommons\.org\/licenses\/by-sa/.test(about.cc || '') && about.font, 'About: the data sources, the CC BY-SA licence and the font are credited with links', about);


  ok(errors.length === 0, 'no console/page errors', errors);
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
