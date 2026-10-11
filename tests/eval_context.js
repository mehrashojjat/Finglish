#!/usr/bin/env node
'use strict';
/**
 * Does previous-word context help?  node tests/eval_context.js [--set k=v ...] [--fails 15]
 * Walks tests/gold/sentences_4.tsv; for every token the engine is asked with and without
 * prev = the gold Persian token before it (teacher forcing, as when the user has just committed it).
 */
const fs = require('fs');
const path = require('path');
const { Engine } = require('../engine/src/engine');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const sets = []; let nFails = 15;
for (let i = 0; i < args.length; i++) { if (args[i] === '--set') sets.push(args[++i]); else if (args[i] === '--fails') nFails = +args[++i]; }
const options = {};
for (const s of sets) { const [k, v] = s.split('='); const parts = k.split('.'); let o = options; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {}; o[parts[parts.length - 1]] = isNaN(+v) ? v : +v; }

const eng = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'), options);
eng.setAliases(fs.readFileSync(path.join(ROOT, 'data/aliases.tsv'), 'utf8'));
const bg = path.join(ROOT, 'data/build/bigrams.tsv');
if (fs.existsSync(bg)) eng.setBigrams(fs.readFileSync(bg, 'utf8'));
else console.error('(no data/build/bigrams.tsv yet: context runs will equal the baseline)');

const strip = s => s.replace(/‌/g, '');
const stat = { n: 0, base1: 0, ctx1: 0, baseMrr: 0, ctxMrr: 0 };
const diffs = [];
for (const line of fs.readFileSync(path.join(ROOT, 'tests/gold/sentences_4.tsv'), 'utf8').split('\n')) {
  if (!line.trim() || line[0] === '#') continue;
  const [fin, fa] = line.split('\t');
  const fw = fin.split(/\s+/), pw = fa.split(/\s+/);
  for (let i = 0; i < fw.length; i++) {
    const prev = i > 0 ? pw[i - 1] : null;
    const rank = (list) => { const k = list.map(c => strip(c.text)).indexOf(strip(pw[i])); return k < 0 ? 0 : k + 1; };
    const r0 = rank(eng.candidates(fw[i], { max: 9 }));
    const r1 = rank(eng.candidates(fw[i], { max: 9, prev }));
    stat.n++; stat.base1 += r0 === 1; stat.ctx1 += r1 === 1;
    stat.baseMrr += r0 ? 1 / r0 : 0; stat.ctxMrr += r1 ? 1 / r1 : 0;
    if (r0 !== r1) diffs.push(`${(prev || '^').padEnd(8)} ${fw[i].padEnd(10)} want ${pw[i].padEnd(8)} rank ${r0} -> ${r1}`);
  }
}
const p = x => (100 * x / stat.n).toFixed(1) + '%';
console.log(`tokens=${stat.n}   no-context top1 ${p(stat.base1)} MRR ${(stat.baseMrr / stat.n).toFixed(3)}   with-context top1 ${p(stat.ctx1)} MRR ${(stat.ctxMrr / stat.n).toFixed(3)}`);
diffs.slice(0, nFails).forEach(d => console.log('  ' + d));
