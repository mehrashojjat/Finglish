'use strict';
/**
 * Offline transliteration engine: Latin ("Finglish") -> ranked Persian candidates.
 *
 *   score(w | x) = -channelCost(x | w)  +  lambda * ln P(w)               (higher is better)
 *   P(w)         = (1-rho) * P_lexicon(w)  +  rho * P_charLM(w)           (mixture: known words + brand-new words)
 *
 *   1. retrieval : skeleton keys of x  ->  candidate words from the lexicon index           (skeleton.js, lexicon.js)
 *   2. proposals : beam search with the char-LM for words the lexicon doesn't have           (oov.js, charlm.js)
 *   3. scoring   : exact channel alignment DP for every candidate                            (channel.js)
 *   4. ranking   : sort, de-duplicate, apply the ZWNJ policy
 */
const { Lexicon, genuineHalfSpace } = require('./lexicon');
const { createChannel } = require('./channel');
const { inputVariants } = require('./skeleton');
const { normalizeLatin, normalizePersian, stripZwnj } = require('./normalize');
const { CharLM } = require('./charlm');
const { createOOV } = require('./oov');
const { SUFFIXES, attach } = require('./morph');
const { letterAlternatives, literalSpelling } = require('./letters');

const DEFAULTS = {
  lambda: 0.512,        // weight of the language-model prior against the channel
  maxPerKey: 400,       // candidates scored per skeleton bucket
  zwnj: 'off',          // 'off' = never emit U+200C (joined letters); 'auto' = use the orthographic form when known
  oov: true,            // propose words that are not in the lexicon
  rho: 0.03,            // prior probability that the intended word is outside the lexicon
  beam: 90,
  oovMax: 24,
  pruneGap: 6.0,        // drop candidates scoring more than this below the best (keeps >= minKeep); 0 = off
  minKeep: 5,
  ctxWeight: 1.0,       // how strongly the previous word steers ranking (0 = ignore context)
  ctxK: 30,             // bigram smoothing: weight of the bigram estimate = n / (n + ctxK), capped at 0.6
  morph: true,          // base word + clitic candidates for unseen inflected forms
  morphRho: 0.1,        // prior mass of the morphological generator (vs the char-LM's rho)
  letters: true,        // a lone key (s, h, sh…) lists the letter itself first; every input ends with its letter-by-letter spelling (letters.js)
};

const lse = (a, b) => (a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b)));

class Engine {
  constructor(lexicon, options) {
    this.lex = lexicon;
    this.opt = Object.assign({}, DEFAULTS, options || {});
    this.channel = createChannel(this.opt.channel);
    // Small hosts such as iOS keyboard extensions can opt out of the
    // language-model/OOV path. Avoid allocating and training it at all in
    // that mode; the normal/default engine remains unchanged.
    this.lm = (this.opt.oov || this.opt.morph) ? new CharLM() : null;
    if (this.lm) this.lm.train(lexicon.words);
    this.oov = this.opt.oov ? createOOV(this.channel, this.lm) : null;
    this.lnRho = Math.log(this.opt.rho);
    this.lnNotRho = Math.log(1 - this.opt.rho);
    this.user = new Map();      // personalisation: "latin|persian" -> count
    this.aliases = new Map();   // built-in exact shortcuts   latin -> [persian, ...]
    this.userAliases = new Map();   // the user's own shortcuts (win over built-in)
    this.bi = null;             // bigram model: prev word -> { n, next: Map(word -> count) }
  }

  /** Load bigrams: lines "prev<TAB>count(prev)<TAB>w1:c1 w2:c2 ..." (see tools/build_bigrams.py). */
  setBigrams(tsv) {
    const bi = new Map();
    for (const line of String(tsv).split('\n')) {
      if (!line) continue;
      const p = line.split('\t');
      if (p.length < 3) continue;
      const next = new Map();
      for (const pair of p[2].split(' ')) {
        const i = pair.lastIndexOf(':');
        if (i > 0) next.set(pair.slice(0, i), +pair.slice(i + 1));
      }
      bi.set(p[0], { n: +p[1], next });
    }
    this.bi = bi;
  }

  /** ln P(word | prev), interpolated with the unigram logp `lp`; falls back to `lp` when prev is unknown. */
  _ctxLogp(prevInfo, wordKey, lp) {
    if (!prevInfo) return lp;
    const { n, next } = prevInfo;
    const w = Math.min(0.6, n / (n + this.opt.ctxK));
    const c = next.get(wordKey) || 0;
    const p = w * (c / n) + (1 - w) * Math.exp(lp);
    return lp + this.opt.ctxWeight * (Math.log(p) - lp);
  }

