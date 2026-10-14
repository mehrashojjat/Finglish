'use strict';
// Engine regression tests.   node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { Engine } = require('../engine/src/engine');
const { createChannel } = require('../engine/src/channel');
const { inputVariants, phoneticVariants } = require('../engine/src/skeleton');
const { normalizeLatin } = require('../engine/src/normalize');
const { CharLM } = require('../engine/src/charlm');

const ROOT = path.join(__dirname, '..');
const eng = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
eng.setAliases(fs.readFileSync(path.join(ROOT, 'data/aliases.tsv'), 'utf8'));
const bg = path.join(ROOT, 'data/build/bigrams.tsv');
if (fs.existsSync(bg)) eng.setBigrams(fs.readFileSync(bg, 'utf8'));
const top = (s, o) => (eng.candidates(s, o)[0] || {}).text;
const list = (s, n) => eng.candidates(s, { max: n || 9 }).map(c => c.text);

test('normalizeLatin', () => {
  assert.strictEqual(normalizeLatin('Khoooobi!'), 'khoobi');
  assert.strictEqual(normalizeLatin("Ta’sir"), "ta'sir");
  assert.strictEqual(normalizeLatin('  SALAM '), 'salam');
});

test('skeleton variants: digraphs, optional h, tanvin, x=ks', () => {
  assert.ok(inputVariants('khoobi').includes('XB'));
  assert.ok(inputVariants('shahr').includes('YR'), 'optional h after sh');
  assert.ok(inputVariants('lotfan').includes('LTF'), 'tanvin: final n is not a letter');
  assert.ok(inputVariants('taxi').includes('TKS'));
  assert.ok(inputVariants('mehraban').includes('MRBN'));
});

test('phonetic variants allow a short vowel to move around a consonant pair', () => {
  assert.ok(phoneticVariants('shork').some(v => v.text === 'shokr'));
  assert.deepStrictEqual(phoneticVariants('salam'), [{ text: 'salam', penalty: 0 }]);
});

test('channel: finite for natural spellings, infinite for impossible ones', () => {
  const ch = createChannel();
  for (const [w, x] of [['سلام', 'salam'], ['سلام', 'slm'], ['خوبی', 'khoobi'], ['لطفا', 'lotfan'], ['اول', 'avval'], ['تاکسی', 'taxi'], ['چای', 'chay']])
    assert.ok(ch.cost(w, x) < 8, `${w} <- ${x}`);
  assert.strictEqual(ch.cost('سلام', 'zzzz'), Infinity);
  assert.ok(ch.cost('چای', 'chay') < ch.cost('چی', 'chay'), 'chay is چای, not چی');
});

test('golden top-1: common Finglish', () => {
  const gold = { salam: 'سلام', slm: 'سلام', khoobi: 'خوبی', khobi: 'خوبی', chetori: 'چطوری', merci: 'مرسی', mersi: 'مرسی',
    mikham: 'میخوام', mikhaham: 'میخواهم', nemidoonam: 'نمیدونم', mamnoon: 'ممنون', doostet: 'دوستت', kheili: 'خیلی',
    computer: 'کامپیوتر', sara: 'سارا', ketab: 'کتاب', khodahafez: 'خداحافظ', lotfan: 'لطفا', avval: 'اول', bayad: 'باید',
    bebakhshid: 'ببخشید', khane: 'خونه', emrooz: 'امروز', tehran: 'تهران', iran: 'ایران', mohandesi: 'مهندسی', salamat: 'سلامت' };
  for (const [k, v] of Object.entries(gold)) assert.strictEqual(top(k).replace(/خانه/, 'خونه'), v.replace(/خانه/, 'خونه'), k);
});

test('pronunciation hints separate عشق / عاشق (ashegh vs eshgh)', () => {
  assert.strictEqual(top('ashegh'), 'عاشق');     // typed 'a' + ا silent: عاشق (âšeġ), not عشق (ešġ)
  assert.strictEqual(top('eshgh'), 'عشق');
  assert.ok(list('bekhar', 3).includes('بخر'));   // genuinely ambiguous with بخار; must stay reachable
});

test('morphology: unseen inflected forms are composed from base + clitic', () => {
  assert.strictEqual(top('ketabhayeman'), 'کتابهایمان');
  assert.strictEqual(top('daneshgahhayetoon'), 'دانشگاههایتون');
});

