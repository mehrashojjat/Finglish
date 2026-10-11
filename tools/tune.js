#!/usr/bin/env node
'use strict';
/**
 * Coordinate-descent tuner for engine + channel parameters.
 *   node tools/tune.js [--gold tests/gold/natural_1.tsv ...] [--rounds 3] [--write data/build/tuned.json]
 * Objective = 0.5*top1 + 0.5*MRR on the TRAIN split (hash(input) % 5 != 0); the DEV split (20%) is reported
 * before/after so over-fitting shows up immediately.
 */
const fs = require('fs');
const path = require('path');
const { Engine, DEFAULTS } = require('../engine/src/engine');
const { DEFAULT_PARAMS } = require('../engine/src/channel');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const golds = []; let rounds = 3, outFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--gold') golds.push(args[++i]);
  else if (args[i] === '--rounds') rounds = +args[++i];
  else if (args[i] === '--write') outFile = args[++i];
}
if (!golds.length) golds.push(path.join(ROOT, 'tests/gold/natural_1.tsv'));

const strip = s => s.replace(/‌/g, '');
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const train = [], dev = [];
const seen = new Set();
for (const g of golds) for (const line of fs.readFileSync(g, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [fin, fa] = line.split('\t'); if (!fa || /\s/.test(fin.trim())) continue;
  const key = fin + '\t' + fa; if (seen.has(key)) continue; seen.add(key);
  const row = { fin: fin.trim(), gold: fa.split('|').map(x => strip(x.trim())) };
  (hash(row.fin) % 5 === 0 ? dev : train).push(row);
}
console.error(`train=${train.length} dev=${dev.length}`);

const eng = Engine.fromTSV(fs.readFileSync(path.join(ROOT, 'data/build/lexicon.tsv'), 'utf8'));
eng.setAliases(fs.readFileSync(path.join(ROOT, 'data/aliases.tsv'), 'utf8'));
function evaluate(rows) {
  let t1 = 0, mrr = 0;
  for (const r of rows) {
    const c = eng.candidates(r.fin, { max: 9 }).map(x => strip(x.text));
    let rk = 0; for (let i = 0; i < c.length; i++) if (r.gold.includes(c[i])) { rk = i + 1; break; }
    if (rk === 1) t1++;
    if (rk) mrr += 1 / rk;
  }
  return { top1: t1 / rows.length, mrr: mrr / rows.length, obj: 0.5 * t1 / rows.length + 0.5 * mrr / rows.length };
}

// parameter space: name -> [path, min, max]
const SPACE = {
  lambda: [['lambda'], 0.3, 1.4],
  rho: [['rho'], 0.002, 0.2],
  altScale: [['channel', 'altScale'], 0.4, 2.0],
  omitScale: [['channel', 'omitScale'], 0.3, 2.0],
  vowelScale: [['channel', 'vowelScale'], 0.5, 1.8],
  insScale: [['channel', 'insScale'], 0.4, 1.8],
  doubleCost: [['channel', 'doubleCost'], 0.2, 2.0],
  ezafeCost: [['channel', 'ezafeCost'], 0.8, 4.0],
  lazyOmit: [['channel', 'lazyOmit'], 0.05, 1.0],
  sparseOmit: [['channel', 'sparseOmit'], 0.2, 1.2],
  ayPenalty: [['channel', 'ayPenalty'], 0, 3.0],
  hintScale: [['channel', 'hintScale'], 0.2, 3.0],
};
const cur = { lambda: DEFAULTS.lambda, rho: DEFAULTS.rho };
for (const k of Object.keys(DEFAULT_PARAMS)) cur[k] = DEFAULT_PARAMS[k];
function apply(vals) {
  const o = { channel: {} };
  for (const [name, [p]] of Object.entries(SPACE)) { if (p.length === 1) o[p[0]] = vals[name]; else o.channel[p[1]] = vals[name]; }
  eng.setOptions(o);
}
apply(cur);
const base = { train: evaluate(train), dev: evaluate(dev) };
console.error(`start  train obj=${base.train.obj.toFixed(4)} top1=${base.train.top1.toFixed(3)} | dev obj=${base.dev.obj.toFixed(4)} top1=${base.dev.top1.toFixed(3)}`);
let best = base.train.obj;
for (let r = 0; r < rounds; r++) {
  let improved = false;
  for (const name of Object.keys(SPACE)) {
    const [, lo, hi] = SPACE[name];
    for (const f of [1.25, 0.8]) {
      const trial = Object.assign({}, cur, { [name]: Math.min(hi, Math.max(lo, cur[name] * f)) });
      if (trial[name] === cur[name]) continue;
      apply(trial);
      const e = evaluate(train);
      if (e.obj > best + 1e-4) { best = e.obj; Object.assign(cur, trial); improved = true; console.error(`  round ${r + 1}: ${name} -> ${cur[name].toFixed(3)}  train obj ${best.toFixed(4)}`); break; }
    }
  }
  if (!improved) break;
}
apply(cur);
const fin = { train: evaluate(train), dev: evaluate(dev) };
console.error(`final  train obj=${fin.train.obj.toFixed(4)} top1=${fin.train.top1.toFixed(3)} | dev obj=${fin.dev.obj.toFixed(4)} top1=${fin.dev.top1.toFixed(3)}`);
console.log(JSON.stringify(cur, null, 1));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(cur, null, 1));