  /** Parse "latin<TAB>persian|persian2" lines (# = comment) into a Map. */
  static parseAliases(tsv) {
    const m = new Map();
    for (const line of String(tsv).split('\n')) {
      if (!line.trim() || line[0] === '#') continue;
      const i = line.search(/\t| {2,}/);
      if (i < 0) continue;
      const key = normalizeLatin(line.slice(0, i));
      const vals = line.slice(i).trim().split('|').map(v => v.trim()).filter(Boolean);
      if (key && vals.length) m.set(key, vals);
    }
    return m;
  }
  setAliases(map) { this.aliases = map instanceof Map ? map : Engine.parseAliases(map); }
  setUserAliases(map) { this.userAliases = map instanceof Map ? map : Engine.parseAliases(map); }

  static fromTSV(tsv, options) { return new Engine(Lexicon.fromTSV(tsv), options); }

  /** Change tunable options on a live engine (used by the tuner). `channel` is merged, others replaced. */
  setOptions(partial) {
    const { channel, ...rest } = partial || {};
    Object.assign(this.opt, rest);
    if (channel) this.opt.channel = Object.assign({}, this.opt.channel || {}, channel);
    this.channel = createChannel(this.opt.channel);
    this.oov = createOOV(this.channel, this.lm);
    this.lnRho = Math.log(this.opt.rho);
    this.lnNotRho = Math.log(1 - this.opt.rho);
  }

  /** Score every lexicon candidate for typed text `x` (already normalised). */
  _lexCandidates(x, seen, prevInfo) {
    const { lex, channel, opt, lm } = this;
    const out = [];
    for (const key of inputVariants(x)) {
      const bucket = lex.index.get(key);
      if (!bucket) continue;
      const n = Math.min(bucket.length, opt.maxPerKey);
      for (let t = 0; t < n; t++) {
        const id = bucket[t];
        if (seen.has(id)) continue;
        seen.add(id);
        const w = lex.words[id];
        const c = channel.cost(w, x, null, lex.hints[id]);
        if (c === Infinity) continue;
        const lp = prevInfo ? this._ctxLogp(prevInfo, w.split('\u200c').join(''), lex.logp[id]) : lex.logp[id];
        const mix = opt.oov ? lse(this.lnNotRho + lp, this.lnRho + lm.logProbWord(w)) : lp;
        out.push({ id, text: w, cost: c, logp: lp, score: -c + opt.lambda * mix, kind: 'lex' });
      }
    }
    return out;
  }

  _oovCandidates(x, known) {
    const { lex, channel, opt, lm } = this;
    const out = [];
    for (const w of this.oov.propose(x, opt.lambda, opt.beam, opt.oovMax)) {
      if (known.has(w)) continue;
      const id = lex.byWord.get(w);
      const c = channel.cost(w, x, null, id !== undefined ? lex.hints[id] : null);
      if (c === Infinity) continue;
      const lpc = lm.logProbWord(w);
      if (id !== undefined) {
        const mix = lse(this.lnNotRho + lex.logp[id], this.lnRho + lpc);
        out.push({ id, text: w, cost: c, logp: lex.logp[id], score: -c + opt.lambda * mix, kind: 'lex' });
      } else {
        out.push({ id: -1, text: w, cost: c, logp: lpc + this.lnRho, score: -c + opt.lambda * (this.lnRho + lpc), kind: 'oov' });
      }
    }
    return out;
  }

  /** base + suffix composites that are not in the lexicon (see morph.js) */
  _morphCandidates(x, known) {
    const { lex, channel, opt, lm } = this;
    const n = x.length;
    if (n < 5) return [];
    const out = [];
    const lnMorph = Math.log(opt.morphRho);
    const headCache = new Map();
    for (let k = 3; k <= n - 1; k++) {
      const tvars = new Set(inputVariants(x.slice(k)));
      const specs = SUFFIXES.filter(sp => tvars.has(sp.key));
      if (!specs.length) continue;
      const head = x.slice(0, k);
      let heads = headCache.get(head);
      if (!heads) {
        heads = this._lexCandidates(head, new Set()).sort((a, b) => b.score - a.score).slice(0, 3);
        headCache.set(head, heads);
      }
      for (const h of heads) {
        const base = h.text.split('\u200c').join('');
        for (const sp of specs) {
          for (const [surface, pri] of attach(base, sp)) {
            if (known.has(surface) || lex.byWord.has(surface)) continue;
            const c = channel.cost(surface, x);
            if (c === Infinity) continue;
            const lpComp = h.logp + pri;
            const lpc = lm.logProbWord(surface);
            const mix = lse(this.lnRho + lpc, lnMorph + lpComp);
            out.push({ id: -1, text: surface, cost: c, logp: lpComp, score: -c + opt.lambda * mix, kind: 'morph' });
            known.add(surface);
          }
        }
      }
    }
    return out;
  }

