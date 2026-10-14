# The offline engine — how it works

Our own Latin ("Finglish") → Persian transliterator. It runs entirely in JavaScript, with no network, in ≈ 2 ms per keystroke.
Source: `engine/src/` (≈ 1,050 lines, no dependencies). Everything here is *ours*: the algorithm is a classic **noisy channel** model,
and the numbers are calibrated against hand-written benchmarks (`tests/gold/`, results in `RESULTS.md`).

## 1. Why this problem is hard

Persian script writes consonants and long vowels but **not short vowels** (a, e, o), and a Finglish typist chooses vowels freely:

* `salam` / `slm` / `salaam` / `saalam` → سلام   (same word, four spellings)
* `bekhar` → بخر "buy!" or بخار "steam"?   `sher` → شعر / شر / شهر?   `dar` → در / دار / دور / دره?
* the same Persian letter has several Latin spellings (`kh x` → خ, `gh q g` → ق/غ, `s c` → س, `z` → ز/ذ/ض/ظ, `j` → ج/ژ) and the same Latin letter
  has several Persian ones (`s` → س ص ث, `t` → ت ط, `h` → ه ح)
* و ی ه ا ع are sometimes vowels, sometimes consonants, sometimes silent (`khab` خواب: the و is not pronounced)

So the engine answers: *which Persian word was most probably typed as this Latin string?*

## 2. Pipeline

```
typed "ketabhayeman"
   │ normalizeLatin            lower-case, squeeze 3+ repeats, strip accents          normalize.js
   ├─► RETRIEVE  skeleton keys → lexicon buckets                                        skeleton.js, lexicon.js
   ├─► PROPOSE   char-LM beam search → unseen words (names, slang)                      oov.js, charlm.js
   ├─► COMPOSE   base word + clitic (ها، های، م، ش، مان …) → unseen inflections         morph.js
   ├─► SCORE     every candidate:  −channelCost(typed | word) + λ·ln P(word | context)  channel.js, engine.js
   ├─► ALIASES   exact shortcuts rank first (the built-in English spellings)         engine.js
   └─► RANK      sort, de-duplicate, ZWNJ policy, personal learning boost → top N
```

## 3. Retrieval — the consonant skeleton

Each Persian letter is either **strong** (a consonant that Finglish always types as a consonant) or **weak** (ا آ و ی ه ع ء ئ ؤ أ إ: vowel-ish).
Strong letters that Finglish cannot tell apart share a class: `{س ص ث}=S {ز ذ ض ظ}=Z {ت ط}=T {ق غ}=Q`.
The **skeleton** of a word is its strong-letter classes: سلام → `SLM`, خوبی → `XB`, کتاب → `KTB`.
Every lexicon word is indexed under its skeleton (`lexicon.js`).

A typed string maps to the *set* of skeletons it could mean (`skeleton.js`): vowels and glides `a e i o u y v w '` vanish; digraphs `kh sh ch zh gh` become one class
(and a split reading is explored too); ambiguous letters fan out (`h`→{H,∅}, `j`→{J,W}, `g`→{G,Q}, `c`→{K,C,S}, `x`→{X,KS}); doubled consonants collapse or stay;
a trailing `-an` may be *tanvin* (`lotfan` → لطفا). So `salam`, `slm`, `salaam` all hit the `SLM` bucket. Buckets are sorted by corpus frequency; the top 400 per
bucket are scored. Retrieval is a hash lookup, so it is O(1) in lexicon size.

## 4. The channel model — "how would someone type this word?"

`cost(x | w)` = the cheapest **alignment** of the typed string `x` against the word's letters, in nats (−ln p). A small dynamic program walks the letters;
each letter *emits* a Latin chunk, and between letters the typist may type an unwritten short vowel (a "slot"). Every number is a table entry in `channel.js`.

* **Consonants** have a primary spelling and alternatives: خ `kh`(0.15) `x`(1.8); ق `gh`(0.6) `q`(0.8) `g`(2.8); س `s`(0.08) and `c`(2.0) *only before e/i/y* (`merci`);
  ژ `zh j z`; چ `ch` `c`; typed twice costs +0.8 (tashdid).
