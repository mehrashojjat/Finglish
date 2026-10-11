"""Shared Persian text normalisation used by all build tools (and mirrored in engine/normalize.js).

Keep this file and engine/normalize.js in sync: the lexicon is built with THIS code, queries are
normalised at runtime with the JS twin.
"""
import re
import unicodedata

ZWNJ = "‌"

# Persian letters we keep in lexicon words (no digits, no Latin, no diacritics).
LETTERS = "ءآأؤإئابتثجحخدذرزسشصضطظعغفقلمنهوپچژکگی"
_LETTER_SET = set(LETTERS)

_MAP = {
    "ي": "ی", "ى": "ی", "ئ": "ئ", "ك": "ک", "ە": "ه", "ہ": "ه", "ھ": "ه", "ۀ": "ه", "ة": "ه",
    "ٲ": "ا", "ٱ": "ا", "ڪ": "ک", "ݠ": "و", "ۆ": "و", "ۇ": "و", "ې": "ی", "ێ": "ی",
}
_STRIP = re.compile("[ً-ٰٟـ‎‏‪-‮⁦-⁩﻿]")
_TOKEN = re.compile("[" + re.escape(LETTERS) + ZWNJ + "]+")


def norm(s: str) -> str:
    """NFKC, unify Arabic/Persian letter variants, drop diacritics/tatweel/bidi marks."""
    s = unicodedata.normalize("NFKC", s)
    s = _STRIP.sub("", s)
    return "".join(_MAP.get(c, c) for c in s)


def tokens(s: str):
    """Yield Persian word tokens from raw text (already or not normalised)."""
    for m in _TOKEN.finditer(norm(s)):
        t = m.group(0).strip(ZWNJ)
        if not t:
            continue
        t = re.sub(ZWNJ + "{2,}", ZWNJ, t)
        yield t


def is_clean_word(t: str) -> bool:
    """Reject obvious noise: single stray letters, long repeats, no letters at all."""
    if not t or any(c not in _LETTER_SET and c != ZWNJ for c in t):
        return False
    if re.search(r"(.)\1{3,}", t):          # 'ااااا'
        return False
    if len(t) == 1:                          # the only real one-letter word is the conjunction و
        return t == "و"
    return True
