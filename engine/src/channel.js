'use strict';
/**
 * The CHANNEL MODEL: how a Persian word is (noisily) typed on a Latin keyboard.
 *
 *   cost(latin | word)  =  min over alignments of  Σ emission costs         (costs are -ln p, in nats)
 *
 * An alignment walks the Persian letters left to right. Each letter "emits" a Latin chunk (possibly empty),
 * and between two letters a typist may also type an unwritten short vowel ("slot insertion").
 * All numbers below are hand-set priors from Finglish conventions, then tuned against a benchmark
 * (see tests/ and docs/ENGINE.md). Everything lives in plain tables so it can be inspected and tuned.
 *
 * Emission option format:  [chunk, cost, nextInputChars?, mustEndInput?]
 *    nextInputChars : the chunk only applies if the following typed character is one of these
 *    mustEndInput   : the chunk only applies at the very end of the typed text
 */
const { ZWNJ, letterClass } = require('./alphabet');

const DEFAULT_PARAMS = {
  altScale: 1.0,       // multiplier for non-primary consonant spellings (x for خ, q for ق, ...)
  omitScale: 0.8,      // multiplier for "letter typed as nothing" options
  vowelScale: 1.5625,     // multiplier for vowel-letter spellings
  insScale: 1.25,       // multiplier for typed-but-unwritten short vowels
  doubleCost: 0.8,     // extra cost when a consonant is typed twice
  ezafeCost: 2.75,      // trailing 'e' that is not a letter (ezafe)
  lazyOmit: 0.2,       // omission-cost factor when NO vowels were typed at all ("slm", "ktb")
  sparseOmit: 0.55,    // ... when vowels are sparse (< 1 per 5 chars)
  ayPenalty: 1.875,      // a typed 'a' that is NOT the alef, directly before a glide 'y'  (chay != چی)
  apostrophe: 1.6,     // a typed ' that matches no letter
  hintScale: 1.0,      // strength of pronunciation hints (0 = ignore them); see tools/hints.py
};

// pronunciation-hint adjustments (nats), multiplied by hintScale. Negative = reward.
const HINT = { slotMatch: -0.30, slotMismatch: 0.90, slotExtra: 0.40, ownMatch: -0.15, ownMismatch: 0.60, roleMatch: -0.10, roleMismatch: 0.50 };

// vowel quality of a typed chunk / of a hinted phoneme: 'a' 'e' 'o' or null
function typedQuality(chunk) {
  switch (chunk) {
    case 'a': case 'aa': case 'an': case 'ah': return 'a';
    case 'e': case 'ee': case 'i': case 'ii': case 'ei': case 'eh': return 'e';
    case 'o': case 'oo': case 'u': case 'ou': case 'ooo': return 'o';
    default: return null;
  }
}
function hintQuality(c) {
  switch (c) { case 'A': case 'a': return 'a'; case 'e': case 'i': return 'e'; case 'o': case 'u': return 'o'; default: return null; }
}
/** role of a typed chunk for a vowel-ish letter: V vowel, C consonant, S silent */
function typedRole(chunk) {
  if (chunk === '') return 'S';
  if (chunk === 'v' || chunk === 'w' || chunk === 'vv' || chunk === 'y' || chunk === 'yy' || chunk === 'h' || chunk === 'hh' || chunk === "'") return 'C';
  return 'V';
}

// ---- consonants: letter -> [[chunk, cost, nextInputChars?], ...] ----------------------------------------------
const CONS = {
  'ب': [['b', 0.05]],
  'پ': [['p', 0.05]],
  'ت': [['t', 0.05]],
  'ث': [['s', 0.2]],
  'ج': [['j', 0.05]],
  'چ': [['ch', 0.12], ['c', 2.6]],
  'ح': [['h', 0.25]],
  'خ': [['kh', 0.15], ['x', 1.8]],
  'د': [['d', 0.05]],
  'ذ': [['z', 0.25]],
  'ر': [['r', 0.05]],
  'ز': [['z', 0.08]],
  'ژ': [['zh', 0.35], ['j', 1.3], ['z', 2.2]],
  'س': [['s', 0.08], ['c', 2.0, 'eiy']],
  'ش': [['sh', 0.1], ['s', 3.8]],
  'ص': [['s', 0.25]],
  'ض': [['z', 0.3]],
  'ط': [['t', 0.25]],
  'ظ': [['z', 0.3]],
  'غ': [['gh', 0.45], ['q', 1.2], ['g', 2.5]],
  'ف': [['f', 0.05]],
  'ق': [['gh', 0.6], ['q', 0.8], ['g', 2.8]],
  'ک': [['k', 0.05], ['c', 2.8]],
  'گ': [['g', 0.05]],
  'ل': [['l', 0.03]],
  'م': [['m', 0.03]],
  'ن': [['n', 0.03]],
};
// the first entry of each list is the "primary" spelling; the rest are scaled by altScale.

