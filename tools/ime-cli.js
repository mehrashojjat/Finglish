#!/usr/bin/env node
'use strict';
// Usage: node tools/ime-cli.js [--max 9] [--explain] word1 word2 ...
const fs = require('fs');
const path = require('path');
const { Engine } = require('../engine/src/engine');

const args = process.argv.slice(2);
let max = 9, explain = false;
const words = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max') max = +args[++i];
  else if (args[i] === '--explain') explain = true;
  else words.push(args[i]);
}
const t0 = Date.now();
const tsv = fs.readFileSync(path.join(__dirname, '..', 'data', 'build', 'lexicon.tsv'), 'utf8');
const eng = Engine.fromTSV(tsv);
console.error(`loaded ${eng.lex.words.length} words in ${Date.now() - t0} ms`);
for (const w of words) {
  const t = process.hrtime.bigint();
  const c = eng.candidates(w, { max });
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`${w.padEnd(14)} ${c.map(x => x.text).join('  ')}   (${ms.toFixed(1)} ms)`);
  if (explain) for (const x of c) {
    const tr = []; eng.channel.cost(x.text, w.toLowerCase(), tr);
    console.log(`    ${x.text}  score=${x.score.toFixed(2)} cost=${x.cost.toFixed(2)} logp=${x.logp.toFixed(2)}  ${tr.join(' ')}`);
  }
}