* **Vowel-ish letters** are context-dependent options: ا at the start `a e o aa`, in the middle `a aa` or nothing; و `oo u o ou v` or silent after خ before ا; ی `i ee y` or `iy` before ا;
  ه at the end `e eh a h`; ع `' a e o ae` or nothing; two-letter spellings (او → `oo u`, ای → `i ee`; کس → `x` as in *taxi*).
* **Slots**: typed `a e o i u aa oo ee` with no corresponding letter, between letters (not next to ا). An end-of-word `e` is the *ezafe* (cost 2.75).
* **Vowel-style detector** (`vowelStyleFactor`): if the user typed *no* vowels (`slm`, `ktb`), omitted vowel letters are cheap (×0.2); with sparse vowels ×0.55; otherwise
  dropping a long-vowel letter is expensive. This is why `bad` → بد while the vowel-less `bd` ranks بود, بعد, بده and still reaches باید.
* **`ay` rule**: a typed `a` that is not the alef, directly before a glide `y`, is penalised (+1.9): `chay` → چای, not چی.
* **Phonetic tolerance**: the engine keeps a bounded alternate where a short vowel is written before the neighbouring consonant pair (`shork` can still reach `شوکر` through `shokr`) and penalizes a leading vowel-like letter that the typed consonant sequence skips (`jale` ranks ژاله/جاله ahead of عجله). These are general alignment rules, not word aliases.
* **Pronunciation hints** (§6): bonus/penalty when a typed vowel matches/contradicts the real pronunciation.

Why a DP and not rules? Because the same typed string is explained by many alignments; the DP finds the cheapest one *per word*, and the prior (§5) arbitrates *between words*.

## 5. The prior — "which word is it likely to be?"

`score(w | x) = −cost(x | w) + λ · ln P(w | context)`   with λ = 0.512 (language-model weight).

* **Lexicon** (292,057 forms): blended unigram probabilities, `P = 0.7·P_subtitles + 0.3·P_wikipedia` — chat is closer to film dialogue than to an encyclopaedia
  (`tools/build_lexicon.py`). The blend weight was swept 0.5–0.95: MRR moved ≤ 0.006, so 0.7 stays.
* **Mixture with a character model**: `P(w) = (1−ρ)·P_lexicon(w) + ρ·P_charLM(w)`, ρ = 0.03. A trigram character LM (`charlm.js`, trained on the lexicon at load, ~20 ms)
  gives a probability to *any* letter string, so unseen words compete fairly with rare lexicon words.
