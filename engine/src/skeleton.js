'use strict';
/**
 * Candidate RETRIEVAL: turn what the user typed into the set of consonant-skeleton keys it could stand for.
 * Every lexicon word is indexed under its own skeleton (see alphabet.js), so a Finglish spelling finds
 * every word whose consonants match, whatever vowels were or weren't typed.
 *
 * Typed unit        -> skeleton class(es)
 *   kh sh ch zh gh  -> X Y C W Q          (digraph; a split reading k+h etc. is also explored)
 *   h               -> H or nothing       (ح  or  the vowel-ish ه)
 *   j               -> J or W             (ج or ژ)         z -> Z or W
 *   g               -> G or Q             (گ or غ/ق)       c -> K, C or S   (computer / cheshm / merci)
 *   a e i o u y v w ' -> nothing          (weak: vowels and glides)
 *   x               -> X (خ) or KS (taxi);  trailing -an may be tanvin (lotfan), so a variant without final N is added
 *   doubled consonant -> collapsed, or kept doubled
 */
const VOWELISH = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'v', 'w', "'", '`']);
const SINGLE = {
  b: ['B'], p: ['P'], t: ['T'], s: ['S'], j: ['J', 'W'], c: ['K', 'C', 'S'], d: ['D'], z: ['Z', 'W'],
  r: ['R'], f: ['F'], g: ['G', 'Q'], k: ['K'], l: ['L'], m: ['M'], n: ['N'], q: ['Q'], x: ['X', 'KS'], h: ['H', ''],
};
const DIGRAPH = { kh: 'X', sh: 'Y', ch: 'C', zh: 'W', gh: 'Q' };

function inputVariants(x, maxVariants) {
  maxVariants = maxVariants || 96;
  const out = new Set();
  const n = x.length;
  (function rec(i, key) {
    if (out.size >= maxVariants) return;
    if (i >= n) { out.add(key); return; }
    const c = x[i];
    if (VOWELISH.has(c)) { rec(i + 1, key); return; }
    const d = x.substr(i, 2);
    if (DIGRAPH[d]) {
      rec(i + 2, key + DIGRAPH[d]);          // primary reading
      // split reading: first letter alone, the h is then read as a lone 'h'
      const first = SINGLE[d[0]];
      if (first) for (const f of first) rec(i + 1, key + f);
      return;
    }
    if (d === 'th') { rec(i + 2, key + 'S'); }
    const opts = SINGLE[c];
    if (!opts) { rec(i + 1, key); return; }   // unknown character: ignore
    // doubled consonant: collapse or keep
    if (i > 0 && x[i - 1] === c) {
      rec(i + 1, key);
      for (const o of opts) rec(i + 1, key + o);
      return;
    }
    for (const o of opts) rec(i + 1, key + o);
  })(0, '');
  // tanvin: lotfan, aslan, hatman, masalan -> لطفا، اصلا ... the typed final 'n' is not a letter
  if (/[^aeiou']an$/.test(x)) {
    for (const k of Array.from(out)) if (k.endsWith('N')) out.add(k.slice(0, -1));
  }
  return Array.from(out);
}

module.exports = { inputVariants, SINGLE, DIGRAPH, VOWELISH };