// ---- vowel-ish letters: function of context -> options ------------------------------------------------------
function weakOptions(ch, prevC, nextC, first, last) {
  const afterVowelLetter = prevC === 'A' || prevC === 'V' || prevC === 'Y';
  switch (ch) {
    case 'ا':
      if (first || prevC === 'Z')
        return [['a', .75], ['e', 1.2], ['o', 1.3], ['aa', 1.8], ['i', 3.2], ['u', 3.4], ['', 2.2], ["'", 2.0], ['an', 2.4, undefined, true]];
      if (last) return [['a', .5], ['aa', 1.0], ['', 2.0], ['e', 2.8], ['o', 2.6], ['an', 1.2, undefined, true]];
      return [['a', .55], ['aa', .9], ['', 2.0], ['e', 2.6], ['o', 2.8], ['u', 3.2]];
    case 'آ':
      return [['aa', .6], ['a', .55], ['', 2.2], ["a'", 3.2]];
    case 'و': {
      let o = [['oo', .8], ['u', .9], ['o', 1.0], ['v', .35], ['ou', 1.8], ['w', 1.7], ['ow', 3.0], ['', 2.0], ['vv', 1.15], ['ooo', 2.5]];
      if (prevC === 'C' && nextC === 'A') o.push(['v', .15]);
      if (afterVowelLetter) o.push(['v', .25]);
      if (first) { o = o.filter(q => q[0] !== ''); o.push(['v', .15], ['o', 1.4], ['', 3.2]); }   // a silent initial و is almost never typed (وشما)
      if (first && last) o = [['o', .4], ['va', .5], ['u', 1.5], ['vo', 2.0], ['oo', 1.8], ['v', 2.5]];
      if (last && !first) o.push(['oo', .75], ['u', .85]);
      return o;
    }
    case 'ی': {
      let o = [['i', .55], ['ee', .8], ['y', .5], ['e', 2.0], ['iy', 1.1], ['ey', 1.8], ['ei', 2.0], ['', 2.2], ['ii', 1.6], ['ay', 2.4], ['yy', 1.3]];
      if (last) o = [['i', .5], ['y', 1.1], ['ee', 1.0], ['e', 1.9], ['', 2.0], ['iy', 1.5], ['ei', 2.2]];
      if (afterVowelLetter) o.push(['y', .3], ['yi', 1.3]);
      if (nextC === 'A') o.push(['iy', .7], ['y', .3]);
      if (first) { o = o.filter(q => q[0] !== ''); o.push(['y', .2], ['', 3.0]); }
      return o;
    }
    case 'ه':
      if (last || nextC === 'Z') return [['e', .65], ['eh', .95], ['a', 1.4], ['h', .9], ['', 2.0], ['ah', 2.2], ['o', 3.0]];
      if (first) return [['h', .2], ['', 2.5], ['hh', 1.0]];
      return [['h', .3], ['', 2.4], ['e', (nextC === 'A' || nextC === 'Y') ? 1.0 : 3.2], ['eh', 3.5], ['hh', 1.1]];
    case 'ع':
      if (first) return [["'", .9], ['a', .9], ['e', 1.5], ['o', 1.6], ['', 1.6], ['aa', 2.4], ['u', 2.8]];
      if (last) return [["'", .9], ['', .9], ['a', 2.4]];
      return [["'", .9], ['a', 1.0], ['ae', .8], ['', 1.1], ['e', 1.9], ['o', 2.1], ['aa', 2.8]];
    case 'ء': return [["'", .7], ['', .7], ['a', 2.2], ['e', 2.2], ['o', 2.4]];
    case 'ئ': return [['e', 1.0], ["'", .9], ['i', 1.1], ['y', 1.6], ['', 1.1], ['a', 2.5], ['ee', 2.0], ['ae', 2.2]];
    case 'ؤ': return [['o', 1.0], ['u', 1.2], ["'", 1.2], ['oo', 1.4], ['', 1.2], ['v', 2.2]];
    case 'أ': return [['a', .9], ["'a", 1.0], ["a'", 1.0], ['', 1.5], ['o', 1.8], ['e', 1.8]];
    case 'إ': return [['e', .9], ['i', 1.3], ["'e", 1.1], ['', 1.5], ['a', 2.2]];
    default: return null;
  }
}

