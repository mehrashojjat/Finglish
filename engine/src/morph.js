'use strict';
/**
 * Morphology-aware candidates: base word + clitic, for inflected forms the lexicon has never seen
 * (کتابهایمان, خانه‌هایم, دوستمون ...).
 *
 * The prior of such a composite is  P(base) * rho_suffix  where rho_suffix is how often that suffix attaches to a
 * word in the corpus (measured by tools/suffix_stats.py: ln rho = ln( sum P(base+s) / sum P(base) ) over pairs that do
 * occur). The full composite is then scored by the ordinary channel DP, so typed vowels etc. are handled as usual.
 *
 * A suffix spec: { s: plain surface, lp: ln rho, afterH: [surface, lp] (after a final ه), afterV: [surface, lp] (after ا/و) }
 */
const { skeletonOfWord } = require('./alphabet');

const SUFFIXES = [
  { s: 'ها', lp: -4.3 }, { s: 'های', lp: -3.8 },
  { s: 'هایم', lp: -7.4 }, { s: 'هایت', lp: -6.3 }, { s: 'هایش', lp: -6.8 },
  { s: 'هایمان', lp: -8.6 }, { s: 'هایتان', lp: -8.3 }, { s: 'هایشان', lp: -7.9 },
  { s: 'هام', lp: -5.2 }, { s: 'هات', lp: -5.5 }, { s: 'هاش', lp: -5.5 },
  { s: 'هامون', lp: -7.1 }, { s: 'هاتون', lp: -6.8 }, { s: 'هاشون', lp: -6.6 },
  { s: 'م', lp: -2.3, afterH: ['ام', -3.6], afterV: ['یم', -3.4] },
  { s: 'ت', lp: -2.5, afterH: ['ات', -3.6], afterV: ['یت', -3.8] },
  { s: 'ش', lp: -3.4, afterH: ['اش', -4.9], afterV: ['یش', -5.0] },
  { s: 'مان', lp: -4.8 }, { s: 'تان', lp: -4.3 }, { s: 'شان', lp: -6.7 },
  { s: 'مون', lp: -5.3 }, { s: 'تون', lp: -5.2 }, { s: 'شون', lp: -5.4 },
  { s: 'ان', lp: -3.0 }, { s: 'ات', lp: -3.6 },
  { s: 'ی', lp: -1.7, afterH: ['ای', -3.1], afterV: ['یی', -3.2] },
  { s: 'تر', lp: -4.1 }, { s: 'ترین', lp: -4.3 }, { s: 'انه', lp: -4.4 },
  // copula ه / ست and object و are discounted below their raw corpus ratio: a trailing typed 'e' is far more often ezafe
  { s: 'ه', lp: -3.4 }, { s: 'ست', lp: -3.8 }, { s: 'و', lp: -4.2 },
].map(sp => Object.assign({ key: skeletonOfWord(sp.s) }, sp));

/** Surface forms (with their ln prior) of base+suffix, respecting the base's final letter. */
function attach(base, sp) {
  const last = base[base.length - 1];
  if (last === 'ه' && sp.afterH) return [[base + sp.afterH[0], sp.lp + (sp.afterH[1] - sp.lp)]];
  if ((last === 'ا' || last === 'و') && sp.afterV) return [[base + sp.afterV[0], sp.afterV[1]]];
  return [[base + sp.s, sp.lp]];
}

module.exports = { SUFFIXES, attach };
