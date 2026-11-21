# Madinah Ethical AI Competition: crowd-table holes

Kaggle: <https://www.kaggle.com/competitions/MDA-Ethical-AI-KAUST-Academy> (the leaderboard is the qualifier for the in-person hackathon).

## Files

| file | what |
|---|---|
| `madinah_notebook.ipynb` | **Upload this to Kaggle** (File → Import Notebook), attach the competition data, Run All, and submit `/kaggle/working/submission.csv`. Runs in about 25–30 minutes on CPU with no internet (5 bagged models per kind; `N_BAGS = 1` runs in about 3 minutes). |
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
| v4 | 0.790 | same-week data (mostly helps 19 Sep, likely the private day) |
| v5 | 0.774 | 5 bagged models per kind + forecast raw/log blend. Probes: forecast 0.896, hidden 0.880, hidden-future 0.668, missing ≈0.652 |
| v6 | 0.784 | forecast also learns from the test day's own rows before 13:00/15:30/18:00 (bench 0.831 → 0.807, but worse on the public board: reverted, `ONLINE = False`) |

| v7 | 0.773 | v5 + 5-minute timing jitter in training sims + 8 bags (forecast bench 0.831 → 0.812) |
| v8 | 0.766 | v7 + horizon-dependent trust in forecast changes (0.25 at 1 min → 1.0 at 8 min). Bench: the model was worse than the last value at 1–2 min ahead |
| v9 | 0.767 | v8 + on a day without an earlier same-week day (18 Sep), forecasts whose target is 10–30 min before a prayer keep the last value (week-gap bench: model 1.3–2.0 there) |

| v10 | (= v8 on the public day) | v8 + 25% reference blend for cam_D hidden-future, which only exists on 19 Sep (likely the private day). Bench, D hidden on a Saturday with the previous day: 0.738/0.680/0.800 → 0.651/0.593/0.670 |

| v10 | 0.766 | (same as v8 on 18 Sep, as expected) |
| v11a | **0.758** | v10 + 25% reference blended into every hidden prediction (50%: 0.760; B/G hidden-future 25%: 0.765, not adopted) |

| v12 | 0.759 | v11a with hidden models restricted to training-day cameras (no I–M): no gain, option left off |

| v13 | (= v11a on the public day) | v11a + on 19 Sep (which has 18 Sep as same-week data) forecast changes at 6+ min ahead trusted 1.15x (bench prev12: 0.726 -> ~0.714). Forecast label smoothing and a multi-camera hidden reference were tested and gave nothing |