// ---- two-letter spellings (letters -> one chunk) --------------------------------------------------------------
const PAIRS_FIRST = {                     // word-initial only
  'او': [['oo', .7], ['u', .8], ['o', .9], ['ou', 1.6], ['ow', 2.5]],
  'ای': [['i', .7], ['ee', .8], ['ey', 1.2], ['ei', 1.3], ['e', 1.4], ['ay', 2.0]],
};
const PAIRS_ANY = {                       // anywhere
  'کس': [['x', 1.0]],                     // taxi, maxi
};

// ---- unwritten short vowels typed between letters -------------------------------------------------------------
const INSERT = [['a', .9], ['e', 1.1], ['o', 1.9], ['i', 2.4], ['u', 2.6], ['aa', 2.1], ['oo', 2.4], ['ee', 2.8], ['ou', 3.0]];

function vowelStyleFactor(x, P) {
  let nv = 0;
  for (let i = 0; i < x.length; i++) { const c = x.charCodeAt(i); if (c === 97 || c === 101 || c === 105 || c === 111 || c === 117) nv++; }
  if (nv === 0) return P.lazyOmit;
  // Treat vowel density as a property of the whole spelling, not of a word
  // or alias: one explicit vowel for every four typed characters is already
  // sparse enough that omitted Persian vowel-letters are plausible.
  if (nv * 4 <= x.length) return P.sparseOmit;
  return 1;
}

