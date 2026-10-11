#!/usr/bin/env node
'use strict';
/**
 * Benchmark the offline engine on gold (finglish -> intended Persian) files.
 *
 *   node tests/eval.js [--gold tests/gold/natural_1.tsv ...]
 *                      [--set lambda=0.9 --set channel.altScale=1.2] [--fails 40] [--json out.json]
 *
 * Metrics: top-1 / top-3 / top-5 / top-9 accuracy and MRR (single-word items). A gold line may list several
 * acceptable answers separated by '|'. Multi-word lines are scored by joining each word's top-1.
 */
const fs = require('fs');
const path = require('path');
const { Engine } = require('../engine/src/engine');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const golds = [], sets = [];
let nFails = 30, jsonOut = null, quiet = false, lexPath = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--gold') golds.push(args[++i]);
  else if (a === '--set') sets.push(args[++i]);
  else if (a === '--fails') nFails = +args[++i];
  else if (a === '--json') jsonOut = args[++i];
  else if (a === '--quiet') quiet = true;
  else if (a === '--lexicon') lexPath = args[++i];
}
if (!golds.length) golds.push(path.join(ROOT, 'tests/gold/natural_1.tsv'));

const options = {};
for (const s of sets) {
  const [k, v] = s.split('=');
  const parts = k.split('.');
  let o = options;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
  o[parts[parts.length - 1]] = isNaN(+v) ? v : +v;
}

const strip = s => s.replace(/‌/g, '');
function loadGold(p) {
  const rows = [];
  const seen = new Set();
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [fin, fa] = line.split('\t');
    if (!fa) continue;
    const key = fin + '\t' + fa;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ fin: fin.trim(), gold: fa.split('|').map(s => strip(s.trim())) });
  }
  return rows;
}

const tsv = fs.readFileSync(lexPath || path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8');
const eng = Engine.fromTSV(tsv, options);
if (!args.includes('--no-aliases')) eng.setAliases(fs.readFileSync(path.join(ROOT, 'data/aliases.tsv'), 'utf8'));

function rankOf(list, gold) {
  for (let i = 0; i < list.length; i++) if (gold.includes(list[i])) return i + 1;
  return 0;
}
function metrics(ranks) {
  const n = ranks.length;
  const at = k => ranks.filter(r => r > 0 && r <= k).length / n;
  const mrr = ranks.reduce((s, r) => s + (r > 0 ? 1 / r : 0), 0) / n;
  return { n, top1: at(1), top3: at(3), top5: at(5), top9: at(9), mrr };
}
const pct = x => (100 * x).toFixed(1).padStart(5) + '%';
const fmt = m => `n=${String(m.n).padStart(4)}  top1 ${pct(m.top1)}  top3 ${pct(m.top3)}  top5 ${pct(m.top5)}  top9 ${pct(m.top9)}  MRR ${m.mrr.toFixed(3)}`;

const summary = {};
for (const gp of golds) {
  const rows = loadGold(gp);
  const single = rows.filter(r => !/\s/.test(r.fin));
  const multi = rows.filter(r => /\s/.test(r.fin));
  const ours = [], fails = [];
  for (const r of single) {
    const c = eng.candidates(r.fin, { max: 9 }).map(x => strip(x.text));
    const rk = rankOf(c, r.gold);
    ours.push(rk);
    if (rk !== 1) fails.push({ fin: r.fin, gold: r.gold[0], rank: rk, got: c.slice(0, 5) });
  }
  let multiOk = 0;
  for (const r of multi) {
    const joined = r.fin.split(/\s+/).map(w => (eng.candidates(w, { max: 1 })[0] || { text: w }).text).join(' ');
    if (r.gold.includes(strip(joined))) multiOk++;
  }
  const mo = metrics(ours);
  console.log(`\n== ${path.basename(gp)}`);
  console.log(' ours   ' + fmt(mo));
  if (multi.length) console.log(` phrases top-1 joined: ${multiOk}/${multi.length}`);
  summary[path.basename(gp)] = { ours: mo };
  if (!quiet) {
    fails.sort((a, b) => (b.rank === 0) - (a.rank === 0) || b.rank - a.rank);
    console.log(` -- ${Math.min(nFails, fails.length)} of ${fails.length} misses (rank 0 = absent from top 9):`);
    for (const f of fails.slice(0, nFails)) {
      console.log(`   ${f.fin.padEnd(14)} want ${f.gold.padEnd(10)} rank ${f.rank}  got: ${f.got.join(' ')}`);
    }
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
