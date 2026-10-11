#!/usr/bin/env python3
"""Estimate how likely each Persian suffix is to attach to a base word, from the lexicon itself.

For suffix s:  rho_s = sum P(base+s) / sum P(base)   over lexicon pairs where both base and base+s exist.
Printed as ln(rho). Used (rounded) as the priors in engine/src/morph.js.
Usage: python3 -I tools/suffix_stats.py
"""
import math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZW = "‌"
lex = {}
for line in open(os.path.join(ROOT, "data/build/lexicon.tsv"), encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    lex[p[0].replace(ZW, "")] = max(lex.get(p[0].replace(ZW, ""), -99), float(p[1]))

SUF = ["ها", "های", "هایم", "هایت", "هایش", "هایمان", "هایتان", "هایشان", "هام", "هات", "هاش", "هامون", "هاتون", "هاشون",
       "م", "ت", "ش", "مان", "تان", "شان", "مون", "تون", "شون", "ان", "ات", "ی", "ای", "ام", "اش", "تر", "ترین", "ه", "ست",
       "انه", "یی", "یم", "یت", "یش", "گی", "و", "رو"]
rows = []
for s in SUF:
    sp = sb = 0.0
    n = 0
    for w, lp in lex.items():
        if len(w) > len(s) + 1 and w.endswith(s):
            b = w[: -len(s)]
            if b in lex and len(b) >= 2:
                sp += math.exp(lp); sb += math.exp(lex[b]); n += 1
    if sb > 0:
        rows.append((s, n, math.log(sp / sb)))
for s, n, r in sorted(rows, key=lambda x: -x[2]):
    print(f"{s}\t pairs={n:6d}\t ln_rho={r:6.2f}")
