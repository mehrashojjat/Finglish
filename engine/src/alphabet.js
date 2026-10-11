'use strict';
/**
 * Persian alphabet facts shared by every other engine module.
 *
 * Key idea ("skeleton"): Persian script writes consonants and long vowels but NOT short vowels, and
 * Finglish typists are inconsistent about vowels. So we split letters in two groups:
 *   STRONG  – consonants that are (almost) always typed as a consonant. They survive into the skeleton key,
 *             merged into classes of letters that Finglish cannot tell apart (س/ص/ث -> S, ز/ذ/ض/ظ -> Z, ...).
 *   WEAK    – vowel-ish letters (ا آ و ی ه ع ء ئ ؤ أ إ) that may be typed as a vowel, a glide, or not at all.
 *             They are dropped from the skeleton.
 */

const ZWNJ = '‌';

const STRONG = {
  'ب': 'B', 'پ': 'P', 'ت': 'T', 'ط': 'T', 'ث': 'S', 'س': 'S', 'ص': 'S', 'ج': 'J', 'چ': 'C',
  'ح': 'H', 'خ': 'X', 'د': 'D', 'ذ': 'Z', 'ز': 'Z', 'ض': 'Z', 'ظ': 'Z', 'ر': 'R', 'ژ': 'W',
  'ش': 'Y', 'غ': 'Q', 'ق': 'Q', 'ف': 'F', 'ک': 'K', 'گ': 'G', 'ل': 'L', 'م': 'M', 'ن': 'N',
};

const WEAK = new Set(['ا', 'آ', 'أ', 'إ', 'ؤ', 'ئ', 'ء', 'ع', 'و', 'ی', 'ه']);

/** Context class of a Persian letter, used by emission rules. */
function letterClass(ch) {
  if (ch === undefined || ch === '') return '^';          // word boundary
  if (ch === ZWNJ) return 'Z';
  if (ch === 'ا' || ch === 'آ' || ch === 'أ' || ch === 'إ') return 'A';
  if (ch === 'و' || ch === 'ؤ') return 'V';
  if (ch === 'ی' || ch === 'ئ') return 'Y';
  if (ch === 'ه') return 'H';
  if (ch === 'ع' || ch === 'ء') return 'E';
  return 'C';                                             // strong consonant
}

/** Consonant skeleton of a Persian word. */
function skeletonOfWord(w) {
  let k = '';
  for (let i = 0; i < w.length; i++) {
    const c = STRONG[w[i]];
    if (c) k += c;
  }
  return k;
}

const PERSIAN_LETTERS = 'ءآأؤإئابتثجحخدذرزسشصضطظعغفقلمنهوپچژکگی';

module.exports = { ZWNJ, STRONG, WEAK, letterClass, skeletonOfWord, PERSIAN_LETTERS };
