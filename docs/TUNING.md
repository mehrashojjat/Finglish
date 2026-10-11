# Parameter tuning log

Tool: `tools/tune.js` — coordinate descent (×1.25 / ×0.8 steps) on objective 0.5·top1 + 0.5·MRR over the **train** split of `tests/gold/natural_1.tsv`
(hash(input) % 5 ≠ 0, 501 items); the **dev** split (20%, 129 items) is only reported.

## Round 1 (before pronunciation hints, aliases, morphology, context)
Start: hand-set priors (λ 0.8, vowelScale 1.0, insScale 1.0, ezafeCost 2.2, ayPenalty 1.2, omitScale 1.0).
Accepted: λ→0.512, vowelScale→1.5625, insScale→1.25, ezafeCost→2.75, ayPenalty→1.875, omitScale→0.8.
Train obj 0.9457 → 0.9654; dev obj 0.9593 → 0.9651 (dev top-1 94.6% → 95.3%). **Adopted** (dev improved too).

## Round 2 (after hints were added) — `tuning/tune_v2.log`, `tuning/tuned_v2.json`
Proposed: λ→0.328, omitScale→0.64, hintScale→1.25.
Train obj 0.9662 → 0.9702, but **dev obj 0.9826 → 0.9761 (top-1 97.7% → 96.9%)**, and on the independent held-out set `natural_2_heldout`
MRR 0.948 → 0.938 (top-1 91.8% → 90.7%). **Rejected** — over-fitting. Defaults stay at round 1's values; `hintScale` stays 1.0 (1.25 alone was neutral).

## Other sweeps (no change adopted)
* corpus blend α (subtitles vs Wikipedia): 0.5 / 0.7 / 0.85 / 0.95 → MRR 0.975 / 0.977 / 0.973 / 0.971 (natural_1) — kept 0.7.
* lexicon size (min counts): 427k / 292k / 193k / 118k words → same top-1 on natural_1/2; inflected set 0.961 / 0.954 / 0.948 / 0.948 — kept 292k.
* `morphRho`: 0.05 / 0.1 / 0.25 / 0.5 / 1.0 → inflected top-1 91.0 / 91.0 / 89.2 / 87.4 / 86.5 — adopted 0.1.
* `ctxWeight`: 0.5 / 1 / 1.5 / 2 / 3 → sentence top-1 95.2 / 96.1 / 95.2 / 93.9 / 92.6 — kept 1.0.
* OOV `beam`: 20 / 40 / 90 → held-out MRR 0.944 / 0.944 / 0.948 — kept 90 (made 4× faster by precomputing per-position options instead of narrowing).
