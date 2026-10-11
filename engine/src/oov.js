'use strict';
/**
 * Out-of-vocabulary proposals: names, slang, new brands — anything the lexicon doesn't know.
 *
 * A beam search walks the typed text left to right choosing Persian letters. The channel supplies "how would this
 * letter be typed?" (context-free approximation: neighbours unknown), the character LM supplies "is this a plausible
 * Persian letter sequence?". The best strings are returned as PROPOSALS; the engine then re-scores each one with the
 * exact channel DP so lexicon words and OOV words are compared on equal terms — which is why the cheap approximation
 * used here cannot cause wrong costs, only (rarely) a missed proposal.
 *
 * Speed: for every typed position the list of letter options that can match there is computed once per query
 * (not once per beam state), so each beam state only iterates over the handful of options that fit.
 */
const { PERSIAN_LETTERS } = require('./alphabet');
const { IDX, START, END, V } = require('./charlm');
const { INSERT } = require('./channel');

const LETTERS = PERSIAN_LETTERS.split('');

function createOOV(channel, lm) {
  // generic (neighbour-free) options per letter, with first/last variants merged: letter -> [[chunk, cost, nextChars?, mustEnd?]]
  const generic = [new Map(), new Map()];       // [first?][letter]
  function genericOptions(L, first) {
    const m = generic[first ? 1 : 0];
    let v = m.get(L);
    if (!v) {
      const best = new Map();
      for (const last of [false, true]) {
        for (const o of channel.optionsFor(L, '', '', first, last)) {
          const k = o[0] + '|' + (o[2] || '') + '|' + (o[3] ? 1 : 0);
          if (!best.has(k) || best.get(k)[1] > o[1]) best.set(k, o);
        }
      }
      v = Array.from(best.values());
      m.set(L, v);
    }
    return v;
  }

  /**
   * @param {string} x       normalised typed text
   * @param {number} lambda  LM weight (same as the engine's)
   * @param {number} beam    states kept per depth
   * @returns {string[]} proposed Persian strings (best first)
   */
  function propose(x, lambda, beam, maxOut) {
    const n = x.length;
    const maxDepth = n + 3;

    // matches[first][i] = options usable at typed position i: [letter, letterIdx, chunkLen, cost]
    const matches = [new Array(n + 1), new Array(n + 1)];
    function matchesAt(first, i) {
      let v = matches[first ? 1 : 0][i];
      if (v) return v;
      v = [];
      for (const L of LETTERS) {
        const li = IDX.get(L);
        for (const o of genericOptions(L, first)) {
          const chunk = o[0];
          if (chunk.length) { if (!x.startsWith(chunk, i)) continue; }
          else if (i === n && o[1] > 1.5) continue;            // don't pad the end with silent letters
          const ni = i + chunk.length;
          if (o[2] !== undefined && !(ni < n && o[2].indexOf(x[ni]) >= 0)) continue;
          if (o[3] && ni !== n) continue;
          v.push([L, li, chunk.length, o[1]]);
        }
      }
      matches[first ? 1 : 0][i] = v;
      return v;
    }

    let frontier = [{ i: 0, a: START, b: START, cost: 0, lp: 0, str: '', ins: false }];
    const results = new Map();
    for (let d = 0; d <= maxDepth && frontier.length; d++) {
      const next = new Map();
      const first = d === 0;
      // frontier may grow while we iterate (slot insertions stay at the same depth)
      for (let q = 0; q < frontier.length; q++) {
        const s = frontier[q];
        if (s.i === n && d > 0) {
          const tot = s.cost - lambda * (s.lp + lm.logProb(s.a, s.b, END));
          const prev = results.get(s.str);
          if (prev === undefined || tot < prev) results.set(s.str, tot);
        }
        // typed vowel with no letter
        if (!s.ins && d > 0 && s.i < n) {
          for (const [chunk, c0] of INSERT) {
            if (x.startsWith(chunk, s.i)) frontier.push({ i: s.i + chunk.length, a: s.a, b: s.b, cost: s.cost + c0, lp: s.lp, str: s.str, ins: true });
          }
        }
        if (d === maxDepth) continue;
        for (const m of matchesAt(first, s.i)) {
          const ni = s.i + m[2];
          const lp = s.lp + lm.logProb(s.a, s.b, m[1]);
          const cost = s.cost + m[3];
          const key = (ni * V + s.b) * V + m[1];
          const prev = next.get(key);
          if (prev === undefined || cost - lambda * lp < prev.cost - lambda * prev.lp) {
            next.set(key, { i: ni, a: s.b, b: m[1], cost, lp, str: s.str + m[0], ins: false });
          }
        }
      }
      let arr = Array.from(next.values());
      if (arr.length > beam) {
        arr.sort((p, q) => (p.cost - lambda * p.lp) - (q.cost - lambda * q.lp));
        arr = arr.slice(0, beam);
      }
      frontier = arr;
    }
    return Array.from(results.entries()).sort((p, q) => p[1] - q[1]).slice(0, maxOut).map(e => e[0]);
  }

  return { propose };
}

module.exports = { createOOV };
