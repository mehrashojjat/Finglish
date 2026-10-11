#!/usr/bin/env python3
"""Count Persian word frequencies in a Wikipedia XML bz2 dump chunk (formal-register vocabulary).

Usage: python3 -I tools/count_wiki.py <dump.bz2> <out.tsv> [min_count]
Wikitext is cleaned only roughly (templates, refs, tags, link targets); that's fine for frequency
estimation because rare noise falls under min_count.
"""
import bz2, re, sys, collections, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fa_text

TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
REF = re.compile(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", re.S)
COMMENT = re.compile(r"<!--.*?-->", re.S)
TAG = re.compile(r"<[^>]+>")
FILELINK = re.compile(r"\[\[(?:پرونده|تصویر|File|Image|رده|Category):[^\]]*\]\]", re.I)
LINK = re.compile(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]")
EXTLINK = re.compile(r"https?://\S+")
TABLE = re.compile(r"\{\|.*?\|\}", re.S)


def clean(wikitext: str) -> str:
    t = COMMENT.sub(" ", wikitext)
    t = REF.sub(" ", t)
    t = TABLE.sub(" ", t)
    for _ in range(6):                        # nested templates, innermost first
        t2 = TEMPLATE.sub(" ", t)
        if t2 == t:
            break
        t = t2
    t = FILELINK.sub(" ", t)
    t = LINK.sub(r"\1", t)
    t = EXTLINK.sub(" ", t)
    t = TAG.sub(" ", t)
    return t


def main():
    src, dst = sys.argv[1], sys.argv[2]
    min_count = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    counts = collections.Counter()
    pages = 0
    buf = []
    in_text = False
    with bz2.open(src, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            if not in_text:
                i = line.find("<text")
                if i == -1:
                    continue
                j = line.find(">", i)
                line = line[j + 1:]
                in_text = True
            k = line.find("</text>")
            if k != -1:
                buf.append(line[:k])
                text = "\n".join(buf)
                buf = []
                in_text = False
                if text.lstrip().upper().startswith("#REDIRECT") or "#تغییر_مسیر" in text[:40]:
                    continue
                for tok in fa_text.tokens(clean(text)):
                    if fa_text.is_clean_word(tok):
                        counts[tok] += 1
                pages += 1
                if pages % 20000 == 0:
                    print(f"pages={pages} types={len(counts)}", file=sys.stderr)
            else:
                buf.append(line)
    items = [(w, c) for w, c in counts.items() if c >= min_count]
    items.sort(key=lambda x: -x[1])
    with open(dst, "w", encoding="utf-8") as out:
        for w, c in items:
            out.write(f"{w}\t{c}\n")
    print(f"pages={pages} types={len(counts)} kept={len(items)} total_tokens={sum(counts.values())}", file=sys.stderr)


if __name__ == "__main__":
    main()