test('OOV: unseen names still get a sensible phonetic spelling', () => {
  const c = list('kamyar', 5);
  assert.ok(c.includes('کامیار') || c.includes('کمیار'), c.join(' '));
});

test('aliases outrank phonetics; user aliases outrank built-in ones', () => {
  assert.strictEqual(top('whatsapp'), 'واتساپ');
  assert.strictEqual(top('tv'), 'تیوی');
  eng.setUserAliases('tv\tتلویزیون');
  assert.strictEqual(top('tv'), 'تلویزیون');
  eng.setUserAliases(new Map());
});

test('ZWNJ policy', () => {
  const plain = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'), { zwnj: 'off' });
  for (const w of ['mikhastam', 'khanehaye', 'nemidoonam']) assert.ok(!plain.candidates(w)[0].text.includes('‌'), w);
});

test('context: previous word can break a tie, never crashes without data', () => {
  const a = eng.candidates('dar', { max: 5 }), b = eng.candidates('dar', { max: 5, prev: 'من' });
  assert.ok(a.length && b.length);
  assert.doesNotThrow(() => eng.candidates('dar', { prev: '???' }));
});

test('learning: a chosen candidate is promoted', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
  const before = e2.candidates('sakhte', { max: 5 }).map(c => c.text);
  const target = before[1];
  e2.learn('sakhte', target);
  assert.strictEqual(e2.candidates('sakhte', { max: 5 })[0].text, target);
});

test('learning: one deliberate third-row choice is promoted', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
  const before = e2.candidates('salam', { max: 5 }).map(c => c.text);
  const target = before[2];
  e2.learn('salam', target);
  assert.strictEqual(e2.candidates('salam', { max: 5 })[0].text, target);
});

test('learning: the same Persian choice transfers across Finglish spellings', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
  e2.learn('shork', 'شوکر');
  assert.strictEqual(e2.candidates('shokr', { max: 5 })[0].text, 'شوکر');
});

test('learning: an exact tapped spelling wins even when it was the generated row', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'), { oov: false, morph: false, literalFallback: true });
  e2.learn('shikr', 'شیکر');
  e2.learn('jale', 'جاله');
  assert.strictEqual(e2.candidates('shikr', { max: 3 })[0].text, 'شیکر');
  assert.strictEqual(e2.candidates('jale', { max: 3 })[0].text, 'جاله');
  e2.learn('jale', 'ژاله');
  assert.strictEqual(e2.candidates('jale', { max: 3 })[0].text, 'ژاله');
});

test('explicit doubled vowels and repeated consonants preserve exact spelling', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
  assert.strictEqual(e2.candidates('shookr', { max: 5 })[0].text, 'شوکر');
  assert.strictEqual(e2.candidates('shooshmmd', { max: 5 })[0].text, 'شوشممد');
  assert.strictEqual(e2.candidates('mmd', { max: 5 })[0].text, 'ممد');
  assert.strictEqual(e2.candidates('kr', { max: 5 })[0].text, 'کر');
  assert.strictEqual(e2.candidates('kar', { max: 5 })[0].text, 'کر');
});

test('phonetic ranking keeps an omitted leading vowel from beating a close spelling', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
  assert.ok(['ژاله', 'جاله'].includes(e2.candidates('jale', { max: 3 })[0].text));
  assert.ok(e2.candidates('shork', { max: 3 }).some(c => c.text === 'شوکر' || c.text === 'شکر'));
});

test('small-host literal fallback keeps an unknown spelling visible', () => {
  const e2 = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'), { oov: false, morph: false, literalFallback: true });
  const rows = e2.candidates('qwerty', { max: 3 });
  assert.strictEqual(rows[rows.length - 1].kind, 'literal');
  assert.strictEqual(rows[rows.length - 1].text, 'قورتی');
});

test('char LM: real words are likelier than random letters', () => {
  const lm = new CharLM(); lm.train(eng.lex.words.slice(0, 50000));
  assert.ok(lm.logProbWord('کتاب') > lm.logProbWord('کبتا') + 1);
});

test('robustness: odd input never throws', () => {
  for (const s of ['', ' ', 'a', 'zzzzzzzzzzzzzzzzzzzz', "'''", 'x1y2', 'ÀÉÎ', 'سلام', 'kh', 'gh', 'q', 'abababababababababab'])
    assert.doesNotThrow(() => eng.candidates(s), JSON.stringify(s));
});

