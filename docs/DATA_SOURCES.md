# Data sources and licences

Everything the engine knows comes from the open sources below (plus our own hand-written lists). Nothing is fetched at runtime:
the finished data ships inside the website and the Mac app.

| source | what we take | how | licence / terms | where |
|---|---|---|---|---|
| **OPUS OpenSubtitles 2018, Persian** monolingual text (163 MB gz) — `object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/fa.txt.gz` | colloquial word frequencies (63 M tokens → 278k types) and adjacent-word counts (863k pairs, 30k-word vocabulary) | `tools/count_opus.py uni|bi` | subtitles from opensubtitles.org, distributed by OPUS for research. **Only aggregate counts are used; the raw text is not part of the product and must not be redistributed.** | raw: `data/raw/opus-opensubtitles-fa/` · counts: `data/build/opus_*.tsv` |
| **Persian Wikipedia** dump chunk `fawiki-latest-pages-articles-multistream1.xml-p1500001p3000000.bz2` (204 MB) and the all-titles list | formal-register word frequencies (25 M tokens → 235k types) and article-title words (names, places) | `tools/count_wiki.py`, `tools/build_lexicon.py` | CC BY-SA 4.0 (+GFDL) — attribution + share-alike on derived data | raw: `data/raw/wikipedia-fa/` · counts: `data/build/wiki_unigrams.tsv` |
| **Wiktionary (Persian)** via the kaikki.org extraction — `kaikki.org-dictionary-Persian.jsonl` (93 MB) | ~20k headwords (added to the lexicon) and their **romanisations** → pronunciation hints for 12,636 forms | `tools/hints.py` | CC BY-SA 4.0 (+GFDL) | raw: `data/raw/wiktionary-fa/` |
| **FrequencyWords** (hermitdave) `fa_full.txt`, `fa_50k.txt` | *not used at runtime.* Downloaded first; superseded by our own count of the same OpenSubtitles corpus with proper Persian normalisation. Kept only as a sanity reference | – | code MIT, content CC BY-SA 4.0 | `data/raw/opensubtitles-fa/` |
| **Vazirmatn** font (Regular, Bold) | the website's Persian typeface, bundled so the page works offline | – | SIL Open Font Licence 1.1 (`assets/fonts/OFL.txt`) | `assets/fonts/` |
| **Our own** | `data/aliases.tsv` (≈140 English-spelling shortcuts), all gold test sets in `tests/gold/`, channel tables, rules | hand-written | ours | repo |

## What ends up in the shipped artefacts

* `data/build/lexicon.tsv` → `engine/dist/lexicon.tsv` and `assets/data/lexicon.js`: 292,057 word forms, their log-probabilities, optional hint strings.
* `data/build/bigrams.tsv` → `engine/dist/bigrams.tsv` and `assets/data/bigrams.js`: 26k contexts, 245k pairs.
* Both are **derived from CC BY-SA corpora**, so wherever they are distributed (this repository, the website, the Mac app) the derived data stays under **CC BY-SA 4.0** with credit to
  Wikipedia, Wiktionary and OpenSubtitles — the About section of the website and of the Mac app say so. The program code is a separate work under the **GNU AGPL-3.0** (`LICENSE`); the bundled
  Vazirmatn font keeps its own SIL OFL 1.1. See the *Licences* section of the `README`.

## Corpus normalisation (identical in Python and JS)

`tools/fa_text.py` ⇄ `engine/src/normalize.js`: NFKC; Arabic ي ك ى ة ۀ → Persian ی ک ی ه ه; strip harakat/tatweel/bidi marks; keep only Persian letters and ZWNJ; drop tokens
with 4+ repeated letters or single stray letters (except the conjunction و); drop the Wikipedia redirect token `تغییرمسیر`. Words with and without ZWNJ are grouped; the most frequent surface form is
the matching form and the ZWNJ form, if any, is kept for the orthographic display option.

## Rebuilding from scratch

```bash
# raw files are already in data/raw/. To refresh them, re-download from the URLs above, then:
python3 -I tools/count_opus.py uni  data/raw/opus-opensubtitles-fa/fa.txt.gz data/build/opus_unigrams.tsv 2
python3 -I tools/count_opus.py bi   data/raw/opus-opensubtitles-fa/fa.txt.gz data/build/opus_unigrams.tsv data/build/opus_bigrams.tsv 30000 5
python3 -I tools/count_wiki.py data/raw/wikipedia-fa/fawiki-latest-pages-articles-multistream1.xml-p1500001p3000000.bz2 data/build/wiki_unigrams.tsv 2
python3 -I tools/build_lexicon.py            # → data/build/lexicon.tsv (with hints)
python3 -I tools/build_bigrams.py            # → data/build/bigrams.tsv
node tools/bundle.js                          # → engine/dist/, assets/vendor/, assets/data/
```
