'use strict';
/**
 * Lexicon = words + log-probabilities + the skeleton index.
 * Source format (data/build/lexicon.tsv):  word <TAB> logp <TAB> zwnj-form <TAB> hints <TAB> sources
 *   hints = '|'-separated pronunciation hint strings (see tools/hints.py), or empty
 */
const { skeletonOfWord } = require('./alphabet');

/**
 * Which half-space (ZWNJ) forms from the corpus may ever be shown (option zwnj: 'auto').
 * The corpus is noisy — of the 13,839 forms on record, ~77 % are wrong: a stray half-space inside an ordinary word (د‌ر, ا‌ز, ا‌ست, به‌ت,
 * با‌هات, آل‌مان…). So a form is shown only when it is one of three regular patterns of Persian orthography:
 *   • the verb prefix  می‌ / نمی‌  + a stem   (می‌کنم, می‌خوام, نمی‌دونم)           — minus a few non-verbs: میخ، میهن، میخانه، میان، میمون
 *   • the plural       ‌ها / ‌های / ‌هایی / ‌هایم …                                    (کتاب‌ها, آن‌ها, شهرهای)           — minus تنها
 *   • the comparative  ‌تر / ‌ترین                                                      (بزرگ‌تر, زودتر)                 — minus بهتر، بیشتر، کمتر، پیشتر، فراتر (written joined)
 *   • a clitic after a final ه   ‌ام ‌ات ‌اش ‌ای ‌ایم ‌اید ‌اند                       (خانه‌ام, خانه‌ای, بچه‌اش)
 * with at least two letters on the other side of the half-space. Everything else is dropped; (measured: 3,135 forms stay, 23 %).
 */
const NOT_VERBS = new Set(['خ', 'هن', 'خانه', 'ان', 'مون']);
const WRITTEN_JOINED = new Set(['به', 'بیش', 'کم', 'پیش', 'فرا', 'تن']);
function genuineHalfSpace(form) {
  let m = /^(ن?می)\u200c(.+)$/.exec(form);
  if (m) return m[2].length >= 2 && m[2].indexOf('\u200c') < 0 && !NOT_VERBS.has(m[2]);
  m = /^(.+)\u200c(ها|های|هایی|هایم|هایت|هایش|هایمان|هایتان|هایشان|تر|ترین)$/.exec(form);
  if (m) return m[1].length >= 2 && m[1].indexOf('\u200c') < 0 && !WRITTEN_JOINED.has(m[1]);
  m = /^(.+ه)\u200c(ام|ات|اش|ای|ایم|اید|اند)$/.exec(form);
  return !!m && m[1].length >= 3 && m[1].indexOf('\u200c') < 0;
}

class Lexicon {
  constructor() {
    this.words = [];            // matching form (what the channel aligns against)
    this.logp = null;           // Float32Array
    this.zw = [];               // display form with ZWNJ, or ''
    this.hints = [];            // per word: array of hint strings, or null
    this.index = new Map();     // skeleton key -> Int32Array of word ids, most frequent first
    this.byWord = new Map();    // word -> id
    this._sortedKeys = null;
  }

  static fromTSV(text) {
    const lex = new Lexicon();
    const lines = text.split('\n');
    const lp = [];
    const buckets = new Map();
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line) continue;
      const p = line.split('\t');
      if (p.length < 2) continue;
      const id = lex.words.length;
      lex.words.push(p[0]);
      lp.push(parseFloat(p[1]));
      lex.zw.push(p[2] && genuineHalfSpace(p[2]) ? p[2] : '');
      lex.hints.push(p[3] ? p[3].split('|') : null);
      lex.byWord.set(p[0], id);
      const key = skeletonOfWord(p[0]);
      let b = buckets.get(key);
      if (!b) { b = []; buckets.set(key, b); }
      b.push(id);
    }
    lex.logp = Float32Array.from(lp);
    buckets.forEach((b, k) => {
      b.sort((a, c) => lex.logp[c] - lex.logp[a]);
      lex.index.set(k, Int32Array.from(b));
    });
    return lex;
  }

  /** All skeleton keys that start with `prefix` (for completions). */
  keysWithPrefix(prefix, limit) {
    if (!this._sortedKeys) this._sortedKeys = Array.from(this.index.keys()).sort();
    const ks = this._sortedKeys;
    let lo = 0, hi = ks.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ks[mid] < prefix) lo = mid + 1; else hi = mid; }
    const out = [];
    for (let i = lo; i < ks.length && ks[i].startsWith(prefix); i++) {
      out.push(ks[i]);
      if (limit && out.length >= limit) break;
    }
    return out;
  }
}

module.exports = { Lexicon, genuineHalfSpace };
