# Madinah Ethical AI Competition: crowd-table holes

Kaggle: <https://www.kaggle.com/competitions/MDA-Ethical-AI-KAUST-Academy> (the leaderboard is the qualifier for the in-person hackathon).

## Files

| file | what |
|---|---|
| `madinah_notebook.ipynb` | **Upload this to Kaggle** (File → Import Notebook), attach the competition data, Run All, and submit `/kaggle/working/submission.csv`. Runs in about 2 minutes on CPU with no internet. |
| `solution.py` | Same code as a script: `python solution.py --data DIR` writes `submission.csv`; `--cv` validates on the training days. |
| `submission.csv` | Ready-made submission produced by the script from the released data. |
| `build_notebook.py` | Regenerates the notebook from `solution.py`. |
| `make_synthetic.py` | Fake data in the same schema, for smoke tests only. |

## Approach

The training recordings are masked again and again to look like a test day: a hidden place (`{cam_B, cam_G}` / `{cam_D}`, as on the test days), a 30-minute blank after every `now`, and 5–20 minute drop-outs. Each hole kind gets its own model:

| kind | model | validation ratio (lower is better) |
|---|---|---|
| forecast | LightGBM (L1) on the change from the last value. Features: trailing means and slopes, a weekday × minute profile from the training days, distance to each prayer time (computed from the sun for Madinah), and the whole plaza's trend. Does not depend on camera identity, so it also works for the new test-only cameras I–M. | 0.647 |
| hidden | Average of LightGBM (raw), LightGBM (log) and a log-linear Huber regression on the other cameras' smoothed counts at that minute. | 0.714 |
| hidden-future | LightGBM on the other cameras up to `now`, plus the hidden model's estimated track up to `now` (out-of-fold in training). | 0.855 |
| missing | LightGBM on the residual from linear interpolation, using how the other cameras moved away from their own interpolation across the same gap. Also trained on gaps simulated in the released test rows (the rules allow this for missing holes). | 0.873 |
| **mean** | | **0.772** |

Validation is leave-one-day-out on the two full training days (11 and 12 Sep), with holes simulated like the test days. For comparison, the organizers say their gradient-boosting baseline scores about 0.81. The real leaderboard will differ: there are only two test days, and the private board is a single recording.

## Same-week data

The other test day is used where the rules allow it: the hidden model of each test day also learns from the other test day (where that camera is visible), and the 19 Sep forecast and hidden-future models also learn from 18 Sep (all of it is before any 19 Sep `now`). The 18 Sep forecast and hidden-future models never see 19 Sep. On a training analog (predict 12 Sep from the week before, with and without 11 Sep), the extra day improved forecast 0.93 → 0.83 and hidden 0.71–0.98 → 0.66–0.73. Turn it off with `--no-same-week`.

## Leaderboard history

| version | public | change |
|---|---|---|
| v1 | 0.835 | first model |
| v3 | 0.792 | prayer-aligned time (crowd timing moves ~7 min earlier per week; probes showed forecast at 1.008) |
| v4 | ? | same-week data |

## Rules check

- Forecast and hidden-future features only read rows at or before `now` (trailing windows). The hidden track feature uses windows that reach at most 10 minutes ahead, and every camera is blank for 30 minutes after `now`, so it never sees a row after `now`.
- The forecast and hidden-future models are trained on `train.csv` only.
- Hidden and missing holes use the whole released table, which the rules allow.
- The competition data is **not** committed (Kaggle rules); keep this repository private while the competition runs.
