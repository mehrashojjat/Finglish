#!/usr/bin/env python3
"""Count unigrams (and optionally bigrams) in the OPUS OpenSubtitles Persian monolingual text.

Usage:
  python3 -I tools/count_opus.py uni  <fa.txt.gz> <out_unigrams.tsv> [min_count]
  python3 -I tools/count_opus.py bi   <fa.txt.gz> <unigrams.tsv> <out_bigrams.tsv> [vocab_size=40000] [min_count=3]

Subtitles are the best proxy we have for how people actually *write* Persian when chatting
(colloquial verb forms like میخوام / نمیدونم). One subtitle line = one context window.
"""
import collections, gzip, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fa_text


def unigrams(src, dst, min_count=2):
    c = collections.Counter()
    n = 0
    with gzip.open(src, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            for t in fa_text.tokens(line):
                if fa_text.is_clean_word(t):
                    c[t] += 1
            n += 1
            if n % 2_000_000 == 0:
                print(f"lines={n} types={len(c)}", file=sys.stderr)
    items = sorted(((w, k) for w, k in c.items() if k >= min_count), key=lambda x: -x[1])
    with open(dst, "w", encoding="utf-8") as out:
        for w, k in items:
            out.write(f"{w}\t{k}\n")
    print(f"lines={n} types={len(c)} kept={len(items)} tokens={sum(c.values())}", file=sys.stderr)


def bigrams(src, uni_path, dst, vocab_size=40000, min_count=3):
    vocab = {}
    with open(uni_path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= vocab_size:
                break
            vocab[line.split("\t")[0]] = i
    c = collections.Counter()
    n = 0
    with gzip.open(src, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            toks = [t for t in fa_text.tokens(line) if fa_text.is_clean_word(t)]
            prev = None
            for t in toks:
                if t in vocab:
                    if prev is not None:
                        c[(prev, t)] += 1
                    prev = t
                else:
                    prev = None
            n += 1
            if n % 2_000_000 == 0:
                # prune singletons to bound memory
                for k in [k for k, v in c.items() if v < 2]:
                    del c[k]
                print(f"lines={n} pairs={len(c)}", file=sys.stderr)
    items = sorted(((a, b, k) for (a, b), k in c.items() if k >= min_count), key=lambda x: -x[2])
    with open(dst, "w", encoding="utf-8") as out:
        for a, b, k in items:
            out.write(f"{a}\t{b}\t{k}\n")
    print(f"pairs kept={len(items)}", file=sys.stderr)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "uni":
        unigrams(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 2)
    elif mode == "bi":
        bigrams(sys.argv[2], sys.argv[3], sys.argv[4],
                int(sys.argv[5]) if len(sys.argv) > 5 else 40000,
                int(sys.argv[6]) if len(sys.argv) > 6 else 3)
    else:
        sys.exit(__doc__)
