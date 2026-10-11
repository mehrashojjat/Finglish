#!/usr/bin/env node
'use strict';
/**
 * Freeze the behaviour of the SHIPPED engine package (engine/dist/) into tests/golden/parity_vectors.jsonl.
 * It is generated through the string host API (FarsiIME.host) — the exact calls a Swift/Kotlin/C++ host makes — so any
 * host that reproduces these lines is, by construction, running the same algorithm on the same data as the website.
 *
 *   node tools/make_parity_vectors.js          (run `npm run bundle` first; `npm run bundle` + this = `npm run parity`)
 * Each line: {"in": "...", "prev": "..."?, "out": [{"t": text, "s": score(3dp), "k": kind}, ...top 5]}
 * Conformance: `t` and `k` identical, `s` within 0.01.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'engine/dist');
global.self = global;
require(path.join(DIST, 'farsi-ime-engine.js'));
const H = global.FarsiIME.host;
const rd = f => fs.readFileSync(path.join(DIST, f), 'utf8');
H.init(rd('lexicon.tsv'), rd('bigrams.tsv'), rd('aliases.tsv'), '{}');

const inputs = new Set();
for (const f of ['natural_1.tsv', 'natural_2_heldout.tsv', 'inflected_3.tsv']) {
  for (const line of fs.readFileSync(path.join(ROOT, 'tests/gold', f), 'utf8').split('\n')) {
    if (!line.trim() || line[0] === '#') continue;
    const fin = line.split('\t')[0].trim();
    if (fin && !/\s/.test(fin)) inputs.add(fin);
  }
}
for (const w of ['slm', 'ktb', 'khbr', 'mrsi', 'zzzzzz', 'a', 'oo', "ta'sir", 'khoooobi', 'kamyar', 'whatsapp', 'Hello', 'SALAM',
                 's', 'h', 'b', 'c', 'e', 'x', 'z', 'sh', 'kh', 'gh', 'ch', 'zh', 'aa', 'ee', 'oo', 'mmd', 'mhrs', 'S']) inputs.add(w);     // single keys: the letter first
const row = (inp, prev) => {
  const out = JSON.parse(H.candidates(inp, prev || '', 5)).map(c => ({ t: c.text, s: c.score, k: c.kind }));
  return JSON.stringify(prev ? { in: inp, prev, out } : { in: inp, out });
};
const lines = Array.from(inputs).sort().map(s => row(s));
for (const [prev, s] of [['من', 'dar'], ['در', 'khane'], ['یه', 'ya'], ['سر', 'dard']]) lines.push(row(s, prev));
fs.writeFileSync(path.join(ROOT, 'tests/golden/parity_vectors.jsonl'), lines.join('\n') + '\n');
console.log(lines.length + ' vectors written from engine/dist (host API)');
