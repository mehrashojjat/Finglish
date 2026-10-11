'use strict';
/**
 * Letters and letter-by-letter spelling.
 *
 * The lexicon holds words, not letters, so a lone `s` used to give اس and a lone `h` gave ها. Two helpers fix that:
 *
 *   letterAlternatives('s')  -> ['س', 'ص', 'ث', 'ش']   a single key (or sh / ch / kh / gh / zh / aa / ee / oo): the letter itself
 *                                                       first, then the other letters that sound the same. Shown BEFORE the words.
 *   literalSpelling('mhmd')  -> 'مهمد'                  every typed key turned into its own letter, in order (the "type exactly
 *                                                       what I typed" candidate), for words no list contains. Shown LAST.
 *
 * The table is our own, written from the letter correspondences in channel.js (the first letter of each list is the most frequent
 * Persian letter for that key). It is not read from any other system.
 */

const LETTERS = {
  a: ['ا', 'آ', 'ع', 'ء'],
  b: ['ب'],
  c: ['ک', 'چ', 'س'],
  d: ['د'],
  e: ['ا', 'ه', 'ی', 'ع'],
  f: ['ف'],
  g: ['گ', 'غ', 'ق'],
  h: ['ه', 'ح'],
  i: ['ی', 'ا'],
  j: ['ج', 'ژ'],
  k: ['ک'],
  l: ['ل'],
  m: ['م'],
  n: ['ن'],
  o: ['و', 'ا', 'ع'],
  p: ['پ'],
  q: ['ق', 'غ'],
  r: ['ر'],
  s: ['س', 'ص', 'ث', 'ش'],
  t: ['ت', 'ط'],
  u: ['و', 'ا'],
  v: ['و', 'ف'],
  w: ['و'],
  x: ['خ', 'کس'],
  y: ['ی'],
  z: ['ز', 'ذ', 'ض', 'ظ', 'ژ'],
  // two keys that make one letter
  sh: ['ش'],
  ch: ['چ'],
  kh: ['خ'],
  gh: ['ق', 'غ'],
  zh: ['ژ'],
  // long vowels typed doubled
  aa: ['ا', 'آ'],
  ee: ['ی', 'ای'],
  oo: ['و', 'او'],
};

/** The letters for one key / key pair, or [] when the input is anything else (a word, several keys). */
function letterAlternatives(x) {
  return Object.prototype.hasOwnProperty.call(LETTERS, x) ? LETTERS[x].slice() : [];
}

const DIGRAPHS = { sh: 'ش', ch: 'چ', kh: 'خ', gh: 'ق', zh: 'ژ', aa: 'ا', ee: 'ی', oo: 'و' };
const VOWELS = { a: 'ا', i: 'ی', o: 'و', u: 'و', y: 'ی', w: 'و', v: 'و', "'": 'ع' };   // e is a short vowel: not written, except word-final ه

/** Every key becomes its own letter, in the order typed. Short `e` is not written (mehr → مهر) unless it ends the word (bache → باچه). */
function literalSpelling(x) {
  let out = '';
  for (let i = 0; i < x.length;) {
    const two = x.slice(i, i + 2);
    if (DIGRAPHS[two]) { out += DIGRAPHS[two]; i += 2; continue; }
    const ch = x[i++];
    if (ch === 'e') { if (i === x.length) out += 'ه'; continue; }
    if (VOWELS[ch]) { out += VOWELS[ch]; continue; }
    if (LETTERS[ch]) out += LETTERS[ch][0];
  }
  return out;
}

module.exports = { LETTERS, letterAlternatives, literalSpelling };
