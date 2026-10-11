#!/usr/bin/env python3
"""Turn raw bigram counts into the compact runtime file.

Input : data/build/opus_bigrams.tsv   (a, b, count(a b))   data/build/opus_unigrams.tsv (word, count)
Output: data/build/bigrams.tsv        a <TAB> count(a) <TAB> b1:c1 b2:c2 ...     (top successors per a)
Usage : python3 -I tools/build_bigrams.py [max_successors=25] [max_prev=30000]
"""
import collections, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZW = "‌"
max_succ = int(sys.argv[1]) if len(sys.argv) > 1 else 25
max_prev = int(sys.argv[2]) if len(sys.argv) > 2 else 30000

uni = {}
with open(os.path.join(ROOT, "data/build/opus_unigrams.tsv"), encoding="utf-8") as f:
    for line in f:
        w, c = line.rstrip("\n").split("\t")
        k = w.replace(ZW, "")
        uni[k] = uni.get(k, 0) + int(c)

succ = collections.defaultdict(collections.Counter)
with open(os.path.join(ROOT, "data/build/opus_bigrams.tsv"), encoding="utf-8") as f:
    for line in f:
        a, b, c = line.rstrip("\n").split("\t")
        succ[a.replace(ZW, "")][b.replace(ZW, "")] += int(c)

rows = sorted(succ.items(), key=lambda kv: -uni.get(kv[0], 0))[:max_prev]
n_pairs = 0
with open(os.path.join(ROOT, "data/build/bigrams.tsv"), "w", encoding="utf-8") as out:
    for a, cnt in rows:
        top = cnt.most_common(max_succ)
        n_pairs += len(top)
        out.write(f"{a}\t{uni.get(a, sum(cnt.values()))}\t" + " ".join(f"{b}:{c}" for b, c in top) + "\n")
print(f"{len(rows):,} contexts, {n_pairs:,} pairs", file=sys.stderr)