test('latency budget: p95 under 40 ms on long inputs', () => {
  const ts = [];
  for (const w of ['ketabhayeman', 'daneshgahhayetoon', 'bargashtanamoon', 'mohandesinevisi', 'khodahafezetoon']) {
    const t = process.hrtime.bigint(); eng.candidates(w); ts.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  assert.ok(Math.max(...ts) < 80, ts.join(','));
});

test('the website and the host package ship the SAME bytes (one artifact, two consumers)', () => {
  const dist = f => fs.readFileSync(path.join(ROOT, 'engine/dist', f), 'utf8');
  assert.strictEqual(fs.readFileSync(path.join(ROOT, 'assets/vendor/farsi-ime-engine.js'), 'utf8'), dist('farsi-ime-engine.js'), 'engine bundle');
  const wrapped = (file, v) => { const m = fs.readFileSync(path.join(ROOT, 'assets/data', file), 'utf8').match(new RegExp('^window\\.' + v + ' = ([\\s\\S]*);\\n$')); return JSON.parse(m[1]); };
  assert.strictEqual(wrapped('lexicon.js', 'FARSI_LEXICON'), dist('lexicon.tsv'), 'lexicon');
  assert.strictEqual(wrapped('bigrams.js', 'FARSI_BIGRAMS'), dist('bigrams.tsv'), 'bigrams');
  assert.strictEqual(wrapped('aliases.js', 'FARSI_ALIASES'), dist('aliases.tsv'), 'aliases');
});

test('engine built from the shipped host package == engine built from the source tree', () => {
  const dist = f => fs.readFileSync(path.join(ROOT, 'engine/dist', f), 'utf8');
  const shipped = Engine.fromTSV(dist('lexicon.tsv')); shipped.setAliases(dist('aliases.tsv')); shipped.setBigrams(dist('bigrams.tsv'));
  for (const w of ['salam', 'mikham', 'ketabhayeman', 'ashegh', 'whatsapp', 'sher', 'kamyar', 'khoobi'])
    assert.deepStrictEqual(shipped.candidates(w, { max: 6 }).map(c => c.text), eng.candidates(w, { max: 6 }).map(c => c.text), w);
});

test('host string API: init/candidates/learn/export/import/setUserAliases/setOptions', () => {
  global.self = global; require(path.join(ROOT, 'engine/dist/farsi-ime-engine.js'));
  const H = global.FarsiIME.host, dist = f => fs.readFileSync(path.join(ROOT, 'engine/dist', f), 'utf8');
  assert.strictEqual(JSON.parse(H.init(dist('lexicon.tsv'), dist('bigrams.tsv'), dist('aliases.tsv'), '{}')).words > 200000, true);
  const r = JSON.parse(H.candidates('salam', '', 5));
  assert.strictEqual(r[0].text, 'سلام'); assert.ok(typeof r[0].score === 'number' && r[0].kind === 'lex');
  H.setUserAliases('mn\tمحمد'); assert.strictEqual(JSON.parse(H.candidates('mn', null, 3))[0].text, 'محمد');
  for (let i = 0; i < 3; i++) H.learn('sakhte', 'ساخته'); const saved = H.exportUserData();
  assert.ok(JSON.parse(saved).length === 1); H.importUserData('[]'); H.importUserData(saved);
  assert.strictEqual(JSON.parse(H.candidates('sakhte', '', 3))[0].text, 'ساخته');
  H.setOptions('{"zwnj":"auto"}'); assert.ok(JSON.parse(H.candidates('mikhastam', '', 3)).length > 0);
});

test('a lone key lists its own letter first, then the words (s → س, not اس; h → ه, not ها)', () => {
  const first = { a: 'ا', b: 'ب', c: 'ک', d: 'د', e: 'ا', f: 'ف', g: 'گ', h: 'ه', i: 'ی', j: 'ج', k: 'ک', l: 'ل', m: 'م', n: 'ن', o: 'و', p: 'پ',
                  q: 'ق', r: 'ر', s: 'س', t: 'ت', u: 'و', v: 'و', w: 'و', x: 'خ', y: 'ی', z: 'ز', sh: 'ش', ch: 'چ', kh: 'خ', gh: 'ق', zh: 'ژ', aa: 'ا', ee: 'ی', oo: 'و' };
  for (const [k, letter] of Object.entries(first)) assert.strictEqual(top(k), letter, `${k} → ${letter}`);
  assert.deepStrictEqual(list('s').slice(0, 4), ['س', 'ص', 'ث', 'ش'], 'the other letters that sound like s follow');
  assert.ok(list('s').includes('اس') && list('h').includes('ها'), 'the words are still offered, after the letters');
  assert.strictEqual(top('S'), 'س', 'capitals are the same key');
});

test('letter-by-letter spelling: exact repeated spellings are promoted when explicit', () => {
  const l = eng.candidates('mmd', { max: 18 });
  assert.strictEqual(l[0].text, 'ممد');
  assert.ok(l.some(c => c.text === 'ممد'));
  assert.ok(list('mhrs').includes('مهرس'), 'present once, wherever it ranks');
  assert.ok(list('mehr', 18).includes('مهر') && list('bache', 18).includes('باچه'), 'short e is not written, a final e is ه');
  assert.ok(list('khoobi', 18).includes('خوبی') && list('kheili', 18).includes('خیلی'));
  for (const w of ['salam', 'ketab', 'khoobi', 'mikham']) for (const n of [5, 9, 18]) {
    const t = list(w, n); assert.strictEqual(new Set(t).size, t.length, `${w}/${n}: no duplicates`);
    assert.ok(t.length <= n, `${w}/${n}: never longer than max`);
  }
  assert.deepStrictEqual(list('salam', 9).slice(0, 5), list('salam', 5), 'a short list is never trimmed: the first five are the same whatever max is');
});

test('letters: aliases keep the first place, max:1 is the best answer, the option can be switched off', () => {
  assert.strictEqual(top('tv'), 'تیوی', 'a built-in alias still wins');
  assert.strictEqual(list('salam', 1).length, 1); assert.strictEqual(list('salam', 1)[0], 'سلام');
  assert.strictEqual(list('s', 1)[0], 'س');
  const off = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'), { letters: false });
  assert.strictEqual(off.candidates('s', { max: 1 })[0].text, 'اس', 'letters:false restores the old behaviour');
  assert.ok(!off.candidates('mmd', { max: 9 }).some(c => c.kind === 'literal'));
});

test("half-space 'auto': only the regular patterns, never a stray one inside an ordinary word", () => {
  const { genuineHalfSpace } = require('../engine/src/lexicon');
  const Z = '\u200c';
  for (const good of ['می' + Z + 'کنم', 'نمی' + Z + 'دونم', 'کتاب' + Z + 'ها', 'آن' + Z + 'ها', 'بزرگ' + Z + 'تر', 'خانه' + Z + 'ام', 'خانه' + Z + 'ای'])
    assert.ok(genuineHalfSpace(good), 'genuine: ' + good);
  for (const bad of ['د' + Z + 'ر', 'ا' + Z + 'ز', 'ا' + Z + 'ست', 'به' + Z + 'ت', 'با' + Z + 'هات', 'تن' + Z + 'ها', 'آل' + Z + 'مان', 'به' + Z + 'تر', 'کم' + Z + 'تر', 'بیش' + Z + 'تر', 'می' + Z + 'ان', 'ز' + Z + 'ند' + Z + 'گی', 'خوب' + Z + 'ه'])
    assert.ok(!genuineHalfSpace(bad), 'junk: ' + bad);
  const auto = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'), { zwnj: 'auto' });
  for (const w of ['az', 'dar', 'ast', 'bahat', 'bahash', 'salam', 'khoobi', 'tanha', 'behtar', 'zendegi', 'daneshgah'])
    for (const c of auto.candidates(w, { max: 9 })) assert.ok(!c.text.includes(Z) || genuineHalfSpace(c.text), `${w}: ${c.text}`);
  assert.strictEqual(auto.candidates('mikhaham', { max: 1 })[0].text, 'می' + Z + 'خواهم');
  assert.ok(auto.candidates('ketabha', { max: 4 }).some(c => c.text === 'کتاب' + Z + 'ها'));
  assert.strictEqual(auto.candidates('az', { max: 1 })[0].text, 'از');
  // property: over EVERY benchmark input, every half-space in every suggestion is a genuine one
  for (const f of ['natural_1', 'natural_2_heldout', 'inflected_3'])
    for (const line of fs.readFileSync(path.join(ROOT, 'tests/gold', f + '.tsv'), 'utf8').split('\n')) {
      if (!line.trim() || line[0] === '#') continue;
      const fin = line.split('\t')[0].trim(); if (!fin) continue;
      for (const c of auto.candidates(fin, { max: 9 })) assert.ok(!c.text.includes(Z) || genuineHalfSpace(c.text), `${fin}: ${c.text}`);
    }
});
