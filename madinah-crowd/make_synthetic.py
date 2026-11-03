#!/usr/bin/env python3
"""Write FAKE data in the competition's schema, to smoke-test solution.py.

The numbers are invented (prayer-time bumps + noise). Scores on this data say
nothing about the real leaderboard; use the real Kaggle files for that.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from solution import HMAX, prayer_times, simulate  # noqa: E402

RECS = [("20260904_1105", "2026-09-04", "Fri", "11:05", "14:30", "train"),
        ("20260905_0426", "2026-09-05", "Sat", "04:26", "08:00", "train"),
        ("20260905_1124", "2026-09-05", "Sat", "11:24", "13:37", "train"),
        ("20260905_1900", "2026-09-05", "Sat", "19:00", "21:44", "train"),
        ("20260911_1100", "2026-09-11", "Fri", "11:00", "21:14", "train"),
        ("20260912_1100", "2026-09-12", "Sat", "11:00", "21:14", "train"),
        ("20260918_1100", "2026-09-18", "Fri", "11:00", "21:14", "test"),
        ("20260919_1100", "2026-09-19", "Sat", "11:00", "21:14", "test")]
UNITS = [f"cam_{c}" for c in "ABCDEFGH"]


def hm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def main(out):
    rng = np.random.default_rng(1)
    os.makedirs(out, exist_ok=True)
    scale = rng.uniform(5, 60, len(UNITS))
    lag = rng.uniform(-8, 8, len(UNITS))
    tr_rows, te_rows, sub_rows, rec_rows = [], [], [], []
    for name, day, wd, f, l, split in RECS:
        a = int(f[:2]) * 60 + int(f[3:])
        b = int(l[:2]) * 60 + int(l[3:])
        mods = np.arange(a, b + 1)
        T = len(mods)
        pt = prayer_times(day)
        crowd = np.full(T, 0.15)
        for k, p in enumerate(pt):
            amp = 1.6 if (wd == "Fri" and k == 1) else 1.0
            crowd += amp * np.exp(-0.5 * ((mods - p - 10) / 18) ** 2)
        Y = np.zeros((T, len(UNITS)))
        for u in range(len(UNITS)):
            ar = np.zeros(T)
            for t in range(1, T):
                ar[t] = 0.9 * ar[t - 1] + rng.normal(0, 0.05)
            c = np.interp(mods + lag[u], mods, crowd)
            Y[:, u] = np.clip(scale[u] * c * (1 + ar) + rng.normal(0, 1.5, T), 0, None)
        for _ in range(5):  # natural footage gaps
            s = rng.integers(0, T - 3)
            Y[s:s + rng.integers(1, 4), rng.integers(len(UNITS))] = np.nan
        rec_rows.append(dict(recording=name, day=day, weekday=wd, first=f, last=l, minutes=T, split=split))
        base = dict(recording=name, day=day, weekday=wd)
        if split == "train":
            for t in range(T):
                for u, un in enumerate(UNITS):
                    tr_rows.append({**base, "unit": un, "minute": hm(mods[t]), "minute_of_day": mods[t],
                                    "people": Y[t, u]})
            continue
        Yp = np.vstack([Y, np.full((HMAX, len(UNITS)), np.nan)])
        M, H = simulate(Yp, rng, [int(rng.integers(len(UNITS)))])
        M[T:] = np.nan
        for t in range(T):
            for u, un in enumerate(UNITS):
                if not np.isnan(M[t, u]):
                    te_rows.append({**base, "unit": un, "minute": hm(mods[t]), "minute_of_day": mods[t],
                                    "people": M[t, u]})
        for kind, arr in H.items():
            for u, t, h in arr:
                tm = a + t + h
                if tm > b:
                    continue
                hid = f"{name}_{UNITS[u]}_{hm(tm).replace(':', '')}"
                row = {**base, "id": hid, "unit": UNITS[u], "minute": hm(tm), "minute_of_day": tm,
                       "people": np.nan, "kind": kind}
                if h:
                    row.update(now=hm(a + t), now_minute_of_day=a + t, horizon=h)
                te_rows.append(row)
                sub_rows.append(dict(id=hid, people=float(np.nanmean(M[max(0, t - 5):t + 1, u])
                                                           if not np.isnan(M[max(0, t - 5):t + 1, u]).all()
                                                           else 0.0)))
    pd.DataFrame(tr_rows).to_csv(f"{out}/train.csv", index=False)
    pd.DataFrame(te_rows).to_csv(f"{out}/test.csv", index=False)
    pd.DataFrame(sub_rows).fillna(0).to_csv(f"{out}/sample_submission.csv", index=False)
    pd.DataFrame(rec_rows).to_csv(f"{out}/recordings.csv", index=False)
    print(f"fake data written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "synthetic_data")