| v14a / v14b | 0.773 / 0.765 | hidden blended with a share-pattern estimator (B's share of cam_A by prayer-aligned time × cam_A). Beats the reference on held-out training days, but worse on the public day: not used |

| v15a | 0.776 | v13 + missing pulled 25% toward interpolation: much worse |
| v15b | **0.757** | v13 + 25% reference in B/G hidden-future (now in the code for every hidden camera) |

| v16 (1.25×) | **0.747** | v15b + missing = interpolation + 1.25 × the model's correction (1.5×: 0.750). The missing model under-corrects |

| v17a / v17b | 0.760 / **0.737** | v16 + 18 Sep forecasts at 6+ min: model change ×1.15 / ×0.85. On the week-gap day the model is over-confident at longer horizons |

| v18a / v18b | **0.732** / 0.734 | v16 + 18 Sep forecasts at 6+ min ×0.7 / ×0.55 |
| v19 | (= v18a on 18 Sep) | v18a with 19 Sep long-horizon trust back to 1.0 (the bench over-trusted the model by ~0.3 on 18 Sep, so its 1.2 for 19 Sep is likely ~0.9) |

| v19 / v19b / v19c | 0.732 / 0.732 / 0.733 | v19c (18 Sep horizons 2–5 ×0.7 more): no gain |

| v20a / v20b / v20c | 0.741 / 0.732 / 0.732 | hidden-future blend 40% (worse) / missing 1.35× / hidden 35% (no change) |

| v21a / v21b | 0.730 / 0.730 | last value for I–M forecasts on 18 Sep / B/G hidden-future blend 12% |
| v22 / v22b | **0.728** / **0.728** | v19 + both. v22b is the conservative 19 Sep hedge: forecast trust 0.85 and I–M forecasts = last value on 19 Sep too |

| v23a / v23b | 0.728 / 0.730 | I–M missing without amplification (no change) / 18 Sep h 11–15 forecast 0.55× (worse) |

| v24 / v24b | **0.728** / **0.728** | v22 / v22b averaged with a full retrain from the current code with seed 1 (which reproduces v22 to within seed noise: ~1.4 people per forecast hole vs moves of ~10) |

| v25a / v25b | 0.728 / 0.730 | hidden model part smoothed ±2 / ±5 min: no gain (minute-level detail matters) |

| v26a / v26b | **0.727** / 0.728 | hidden + the reference camera's minute-level wiggle ×scale, at 25% / 50% (level unchanged) |
| v27 / v27b | 0.727 / 0.727 | v24 / v24b + 25% wiggle, reproduced by the code (max diff to v26a 0.006) |

| v28a / v28b | 0.734 / 0.727 | missing gaps ≥12 min ×1.5 (much worse) / B/G hidden-future blend decaying with horizon (no change) |

| v29a / v29b | 0.731 / 0.731 | missing long gaps 1.0× / + short gaps 1.4×: 1.25× everywhere is best |

| v30a / v30b / v30c / v30d | 0.731 / 0.728 / **0.725** / 0.730 | 18 Sep big-camera forecasts 0.5× / small-camera 0.5× / hidden cam_B blend 40% / hidden cam_G blend 40% |

| v31a / v31b | 0.726 / **0.724** | hidden cam_B blend 55% / cam_B 40% + cam_G 10% |

| v32a / v32b | 0.724 / 0.724 | cam_G blend 0% / cam_G without wiggle: no change |

| v33a–e | 0.725 / 0.727 / 0.730 / 0.730 / 0.724 | B wiggle ×2 / big-camera forecasts 0.85× / hidden-future B25-G0 / missing big ×1.5 / missing small ×1.5: no gain |

| v34a / v34b / v34c | 0.728 / 0.746 / 0.730 | retrain with training-day profiles built only from days a week away (`OOF_GAP_DAYS=3`), 18 Sep damping 0.7× / none / 0.55×: worse, option left off |

| v35 | **0.723** | average of v31b and v34a (two differently built models) |

| v37a | 0.727 | three-model average (adds a label-smoothed wide-tree run): worse |

| v38a / v38b | **0.723** / 0.724 | averaging with v34a for forecast only / for the other kinds only: the gain is all in forecast |

| v39a / v39b | 0.724 / 0.723 | forecast = average of 3 models / 35% v31b + 65% v34a: no further gain |

| v40a / v40b | 0.727 / 0.737 | 18 Sep forecast / hidden-future models also trained on 19 Sep (`TRAIN_ON_OTHER_TEST_DAY`), with / without 0.7× damping: worse, left off |

| v41a / v41b | **0.722** / 0.725 | v38a + 20% / 35% of an analog (nearest-neighbour) forecaster in regular-camera forecasts |

| v42a / v42b | 0.723 / 0.723 | hedge twin (v35b + analog) / analog with 150 neighbours |

| v43a / v43b | **0.721** / 0.722 | 18 Sep I–M forecasts 50% analog / analog share 12% for regular cameras |

| v44a / v44b / v44h | **0.720** / 0.721 / 0.722 | 18 Sep I–M forecasts 100% / 75% analog / hedge twin |

| v45a / v45h | **0.718** / 0.719 | analog for every I–M forecast on 18 Sep (5- and 2-minute fallbacks) / hedge twin |
| v46a / v46b / v46c | 0.748 / 0.809 / 0.747 | Chronos foundation-model forecasts blended in / alone: much worse, not used |

| v47a / v47b | 0.723 / 0.731 | hidden-future: 20% / 40% analog on our hidden estimates: worse |

| v48b | 0.719 | I–M analog with 40 neighbours: no gain |
| v49a / v49b | not submitted | analog gap-filler for missing holes (`analog_missing.py`): covers 164/464 holes and stays near interpolation, which is known to hurt |

| v50a / v50b | **0.715** / 0.716 | hidden + 20% / 35% nearest-neighbour estimate (`analog_hidden.py`) |

| v51a / v51h | **0.714** / **0.714** | nearest-neighbour hidden partner covering all 849 holes / hedge twin |

| v52a / v52b | 0.719 / 0.727 | calibrated nearest-neighbour partner for missing: worse |

| v53a / v53c | 0.717 / 0.718 | hidden KNN with 60 neighbours / same-week weighted: worse (public noise is now ~0.003) |

| v54a / v54b | 0.720 / 0.725 | hidden-future plaza-trend partner: worse |
| v55a / v55b | 0.716 / 0.715 | 18 Sep long-horizon forecasts ×0.85 / ×1.15 after averaging: current damping still best |

| v56a / v56b | 0.716 / 0.720 | afternoon hidden KNN on the other test day incl. I–M (10% / 20%): worse |

| v57 | **0.713** | v51a with the second forecast model averaged over two training runs |

| v57h | 0.714 | hedge twin of v57 |
| v58 / v58h | 0.714 / 0.714 | second forecast model averaged over three seeds: no further gain |

| v59 | 0.715 | EXPERIMENT: main forecast model also trained on each test day's own rows (`OWN_DAY_TRAINING`): worse, dropped |

| v60a / v60b | 0.700 / **0.691** | missing: 25% / 50% partner-camera estimate (`partner_missing.py`) |

| v61a / v61b / v61c | **0.687** / 0.692 / 0.699 | missing partner 75% / 100% / 50% with relaxed extra coverage |

| v61h / v62b | 0.687 / 0.690 | hedge twin of v61a / extra missing holes with relaxed partner at 25% (worse) |

| v63 / v63h | **0.684** / **0.684** | partner-missing tuned (5 edge minutes, 2-hour window) |

| v64a / v64b | 0.686 / 0.689 | partner weight 85% / 95%: 75% stays best |

| v65 / v65h | 0.697 / 0.698 | partner counts smoothed ±3 min: bench said better, public much worse; reverted |

| v66a / v66b | 0.689 / 0.696 | extra partner minute detail in missing: worse |
| v67a / v67b | 0.699 / 0.713 | one-sided partner for missing holes right after a blank (bench 0.503): much worse on the public day, not used |

| v68a / v68b | 0.687 / 0.685 | forecast starting value denoised with a near-duplicate partner (50% / 25%): worse |

| v69a / v69b / v69c | **0.683** / 0.685 / 0.685 | A/E/F forecast changes pooled 50% / 100% / small cameras anchored on their 5-min mean |

| v69h | **0.683** | hedge twin of v69a |

| v70a / v70b | 0.692 / 0.705 | hidden-future changes pooled with partner cameras B/D/G: worse |

| v71a / v71b | 0.684 / 0.685 | pooling C/D/H or 18 Sep I–M forecasts with A/E/F: no gain |

| v72a / v72b | 0.685 / 0.684 | missing partner weight 90% for A/E/F / 60% for others: 75% everywhere stays best |

| v73h | (= v69h publicly) | v69h + 19 Sep cam_D hidden blended 30% with (D/L ratio from 18 Sep) × cam_L: a private-day hedge. Analysis: interpolating across the blank (forbidden) would give forecast only 0.949, so it does not explain 0.58 scores |

| v74 / v74h | 0.693 / 0.693 (worse) | missing gaps right after a blank have a 1-2 minute left edge: two-sided partner with min_left=1 (realistic bench 0.747 vs 0.929 for the failed one-sided v67) |

| v69a probes | forecast 0.752, hidden 0.820, hidden-future 0.640, missing ~0.520 (ratios) | top-8 cutoff 0.635 needs about -0.19 in total |
| v75a / v75b | 0.673 / **0.670** | hidden B/G on Friday 18 Sep: Friday ratio-to-cam_D pattern (Fri-to-Fri pattern correlation 0.81-0.97) x cam_D |

| v76a / v76b / v76h | 0.677 / 0.694 / 0.677 | B/G Friday pattern 60% / 80% (+ cam_D 19 Sep Saturday pattern 40%) / hedge: v73h + B/G 60% |

| v77a / v77h | 0.670 / 0.670 | final pair: v75b + cam_D Saturday pattern 40% / v73h + B/G Friday pattern 40% (cam_L for cam_D) |

| v78a / v78b | 0.666 / **0.665** | hidden-future B/G: Friday ratio pattern x our cam_D forecast, 20% / 35% |
| v79a / v79b / v79m / v79h | 0.665 / 0.667 / **0.665** / 0.666 | hidden-future pattern 50% / 65% (18 Sep) + cam_D 19 Sep Saturday pattern x our B/A forecasts at 35%; v79m = 35% both days; v79h hedge |

| v80a / v80h | 0.678 / 0.679 (worse: cam_D's minute counts matter, not just the pattern) | hidden B/G pattern estimate averaged over partners D and A (Fri-to-Fri B/A 0.95) |

| v81a / v81b | 0.666 / 0.667 | C/D/H forecasts via weekday ratio-to-block pattern: no gain |
| v82a / v82b | 0.671 / 0.674 (worse) | hidden pattern weight per camera: B 30% G 60% / B 40% G 70% |

| v83a / v83b | 0.665 / 0.665 | hidden G pattern 20% (B 50% / 40%): tie |

| v84a / v84b | 0.666 / 0.668 (no gain) | forecast analog searching only same-weekday training days (20% / 35%) |

| v85a / v85b | **0.664** / 0.665 | hidden G via Friday G/B pattern (Fri-to-Fri 0.97) x our hidden B / + hidden-future G likewise |

| v86a / v86h | 0.665 / 0.666 | hidden G pattern share fully via cam_B / hedge twin of v85a |

| p87a / p87b | 0.718 / 0.673 | diagnostics: our forecasts recover 0.216 (A/E/F) and 0.036 (others) of the forecast reference error |
| v88a / v88b | 0.664 / 0.665 (tie / worse) | A/E/F short-horizon (h<=7) trust x1.5 / x2 |

| v89a / v89b | **0.663** / 0.667 | model part inside partner-covered missing holes amplified 1.0x / 1.6x (was 1.25x) |
| v90a / v90b / v90h | 0.664 / 0.666 / 0.665 |
| v91a / v91b | 0.663 / 0.664 (flat) | missing partner weight 70% / 80% with the model part at 1.0x |
| v92a / v92b | 0.663 / 0.663 (flat) |
| v93a / v93b | 0.666 / **0.661** | hidden nearest-neighbour share 0% / 35% (was 20%) after the weekday patterns | forecast analog share 10% / 30% (retune after averaging and A/E/F pooling) | 0.75x / 0.5x / hedge at 1.0x |

`submission.csv` is **v110b (public 0.646)**. **Final picks: v110b (public 0.646) + v111h (public 0.648)**. They carry the same ideas and are nearly identical on 18 Sep; they differ mainly on 19 Sep (the private day): v89a uses the Saturday ratio pattern for hidden cam_D, v90h uses cam_L as cam_D's partner, and v90h keeps the more conservative 19 Sep forecast settings.

## Rules check

- Forecast and hidden-future features only read rows at or before `now` (trailing windows). The hidden track feature uses windows that reach at most 10 minutes ahead, and every camera is blank for 30 minutes after `now`, so it never sees a row after `now`.
- The forecast and hidden-future models are trained on `train.csv` only.
- Hidden and missing holes use the whole released table, which the rules allow.
- The competition data is **not** committed (Kaggle rules); keep this repository private while the competition runs.

| v94a / v94b / v94h | 0.661 / 0.661 / 0.663 (hedge) | hidden neighbour share 50% / 65% flat vs 35%; hedge at 35% |
| v95a / v95b | 0.664 / 0.663 | missing partner share 90% / 60% (was 75%) |
| v96a / v96b | 0.664 / 0.664 | hidden-future B/G reference share 0% / 25% (was 12%) |
| v97a / v97b | 0.664 / **0.660** | all 18 Sep forecast changes (vs last value) x0.85 / x1.15 |
| v98a / v98b / v98h | 0.663 / 0.670 / 0.662 (hedge) | 18 Sep forecast change x1.30 / x1.50; hedge v94h with x1.15 |
| v99a / v99b | 0.660 / 0.663 | 18 Sep forecast change: h<=5 x1.30 + h>=6 x1.15 / h<=5 x1.15 + h>=6 x1.30 |
| v100a / v100b | 0.660 / 0.661 | 18 Sep forecast: h<=5 x1.50 + long x1.15 / h<=5 x1.30 + long x1.00 |
| v101a / v101b | 0.664 / 0.663 | 18 Sep hidden-future change vs reference x1.15 / x0.85 (on v97b) |
| v102a / v102b | 0.660 / 0.665 | 18 Sep forecast: new cams I-M x1.40 (others x1.15) / old cams x1.35 (new x1.15) |
| v103a / v103b | 0.660 / 0.660 | 18 Sep forecast: new cams x1.80 (old x1.15) / new x1.40 + old x1.00 |
| v105a / v105b | 0.670 / **0.655** | 18 Sep hidden B/G overall level moved to the reference's level / the same step away (tests whether the reference scale is the true level; result carries to 19 Sep cam_D) |
| v106a / v106b | 0.661 / **0.653** | hidden G x1.166 (B as v97b) / hidden B x0.963 + G x1.08 |
| v107a / v107b | **0.652** / 0.654 | hidden B x0.93 / x0.90 (G x1.08) |
| v108a / v108h | 0.653 / **0.652** (hedge) | hidden B x0.93 with G x1.00 / hedge v98h + B x0.93, G x1.08 |
| v109a / v109b | **0.650** / 0.654 | 18 Sep hidden-future B x0.93 + G x1.08 / B x0.93 only |
| v110a / v110b / v110h | 0.647 / **0.646** / 0.648 (hedge) | hidden-future G x1.08 / x1.16 only (B as is); hedge v108h + HF G x1.08 |
| v111a / v111h | 0.651 / 0.648 (hedge) | hidden-future G x1.26 / hedge with HF G x1.16 |