* **Out-of-vocabulary proposals** (`oov.js`): a beam search (90 states) over Persian letters using the channel in reverse plus the char LM; its top strings are re-scored by the
  exact DP like everything else (the beam's cheap context-free approximation can only *miss* a proposal, never mis-cost one). Per-position option lists are precomputed
  per query: 10 ms → 2 ms.
* **Morphology** (`morph.js`): for inputs ≥ 5 letters, split `head + tail`; if the tail's skeleton equals a known clitic's, take the best lexicon candidates for the head and attach the clitic with
  its orthographic variants (خانه+م → خانهام, خانه+ی → خانهای). Prior = `P(base)·ρ_suffix`, where `ρ_suffix` was **measured from the corpus** (`tools/suffix_stats.py`:
  `ln ρ` = −1.7 for ی, −2.3 for م, −4.3 for ها, −8.6 for هایمان …), times a generator mass of 0.1. This makes `ketabhayeman` → کتابهایمان (the char LM alone preferred کتبهایمان).

## 6. Pronunciation hints (the "vowel quality" signal)

Persian spelling hides *which* short vowel is pronounced, but Wiktionary lists a romanisation for ~20k headwords (`salâm`, `ešġ`, `boxâr`).
`tools/hints.py` aligns each word's letters with its phonemes (a small DP) and stores a compact string: the short vowel before every letter, and the vowel each vowel-letter realises.
12,636 lexicon words (the most frequent ones) carry hints. In the channel, a typed vowel that **matches** the pronounced one is rewarded (−0.30) and one that **contradicts** it is
penalised (+0.90); typed vowels where none is pronounced cost +0.40. Effect (held-out set): top-1 89.5% → 91.8%. It resolves عاشق (`âšeġ`) vs عشق (`ešġ`) for `ashegh`/`eshgh`.
Words without hints are unaffected, and where Wiktionary lists several readings the best one is used.

## 7. Context, aliases, learning, ZWNJ

* **Previous-word context** (`setBigrams`): `P(w | prev)` interpolated with the unigram, weight `n/(n+30)` capped at 0.6, from 245k subtitle bigram pairs. An unseen successor loses ≤ 0.9 nats.
  Effect on chat sentences: 95.2% → 96.1% top-1, no regressions; stronger weights *hurt* (ctxWeight 2 → 93.9%).
* **Aliases** (`data/aliases.tsv`): exact Latin keys for things no phonetic model can know — `whatsapp`, `tv`, `taxi`, `deadline`. They rank first. The engine API can also take the user's own (`setUserAliases`, they outrank built-in ones), but no app exposes it: a “My shortcuts” box existed in both apps and was removed on 2026-10-11 (it silently ignored entries separated by a single space, and its example text rendered with one space, so entries copied from it never matched).
* **Learning** (`learn()`): each committed choice gets an immediate exact-input bonus, so one deliberate choice is visible first on the next query even when the choice was the generated letter-by-letter row; the same Persian result also gets a `4 + 1.5·ln(count)` cross-spelling bonus. The exact input/result pairs remain exportable/importable (the app keeps them in `localStorage`).
* **ZWNJ policy**: `zwnj: 'off'` (default) strips U+200C; `'auto'` uses the orthographic half-space form where the corpus shows one (می‌خواهم). **Fixed 2026-10-11 (a user typing with the setting on saw «به‌ت», «ا‌ز», «د‌ر»):** the corpus half-space forms were ~77 % junk (a stray half-space inside ordinary words), so a form is now shown only when it is one of the regular patterns — the verb prefix می‌/نمی‌, the plural ‌ها/‌های…, the comparative ‌تر/‌ترین, or a clitic after a final ه (خانه‌ام, خانه‌ای) — with a short exception list (میخ, میهن, میان…, تنها, بهتر, بیشتر, کمتر…) and the same rule applied to forms the engine builds itself (`genuineHalfSpace` in `lexicon.js`; 3,135 of 13,839 forms stay). Not covered: compounds (برنامه‌نویسی, همین‌طور). Tests: `tests/engine.test.js` (includes a property check over every benchmark input) and `mac/Tests/main.swift` (real engine in JavaScriptCore). In the apps it is one checkbox (stored as `off`/`auto`).

## 7b. Letters and letter-by-letter spelling (`letters.js`, option `letters`, default on)
The lexicon has words, not letters (single stray letters are dropped when it is built), so a lone `s` ranked the word اس and `h` the word ها.
Two rules fix that (found by the user, 2026-10-11):
* **A single key** — one letter, or `sh ch kh gh zh`, or the doubled long vowels `aa ee oo` — lists its own letters first (`s` → س ص ث ش · `h` → ه ح · `sh` → ش · `ee` → ی ای), then the usual ranking. Aliases still come before the letters. The table is our own (`letters.js`), most frequent Persian letter first.
* **Letter-by-letter spelling** — every typed key becomes its own letter in order (`mmd` → ممد; `a i o u y w v` → ا ی و و ی و و; short `e` is not written, a final `e` is ه: `mehr` → مهر, `bache` → باچه). It is the *last* row: appended when there is room, and it replaces the last row only of a long list (`max ≥ 10`, the apps ask for 18). It never takes the first place and never trims a short list, so the benchmarks (`max` 9) and the frozen vectors (`max` 5) are unaffected. If the user picks it, it is learned like any other choice.
Measured: top-1 identical with the option on and off on all three gold sets (596/596, 245/245, 103/103 correct). Tests: `tests/engine.test.js`, `tests/e2e/smoke.js`, `mac/Tests/main.swift`, 17 new parity vectors.

### 7c. Tried and rejected: "the closest letter-for-letter match first" (2026-10-11)
Request: for `bahat` show باهات (every typed letter written) before بهت (the two typed `a` left out). Measured on the three gold sets: among the real words within a small score margin, choose the one with the lowest letter-match cost.
Net top-1 (fixed / broken): margin 0.25 → natural_1 +3/−3, held-out +1/−2, inflected +0/−5; margin 0.5 → +5/−6, +2/−6, +0/−8; margin 1 → +5/−14, +4/−12, +1/−14; margin 2 → +7/−43, +4/−26, +1/−22.
It breaks everyday words (دوستم→دوستام, خسته→خواسته, قبل→قابل, تب→تاب, بد→باد, کتابهای→کتابها): Persian leaves short vowels out but people type them anyway, so the closest letter match is often the wrong word. Also measured: the top suggestion is already a real lexicon word in 979 of 1,021 inputs; in the other 14 it is an engine-built inflection and 8 of those are right, so a strict “words before non-words” rule would break 8 to fix 1. Not adopted.
What works instead: type the long vowel doubled (`baahat` → باهات first), and learning (one pick of باهات makes it first for `bahat`).

## 8. Parameters and how they were set

| parameter | value | role |
|---|---:|---|
| `lambda` | 0.512 | weight of the prior vs the channel |
| `rho` / `morphRho` | 0.03 / 0.1 | mass of the char-LM / morphology generators |
| `vowelScale` `insScale` `omitScale` | 1.56 / 1.25 / 0.8 | vowel-letter, unwritten-vowel and dropped-letter cost multipliers |
| `ezafeCost` `ayPenalty` `doubleCost` | 2.75 / 1.88 / 0.8 | see §4 |
| `lazyOmit` `sparseOmit` | 0.2 / 0.55 | vowel-style detector |
| `hintScale` | 1.0 | strength of pronunciation hints |
| `ctxWeight` `ctxK` | 1.0 / 30 | context strength / smoothing |
| `phoneticVariantCost` `leadingWeakOmit` | 0.5 / 2.0 | bounded vowel-placement tolerance / leading skipped vowel-like letter penalty |

Initial values are linguistic priors; `tools/tune.js` (coordinate descent, train/dev split, 80/20) moved them once. **A second tuning round was rejected**: it improved its own training
split (obj 0.9662 → 0.9702) but *lowered* the dev split (0.9826 → 0.9761) and the independent held-out set (MRR 0.948 → 0.938) — classic over-fitting, driven by shrinking λ. The values above are the
pre-round-2 ones. Independent checks matter: see `RESULTS.md` (the `natural_2` set was written after tuning froze and is never used by the tuner).

## 9. Complexity and speed

Per keystroke (median / p95 / max over 1,008 benchmark inputs, Node 24, Apple Silicon): see `RESULTS.md`. Retrieval: hash lookups; scoring: ≈ (candidates ≤ 400·variants) × O(|word|·|typed|·options);
OOV beam: O(beam · typed · options-that-fit); lexicon load ≈ 0.5 s (parse + index + char-LM training), memory: see the measured figure in `RESULTS.md`.
A 118k-word lexicon (`build_lexicon.py --min-sub 10 --min-wiki 20`) scores the same on the standard benchmarks and is 2.5× smaller — the right choice for a lean native build.

## 10. Known limits

* Pure typos (`fim` for `film`) are not corrected; English spellings need aliases.
* No sentence-level model beyond the previous word; long-range agreement is invisible.
* Pronunciation hints cover 4% of forms (the frequent ones); colloquial spellings (میخوام) have none.
* The prior is subtitle/Wikipedia text from the 2010s; slang and brands newer than that need aliases or learning.
* Ambiguity is irreducible without context: `sher` is شعر, شر *and* شهر. The candidate list exists for exactly this.

## 11. Ideas, in order of expected value

1. More hint coverage: train a small G2P (vowel predictor) on the 12k aligned words to hint the other 280k forms.
2. A real trigram word LM from a bigger colloquial corpus (chat/Telegram), replacing the subtitle bigrams.
3. Typo-tolerant retrieval (one edit in the skeleton).
4. Prefix completion as an opt-in.
5. Learn the channel table by EM from the user's own accepted choices.