function createChannel(userParams) {
  const P = Object.assign({}, DEFAULT_PARAMS, userParams || {});
  const cache = new Map();

  function build(ch, prevC, nextC, first, last) {
    let list;
    if (ch === ZWNJ) return [['', 0]];
    const cons = CONS[ch];
    if (cons) {
      list = [];
      cons.forEach((o, idx) => {
        const c = idx === 0 ? o[1] : o[1] * P.altScale;
        list.push([o[0], c, o[2]]);
        if (o[0].length === 1) list.push([o[0] + o[0], c + P.doubleCost, o[2]]);   // typed twice
      });
      return list;
    }
    const w = weakOptions(ch, prevC, nextC, first, last);
    if (!w) return [];
    // keep the cheapest cost when a chunk is listed twice by the context additions
    const seen = new Map();
    for (const o of w) {
      const c = o[0] === '' ? o[1] * P.omitScale : o[1] * P.vowelScale;
      const k = o[0] + '|' + (o[2] || '') + '|' + (o[3] ? 1 : 0);
      if (!seen.has(k) || seen.get(k)[1] > c) seen.set(k, [o[0], c, o[2], o[3]]);
    }
    return Array.from(seen.values());
  }

  /** Emission options for letter `ch` given its neighbours (prevCh/nextCh may be ''). Cached. */
  function optionsFor(ch, prevCh, nextCh, first, last) {
    const prevC = letterClass(prevCh), nextC = letterClass(nextCh);
    const sp = (ch === 'و' && prevCh === 'خ' && nextCh === 'ا') ? 'x' : '';
    const key = ch + prevC + nextC + (first ? 1 : 0) + (last ? 1 : 0) + sp;
    let v = cache.get(key);
    if (!v) {
      v = build(ch, prevC, nextC, first, last);
      if (sp) v = v.filter(o => o[0] !== '').concat([['', .15]]);   // the و of خوا- is not pronounced
      cache.set(key, v);
    }
    return v;
  }

  function emissions(word, j) {
    const prevCh = j > 0 ? word[j - 1] : '';
    const nextCh = j + 1 < word.length ? word[j + 1] : '';
    const first = j === 0 || letterClass(prevCh) === 'Z', last = j === word.length - 1;
    return optionsFor(word[j], prevCh, nextCh, first, last);
  }

  function insertionAllowed(word, j) {
    // slot between letter j-1 and letter j (0 < j < m)
    const a = letterClass(word[j - 1]), b = letterClass(word[j]);
    if (a === 'Z' || b === 'Z' || a === 'A' || b === 'A' || a === '^' || b === '^') return false;
    return true;
  }

  /**
   * Minimum channel cost to type `x` for Persian `word`. Returns Infinity when impossible.
   * `trace` (optional array) receives the winning alignment for debugging.
   */
  function cost(word, x, trace, hints) {
    if (!hints || !hints.length || !P.hintScale) return run(word, x, trace, null);
    let best = Infinity, bestTrace = null;
    for (const h of hints) {
      const t = trace ? [] : null;
      const c = run(word, x, t, h);
      if (c < best) { best = c; bestTrace = t; }
    }
    if (trace && bestTrace) trace.push(...bestTrace);
    return best;
  }

  function slotAdjust(hint, m, j, chunk) {
    const tq = typedQuality(chunk);
    if (!tq) return 0;
    const e = hint[j];
    if (e === '-') return HINT.slotExtra * P.hintScale;
    return (hintQuality(e) === tq ? HINT.slotMatch : HINT.slotMismatch) * P.hintScale;
  }

  function ownAdjust(hint, m, j, ch, chunk) {
    const own = hint[m + 1 + j];
    if (own === '-' || own === undefined) return 0;
    const role = typedRole(chunk);
    const hr = own === 's' ? 'S' : own === 'c' ? 'C' : 'V';
    if (ch === 'ا' || ch === 'ع' || ch === 'آ') {
      if (role === 'V' && hr === 'V') {
        const tq = typedQuality(chunk), hq = hintQuality(own);
        if (!tq || !hq) return 0;
        return (tq === hq ? HINT.ownMatch : HINT.ownMismatch) * P.hintScale;
      }
      return 0;                     // typed nothing / apostrophe for these letters: no opinion
    }
    if (ch === 'و' || ch === 'ی' || ch === 'ه') return (role === hr ? HINT.roleMatch : HINT.roleMismatch) * P.hintScale;
    return 0;
  }

  function run(word, x, trace, hint) {
    const m = word.length, n = x.length;
    const W = n + 1;
    const INF = Infinity;
    const omitF = vowelStyleFactor(x, P);
    // A[j][i]: letters 0..j-1 emitted, i chars consumed, arrived by a letter emission (insertion at slot j still allowed)
    // B[j][i]: same but an insertion at slot j has just been made (no second insertion)
    const A = new Float64Array((m + 1) * W).fill(INF);
    const B = new Float64Array((m + 1) * W).fill(INF);
    const bpA = trace ? new Array((m + 1) * W) : null;
    const bpB = trace ? new Array((m + 1) * W) : null;
    A[0] = 0;
    for (let j = 0; j <= m; j++) {
      const slotOK = j > 0 && j < m && insertionAllowed(word, j);
      // 1. slot insertions: typed vowels with no letter, and stray apostrophes
      if (j > 0 && j < m) {
        for (let i = 0; i < n; i++) {
          const base = A[j * W + i];
          if (base === INF) continue;
          if (slotOK) {
            for (const [chunk, c0] of INSERT) {
              if (x.startsWith(chunk, i)) {
                // A sparse typed vowel is more likely a Persian short vowel
                // that is not written than an explicit long-vowel letter.
                // Make that interpretation cheaper for the insertion path as
                // well as for omitted vowel letters (zahr -> زهر, not ظاهر).
                const c = base + c0 * P.insScale * Math.min(1, omitF) + (hint ? slotAdjust(hint, m, j, chunk) : 0);
                const t = j * W + i + chunk.length;
                if (c < B[t]) { B[t] = c; if (trace) bpB[t] = [j * W + i, 'ins:' + chunk]; }
              }
            }
          }
          if (x.charCodeAt(i) === 39) {
            const c = base + P.apostrophe, t = j * W + i + 1;
            if (c < B[t]) { B[t] = c; if (trace) bpB[t] = [j * W + i, "ins:'"]; }
          }
        }
      }
      if (j === m) {
        // end-of-word slot: ezafe 'e' / 'ye'
        for (let i = 0; i < n; i++) {
          const base = A[m * W + i];
          if (base === INF) continue;
          const lastC = m > 0 ? letterClass(word[m - 1]) : '^';
          if (x.startsWith('e', i)) {
            const c = base + P.ezafeCost, t = m * W + i + 1;
            if (c < B[t]) { B[t] = c; if (trace) bpB[t] = [m * W + i, 'ezafe:e']; }
          }
          if ((lastC === 'A' || lastC === 'V' || lastC === 'H') && x.startsWith('ye', i)) {
            const c = base + P.ezafeCost + 0.3, t = m * W + i + 2;
            if (c < B[t]) { B[t] = c; if (trace) bpB[t] = [m * W + i, 'ezafe:ye']; }
          }
        }
        break;
      }
      // 2. letter emissions from either A or B
      const ch = word[j];
      const opts = emissions(word, j);
      const prevLetter = j > 0 ? word[j - 1] : '';
      const pair = (j === 0 || letterClass(prevLetter) === 'Z') && j + 1 < m ? PAIRS_FIRST[ch + word[j + 1]] : undefined;
      const pair2 = j + 1 < m ? PAIRS_ANY[ch + word[j + 1]] : undefined;
      for (let i = 0; i <= n; i++) {
        let base = A[j * W + i], from = 0;
        const bb = B[j * W + i];
        if (bb < base) { base = bb; from = 1; }
        if (base === INF) continue;
        const src = j * W + i;
        for (const o of opts) {
          const chunk = o[0];
          let oc = o[1];
          if (chunk.length) { if (!x.startsWith(chunk, i)) continue; } else oc *= omitF;
          if (o[2] !== undefined && !(i + chunk.length < n && o[2].indexOf(x[i + chunk.length]) >= 0)) continue;
          if (o[3] && i + chunk.length !== n) continue;
          // 'a' that is not the alef, immediately before a glide y:  chay -> چای, not چی
          if (ch === 'ی' && chunk === 'y' && i > 0 && x.charCodeAt(i - 1) === 97 && prevLetter !== 'ا') oc += P.ayPenalty;
          if (hint) oc += ownAdjust(hint, m, j, ch, chunk);
          const t = (j + 1) * W + i + chunk.length;
          const c = base + oc;
          if (c < A[t]) { A[t] = c; if (trace) bpA[t] = [src, from, ch + '=' + chunk]; }
        }
        if (pair) {
          for (const o of pair) {
            if (x.startsWith(o[0], i)) {
              const t = (j + 2) * W + i + o[0].length;
              const c = base + o[1];
              if (c < A[t]) { A[t] = c; if (trace) bpA[t] = [src, from, ch + word[j + 1] + '=' + o[0]]; }
            }
          }
        }
        if (pair2) {
          for (const o of pair2) {
            if (x.startsWith(o[0], i)) {
              const t = (j + 2) * W + i + o[0].length;
              const c = base + o[1];
              if (c < A[t]) { A[t] = c; if (trace) bpA[t] = [src, from, ch + word[j + 1] + '=' + o[0]]; }
            }
          }
        }
      }
    }
    const end = m * W + n;
    const res = Math.min(A[end], B[end]);
    if (trace && res !== INF) {
      let idx = end, useB = B[end] < A[end];
      const steps = [];
      for (let guard = 0; guard < 200; guard++) {
        if (idx === 0 && !useB) break;
        const bp = useB ? bpB[idx] : bpA[idx];
        if (!bp) break;
        if (useB) { steps.push(bp[1]); idx = bp[0]; useB = false; }
        else { steps.push(bp[2]); idx = bp[0]; useB = bp[1] === 1; }
      }
      trace.push(...steps.reverse());
    }
    return res;
  }

  return { cost, emissions, optionsFor, params: P };
}

module.exports = { createChannel, DEFAULT_PARAMS, CONS, PAIRS_FIRST, PAIRS_ANY, INSERT, weakOptions };