  /**
   * @param {string} latin  what the user typed for ONE word
   * @param {{max?:number}} o
   * @returns {{text:string, score:number, cost:number, logp:number, kind:string}[]}
   */
  candidates(latin, o) {
    o = o || {};
    const max = o.max || 9;
    const x = normalizeLatin(latin);
    if (!x) return [];
    const seenIds = new Set();
    let prevInfo = null;
    if (o.prev && this.bi && this.opt.ctxWeight) {
      const toks = String(o.prev).split(/[^\u0621-\u063a\u0641-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc\u200c]+/).filter(Boolean);
      if (toks.length) prevInfo = this.bi.get(normalizePersian(toks[toks.length - 1]).split('\u200c').join('')) || null;
    }
    let c = this._lexCandidates(x, seenIds, prevInfo);
    if (this.opt.oov || this.opt.morph) {
      const known = new Set(c.map(e => e.text));
      if (this.opt.morph) c = c.concat(this._morphCandidates(x, known));
      if (this.opt.oov) c = c.concat(this._oovCandidates(x, known));
    }
    if (this.user.size) for (const e of c) {
      const u = this.user.get(x + '|' + stripZwnj(e.text));
      if (u) e.score += 1.5 * Math.log1p(u);
    }
    // exact shortcuts always rank first: the user's own, then the built-in ones
    const al = [];
    for (const map of [this.userAliases, this.aliases]) {
      const hit = map.get(x);
      if (hit) hit.forEach(t => al.push({ id: -1, text: t, cost: 0, logp: 0, score: 1e6 - al.length, kind: 'alias' }));
    }
    if (al.length) c = al.concat(c);
    c.sort((a, b) => b.score - a.score);
    const out = [];
    const seen = new Set();
    const floor = this.opt.pruneGap > 0 && c.length ? c[0].score - this.opt.pruneGap : -Infinity;
    for (const cand of c) {
      if (cand.score < floor && out.length >= this.opt.minKeep) break;
      let text = cand.text;
      if (this.opt.zwnj === 'off') text = stripZwnj(text);
      else if (cand.kind === 'lex' && cand.id >= 0 && this.lex.zw[cand.id]) text = this.lex.zw[cand.id];
      else if (text.indexOf('\u200c') >= 0 && !genuineHalfSpace(text)) text = stripZwnj(text);     // a half-space the engine itself built (morph/oov) obeys the same rule
      if (seen.has(text)) continue;
      seen.add(text);
      out.push(Object.assign({}, cand, { text }));
      if (out.length >= max) break;
    }
    return this.opt.letters ? this._withLetters(x, out, max) : out;
  }

  /**
   * The lexicon has words, not letters: a lone `s` would give اس and `h` ها. So a single key (or sh / ch / kh / gh / zh / aa / ee / oo)
   * lists its own letters first (after any alias), and every input ends with its letter-by-letter spelling — the way to type a word
   * that is in no list (the choice is then learned like any other). The spelling goes at the end: it is appended when there is room and
   * replaces the last row only of a long list (max ≥ 10) — never the first, and a short list (max < 10, benchmarks) is never trimmed.
   */
  _withLetters(x, out, max) {
    const base = out.find(c => c.kind !== 'alias');
    const top = base ? base.score : 0, low = out.length ? out[out.length - 1].score : 0;
    const mk = (text, score, kind) => ({ id: -1, text, cost: 0, logp: 0, score, kind });
    let res = out;
    const letters = letterAlternatives(x);
    if (letters.length) {
      const head = out.filter(c => c.kind === 'alias');
      const taken = new Set(head.map(c => c.text));
      const own = letters.filter(t => !taken.has(t)).map((t, i) => mk(t, top + 1 - i * 0.01, 'letter'));
      const ownText = new Set(own.map(c => c.text));
      res = head.concat(own, out.filter(c => c.kind !== 'alias' && !ownText.has(c.text))).slice(0, max);
    }
    const lit = literalSpelling(x);
    if (lit && !res.some(c => c.text === lit)) {
      if (res.length < max) res = res.concat(mk(lit, low - 1, 'literal'));
      else if (max >= 10) res = res.slice(0, max - 1).concat(mk(lit, low - 1, 'literal'));     // only the tail of a long list (the apps ask for 18); a short list is never trimmed
    }
    return res;
  }

  /** Personalisation: remember that `latin` was resolved to `persian` by the user. */
  learn(latin, persian) {
    const k = normalizeLatin(latin) + '|' + stripZwnj(persian);
    this.user.set(k, (this.user.get(k) || 0) + 1);
  }
  exportUserData() { return Array.from(this.user.entries()); }
  importUserData(entries) { this.user = new Map(entries); }
}

module.exports = { Engine, DEFAULTS };
