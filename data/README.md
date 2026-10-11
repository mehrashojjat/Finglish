# data/

The word lists the engine is built from.

| path | what | in git |
|---|---|---|
| `aliases.tsv` | hand-written spellings no phonetic rule can infer (English words, brands, abbreviations) | yes |
| `build/lexicon.tsv`, `build/bigrams.tsv` | the finished word list (292k forms with log-probabilities and pronunciation hints) and the previous-word counts | yes |
| `build/opus_*.tsv`, `build/wiki_unigrams.tsv`, `raw/` | the intermediate counts and the downloaded corpora (several hundred MB) | no — re-creatable, see `../docs/DATA_SOURCES.md` |

**Licence.** `build/lexicon.tsv` and `build/bigrams.tsv` (and their copies in `../engine/dist/` and `../assets/data/`) are derived from Persian Wikipedia, Wiktionary and OpenSubtitles word counts and are
therefore under **CC BY-SA 4.0**, with credit to those sources — not under the AGPL that covers the program code. Details: `../docs/DATA_SOURCES.md`.
