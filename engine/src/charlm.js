'use strict';
/**
 * Character trigram language model over Persian letters (interpolated absolute discounting).
 * Trained from the lexicon at load time. Gives P(word) for strings the lexicon has never seen — used by the
 * out-of-vocabulary path and to blend with the word-frequency prior for rare words.
 */
const { PERSIAN_LETTERS, ZWNJ } = require('./alphabet');

const START = 0, END = 1;
const ALPHA = ['^', '$'].concat(PERSIAN_LETTERS.split(''));
const V = ALPHA.length;
const IDX = new Map(ALPHA.map((c, i) => [c, i]));

class CharLM {
  constructor(discount) {
    this.D = discount || 0.75;
    this.tri = new Float32Array(V * V * V);
    this.bi = new Float32Array(V * V);
    this.uni = new Float32Array(V);
    this.triN = new Float32Array(V * V);     // N(ab·)
    this.triT = new Float32Array(V * V);     // distinct continuations of ab
    this.biN = new Float32Array(V);
    this.biT = new Float32Array(V);
    this.total = 0;
    this._pu = null;
  }

  /** words: array of strings; weights: optional Float array (same length) */
  train(words, weights) {
    for (let w = 0; w < words.length; w++) {
      const word = words[w].split(ZWNJ).join('');
      const wt = weights ? weights[w] : 1;
      if (!word) continue;
      const ids = [START, START];
      let ok = true;
      for (const ch of word) { const k = IDX.get(ch); if (k === undefined) { ok = false; break; } ids.push(k); }
      if (!ok) continue;
      ids.push(END);
      for (let i = 2; i < ids.length; i++) {
        const a = ids[i - 2], b = ids[i - 1], c = ids[i];
        const ti = (a * V + b) * V + c;
        if (this.tri[ti] === 0) this.triT[a * V + b] += 1;
        this.tri[ti] += wt; this.triN[a * V + b] += wt;
        const bi = b * V + c;
        if (this.bi[bi] === 0) this.biT[b] += 1;
        this.bi[bi] += wt; this.biN[b] += wt;
        this.uni[c] += wt; this.total += wt;
      }
    }
    this._pu = new Float64Array(V);
    for (let c = 0; c < V; c++) this._pu[c] = (this.uni[c] + 0.01) / (this.total + 0.01 * V);
  }

  /** ln P(c | a b) */
  logProb(a, b, c) {
    const D = this.D;
    const pu = this._pu[c];
    const nb = this.biN[b];
    let pb = pu;
    if (nb > 0) pb = Math.max(this.bi[b * V + c] - D, 0) / nb + (D * this.biT[b] / nb) * pu;
    const nt = this.triN[a * V + b];
    let pt = pb;
    if (nt > 0) pt = Math.max(this.tri[(a * V + b) * V + c] - D, 0) / nt + (D * this.triT[a * V + b] / nt) * pb;
    return Math.log(pt);
  }

  /** ln P(word) including the end symbol; -Infinity if the word has characters outside the alphabet */
  logProbWord(word) {
    word = word.split(ZWNJ).join('');
    let a = START, b = START, lp = 0;
    for (const ch of word) {
      const c = IDX.get(ch);
      if (c === undefined) return -Infinity;
      lp += this.logProb(a, b, c);
      a = b; b = c;
    }
    return lp + this.logProb(a, b, END);
  }
}

module.exports = { CharLM, ALPHA, IDX, START, END, V };
