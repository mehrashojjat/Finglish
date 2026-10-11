#!/usr/bin/env python3
"""Merge corpus counts into the engine lexicon.

Inputs  (all produced by the other tools, or downloaded into data/raw):
  data/build/opus_unigrams.tsv       subtitle unigram counts (colloquial register)   [count_opus.py uni]
  data/build/wiki_unigrams.tsv       Wikipedia unigram counts (formal register)      [count_wiki.py]
  data/raw/wiktionary-fa/*.jsonl     Wiktionary (kaikki.org) lemma list + romanisation
  data/raw/wikipedia-fa/*titles*.gz  Wikipedia article titles (names / places / terms)
  tools/extra_words.tsv              hand-curated additions (optional)

Output: data/build/lexicon.tsv  with columns
  word      matching form (may contain ZWNJ if that's the dominant surface form)
  logp      natural-log probability of the word in the blended corpus
  zwnj      preferred display form *with* ZWNJ ("" if none/same)
  hint      pronunciation hints from Wiktionary romanisations, '|'-separated ("" if unknown) — see tools/hints.py
  src       letters: s=subtitles w=wikipedia l=wiktionary t=title x=extra

Blending: p(w) = ALPHA * p_sub(w) + (1-ALPHA) * p_wiki(w); chat-style typing is much closer to
subtitle language than to encyclopaedia prose, hence ALPHA > 0.5.
"""
import collections, gzip, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fa_text
import hints as hintlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALPHA = 0.7
JUNK = {"تغییرمسیر", "تغییر‌مسیر"}
ZW = fa_text.ZWNJ


def read_counts(path):
    d = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            w, _, c = line.rstrip("\n").partition("\t")
            if w:
                d[w] = d.get(w, 0) + int(c)
    return d


def main(min_sub=3, min_wiki=6, alpha=None, out_path=None):
    global ALPHA
    if alpha is not None:
        ALPHA = alpha
    sub = read_counts(os.path.join(ROOT, "data/build/opus_unigrams.tsv"))
    wiki = read_counts(os.path.join(ROOT, "data/build/wiki_unigrams.tsv"))
    for j in JUNK:
        sub.pop(j, None); wiki.pop(j, None)
    n_sub, n_wiki = sum(sub.values()), sum(wiki.values())
    print(f"subtitle tokens={n_sub:,} types={len(sub):,}; wiki tokens={n_wiki:,} types={len(wiki):,}", file=sys.stderr)

    # Wiktionary lemmas (Persian-script headwords only)
    lemma = set()
    wk = os.path.join(ROOT, "data/raw/wiktionary-fa/kaikki.org-dictionary-Persian.jsonl")
    if os.path.exists(wk):
        with open(wk, encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                for t in fa_text.tokens(r.get("word", "")):
                    if fa_text.is_clean_word(t):
                        lemma.add(t)
    # Wikipedia titles -> single-word tokens (names, places)
    titles = collections.Counter()
    tp = os.path.join(ROOT, "data/raw/wikipedia-fa/fawiki-latest-all-titles-in-ns0.gz")
    if os.path.exists(tp):
        with gzip.open(tp, "rt", encoding="utf-8", errors="replace") as f:
            for line in f:
                for t in fa_text.tokens(line.replace("_", " ")):
                    if fa_text.is_clean_word(t):
                        titles[t] += 1
    extra = {}
    xp = os.path.join(ROOT, "tools/extra_words.tsv")
    if os.path.exists(xp):
        with open(xp, encoding="utf-8") as f:
            for line in f:
                if line.strip() and not line.startswith("#"):
                    parts = line.rstrip("\n").split("\t")
                    extra[fa_text.norm(parts[0])] = int(parts[1]) if len(parts) > 1 else 200

    # ---- group by ZWNJ-stripped key ------------------------------------------------------
    groups = {}   # key -> dict(sub, wiki, variants{surface:count}, src)
    def add(surface, c_sub=0, c_wiki=0, src=""):
        key = surface.replace(ZW, "")
        if not key:
            return
        g = groups.get(key)
        if g is None:
            g = groups[key] = {"sub": 0, "wiki": 0, "var": collections.Counter(), "src": set()}
        g["sub"] += c_sub; g["wiki"] += c_wiki
        g["var"][surface] += c_sub + c_wiki
        if src:
            g["src"].add(src)

    for w, c in sub.items():
        add(w, c_sub=c, src="s")
    for w, c in wiki.items():
        add(w, c_wiki=c, src="w")
    for w in lemma:
        add(w, c_sub=1, c_wiki=1, src="l")
    for w, c in titles.items():
        add(w, c_wiki=c, src="t")
    for w, c in extra.items():
        add(w, c_sub=c, src="x")

    out_rows = []
    for key, g in groups.items():
        keep = (g["sub"] >= min_sub or g["wiki"] >= min_wiki or "l" in g["src"] or "x" in g["src"])
        if not keep:
            continue
        p = ALPHA * g["sub"] / n_sub + (1 - ALPHA) * g["wiki"] / n_wiki
        if p <= 0:
            continue
        variants = g["var"]
        top = variants.most_common(1)[0][0]
        zw_forms = [(s, c) for s, c in variants.items() if ZW in s]
        zw_best = max(zw_forms, key=lambda x: x[1])[0] if zw_forms else ""
        out_rows.append((top, math.log(p), zw_best if zw_best != top else "", "".join(sorted(g["src"]))))
    out_rows.sort(key=lambda r: -r[1])

    # pronunciation hints (Wiktionary romanisations aligned to letters)
    roms = hintlib.load_romanizations()
    hinted = 0
    rows2 = []
    for w, lp, zw, src in out_rows:
        hs = hintlib.hints_for(w, roms[w.replace(ZW, "")]) if w.replace(ZW, "") in roms else []
        if hs:
            hinted += 1
        rows2.append((w, lp, zw, "|".join(hs), src))
    out_rows = rows2
    print(f"pronunciation hints for {hinted:,} of {len(out_rows):,} words", file=sys.stderr)

    dst = out_path or os.path.join(ROOT, "data/build/lexicon.tsv")
    with open(dst, "w", encoding="utf-8") as f:
        for w, lp, zw, hint, src in out_rows:
            f.write(f"{w}\t{lp:.3f}\t{zw}\t{hint}\t{src}\n")
    stats = {"entries": len(out_rows), "subtitle_tokens": n_sub, "wiki_tokens": n_wiki, "alpha": ALPHA,
             "min_sub": min_sub, "min_wiki": min_wiki}
    stats["alpha"] = ALPHA
    if not out_path:
        json.dump(stats, open(os.path.join(ROOT, "data/build/lexicon.stats.json"), "w"), indent=1)
    print(f"wrote {len(out_rows):,} entries to {dst}", file=sys.stderr)
    for w, lp, zw, hint, src in out_rows[:12]:
        print(f"  {w}\t{lp:.2f}\t{hint}", file=sys.stderr)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--alpha", type=float, default=None, help="weight of subtitle frequencies in the blend (default 0.7)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--min-sub", type=int, default=3)
    ap.add_argument("--min-wiki", type=int, default=6)
    a = ap.parse_args()
    main(a.min_sub, a.min_wiki, a.alpha, a.out)
