#!/usr/bin/env python3
"""Pronunciation hints: which vowel is actually *pronounced* where Persian script writes none.

Persian spelling omits short vowels, so کتاب 'ketâb' and بخار 'boxâr' differ only in vowels the script never shows.
Wiktionary gives a scholarly romanisation for ~20k Persian headwords (e.g. 'salâm', 'ešġ', 'boxâr'). We align each
word's letters with its phonemes and keep, per word, a compact HINT string the channel model uses to reward typed
vowels that match the real pronunciation and penalise mismatches.

HINT FORMAT (one string per romanisation; a word may have several, separated by '|' in the lexicon file)
    n = number of letters (ZWNJ excluded)
    chars [0 .. n]      slot[j]  = short vowel pronounced between letter j-1 and letter j  ('-' none; j = n is word end)
    chars [n+1 .. 2n]   own[j]   = vowel realised by letter j when it is vowel-ish:
                                    'A' long â,  'a' 'e' 'o' 'u' 'i' short/other vowels, 'c' consonantal reading
                                    (و=v, ی=y, ه=h), 's' silent,  '-' consonant letters
Alignment is a small DP; words whose best alignment is poor are dropped (no hint = no adjustment).
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fa_text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- romanisation -> canonical phoneme tokens ------------------------------------------------------------------
VOWEL_MAP = {'a': 'a', 'e': 'e', 'o': 'o', 'i': 'i', 'u': 'u', 'â': 'A', 'ā': 'A', 'ī': 'i', 'ū': 'u', 'ē': 'e', 'ō': 'o',
             'ê': 'e', 'ô': 'o', 'î': 'i', 'û': 'u', 'ŭ': 'u', 'ĭ': 'i', 'ə': 'e', 'æ': 'a', 'ö': 'o'}
CONS_MAP = {'b': 'b', 'p': 'p', 't': 't', 's': 's', 'j': 'j', 'h': 'h', 'd': 'd', 'z': 'z', 'r': 'r', 'f': 'f', 'k': 'k',
            'g': 'g', 'l': 'l', 'm': 'm', 'n': 'n', 'v': 'v', 'w': 'w', 'y': 'y', 'x': 'X', 'š': 'S', 'č': 'C', 'ž': 'Z',
            'ġ': 'Q', 'ğ': 'Q', 'q': 'Q', "'": "'", 'ʼ': "'", 'ç': 'C', 'ṭ': 't', 'ḍ': 'd', 'ṯ': 's', 'c': 'k'}
VOWELS = set('aeouiAu')


def tokenize(rom):
    toks = []
    for ch in rom.lower().replace('Â', 'â'):
        if ch in VOWEL_MAP:
            toks.append(VOWEL_MAP[ch])
        elif ch in CONS_MAP:
            toks.append(CONS_MAP[ch])
        else:
            return None            # hyphen, space, digits, odd letters: not a plain single word
    return toks


# ---- Persian letter -> possible token sequences (cost) ---------------------------------------------------------
def letter_options(ch, i, n):
    first, last = i == 0, i == n - 1
    C = {'ب': 'b', 'پ': 'p', 'ت': 't', 'ط': 't', 'ث': 's', 'س': 's', 'ص': 's', 'ج': 'j', 'چ': 'C', 'ح': 'h', 'خ': 'X',
         'د': 'd', 'ذ': 'z', 'ز': 'z', 'ض': 'z', 'ظ': 'z', 'ر': 'r', 'ژ': 'Z', 'ش': 'S', 'غ': 'Q', 'ق': 'Q', 'ف': 'f',
         'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n'}
    if ch in C:
        t = C[ch]
        return [([t], 0.0), ([t, t], 0.2)]
    if ch == 'ا':
        o = [(['A'], 0.0), ([], 1.0), (['a'], 0.5), (['e'], 0.3), (['o'], 0.5)]
        return o
    if ch == 'آ':
        return [(['A'], 0.0), (['A', 'a'], 0.4)]
    if ch == 'و':
        return [(['u'], 0.0), (['v'], 0.1), (['o'], 0.3), (['w'], 0.3), ([], 0.8), (['o', 'w'], 0.2), (['a', 'w'], 0.3),
                (['u', 'v'], 0.4), (['A'], 1.5)]
    if ch == 'ی':
        return [(['i'], 0.0), (['y'], 0.1), (['i', 'y'], 0.15), (['e', 'y'], 0.2), (['a', 'y'], 0.3), (['e'], 0.5), ([], 0.8),
                (['A'], 1.5)]
    if ch == 'ه':
        return [(['h'], 0.0), (['e'], 0.1), (['a'], 0.3), ([], 0.6), (['e', 'h'], 0.3), (['A'], 1.5)]
    if ch == 'ع':
        return [(["'"], 0.0), ([], 0.3), (['a'], 0.1), (['e'], 0.1), (['o'], 0.2), (['A'], 0.4), (['i'], 0.6)]
    if ch in 'ءأإئؤ':
        return [(["'"], 0.0), ([], 0.3), (['a'], 0.2), (['e'], 0.2), (['o'], 0.3), (['i'], 0.4), (['y'], 0.4), (['u'], 0.4)]
    return []


SLOT_COST = {'a': 0.0, 'e': 0.0, 'o': 0.0, 'i': 0.4, 'u': 0.5, 'A': 3.0}
MAX_COST = 3.2


def align(word, rom):
    """Return a hint string or None."""
    toks = tokenize(rom)
    if not toks or not word or len(toks) > 3 * len(word) + 2:
        return None
    n, m = len(word), len(toks)
    INF = 1e9
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    bp = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for k in range(m + 1):
            cur = dp[i][k]
            if cur >= INF:
                continue
            # unattached vowel before letter i (a "slot")
            if k < m and toks[k] in SLOT_COST:
                c = cur + SLOT_COST[toks[k]] + (2.0 if i == 0 else 0.0)
                if c < dp[i][k + 1]:
                    dp[i][k + 1] = c; bp[i][k + 1] = ('slot', i, k)
            if i < n:
                for seq, cost in letter_options(word[i], i, n):
                    if toks[k:k + len(seq)] == seq:
                        nk = k + len(seq)
                        c = cur + cost
                        if c < dp[i + 1][nk]:
                            dp[i + 1][nk] = c; bp[i + 1][nk] = ('let', i, k, seq)
    if dp[n][m] > MAX_COST:
        return None
    slots = ['-'] * (n + 1)
    own = ['-'] * n
    i, k = n, m
    while (i, k) != (0, 0):
        b = bp[i][k]
        if b is None:
            return None
        if b[0] == 'slot':
            _, si, sk = b
            tok = toks[sk]
            slots[si] = tok if tok != 'A' else 'a'
            i, k = si, sk
        else:
            _, li, lk, seq = b
            ch = word[li]
            if ch in 'اآوی هعءأإئؤ'.replace(' ', ''):
                if not seq:
                    own[li] = 's'
                elif seq[0] in ('v', 'w', 'y', 'h', "'"):
                    own[li] = 'c'
                else:
                    own[li] = seq[0]
            i, k = li, lk
    return ''.join(slots) + ''.join(own)


# ---- Wiktionary loading ----------------------------------------------------------------------------------------
def load_romanizations(path=None):
    path = path or os.path.join(ROOT, 'data/raw/wiktionary-fa/kaikki.org-dictionary-Persian.jsonl')
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            w = r.get('word', '')
            if not re.search(r'[؀-ۿ]', w) or ' ' in w or '-' in w:
                continue
            w0 = fa_text.norm(w).replace(fa_text.ZWNJ, '')
            if not w0 or any(c not in fa_text._LETTER_SET for c in w0):
                continue
            roms = []
            for fm in r.get('forms', []):
                if 'romanization' in fm.get('tags', []):
                    roms.append(fm['form'])
            for h in r.get('head_templates', []):
                t = h.get('args', {}).get('tr')
                if t:
                    roms.extend(x.strip() for x in t.split(',') if x.strip())
            for rom in roms:
                out.setdefault(w0, set()).add(rom)
    return out


def hints_for(word_with_zwnj, roms):
    """All distinct hint strings for a lexicon word (ZWNJ positions are padded in)."""
    w0 = word_with_zwnj.replace(fa_text.ZWNJ, '')
    res = []
    for rom in sorted(roms):
        h = align(w0, rom)
        if h and h not in res:
            res.append(h)
    if not res or word_with_zwnj == w0:
        return res[:3]
    # re-insert neutral entries for ZWNJ characters
    n0 = len(w0)
    pos = [i for i, c in enumerate(word_with_zwnj) if c == fa_text.ZWNJ]
    out = []
    for h in res[:3]:
        slots, own = list(h[:n0 + 1]), list(h[n0 + 1:])
        # map letter index in w0 -> index in word_with_zwnj
        li = 0
        s2, o2 = [], []
        for ch in word_with_zwnj:
            if ch == fa_text.ZWNJ:
                s2.append('-'); o2.append('-')
            else:
                s2.append(slots[li]); o2.append(own[li]); li += 1
        s2.append(slots[n0])
        out.append(''.join(s2) + ''.join(o2))
    return out


if __name__ == '__main__':
    tests = [('سلام', 'salâm'), ('سالم', 'sâlem'), ('عشق', 'ešġ'), ('عاشق', 'âšeġ'), ('بخار', 'boxâr'), ('خیار', 'xiyâr'),
             ('کوه', 'kuh'), ('خانه', 'xâne'), ('شوهر', 'šowhar'), ('خوب', 'xub'), ('دوست', 'dust'), ('مرسی', 'mersi')]
    for w, r in tests:
        print(w, r, align(w, r))
