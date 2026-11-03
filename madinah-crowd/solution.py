#!/usr/bin/env python3
"""Madinah Ethical AI Competition (Kaggle: MDA-Ethical-AI-KAUST-Academy).

One LightGBM model per hole kind, trained on train.csv recordings that are
masked to look like the test days (30-minute blanks after each forecast `now`,
a hidden camera, 5-20 minute drop-outs). Every kind predicts the residual from
its reference, or a direct value, so the score ratio is pushed below 1.

Rules respected:
  * forecast / hidden-future features use only rows at or before `now`
    (causal trailing windows); those models are trained on train.csv only.
  * hidden / missing features may use the whole released table (centered
    windows); the missing model may also train on released test rows.

Usage:
  python solution.py --data DIR --cv          # validate on train (leave-one-recording-out)
  python solution.py --data DIR --out submission.csv
"""
import argparse
import math
import os
import sys
import time

import numpy as np
import pandas as pd
import lightgbm as lgb

LAT, LON, TZ = 24.4672, 39.6111, 3.0  # Madinah
PRAYERS = ("fajr", "dhuhr", "asr", "maghrib", "isha")
HMAX = 15
BLANK = 30
KINDS = ("forecast", "hidden", "hidden-future", "missing")
KNOWN = None  # cameras seen on training days; plaza totals use only these, because
              # cameras I-M switch on at 14:00 on test days and would make totals jump


# ----------------------------------------------------------------------------- utils
def hhmm(s):
    h, m = str(s).split(":")[:2]
    return int(h) * 60 + int(m)


def prayer_times(day):
    """Approximate Umm al-Qura prayer times (minute of day) for Madinah."""
    n = pd.Timestamp(day).dayofyear
    g = 2 * math.pi / 365 * (n - 1)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                    - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    dec = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
           + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    lat = math.radians(LAT)
    noon = 720 - 4 * LON - eqt + TZ * 60

    def ha(alt):
        c = (math.sin(math.radians(alt)) - math.sin(lat) * math.sin(dec)) / (math.cos(lat) * math.cos(dec))
        return math.degrees(math.acos(max(-1.0, min(1.0, c)))) * 4

    asr_alt = math.degrees(math.atan(1 / (1 + math.tan(abs(lat - dec)))))
    sunset = noon + ha(-0.833)
    return np.array([noon - ha(-18.5), noon + 1, noon + ha(asr_alt), sunset + 1, sunset + 91])


def nanroll(X, lo, hi):
    """NaN-aware mean over rows t+lo .. t+hi (inclusive), along axis 0."""
    T = X.shape[0]
    V = np.nan_to_num(X)
    C = (~np.isnan(X)).astype(float)
    z = np.zeros((1,) + X.shape[1:])
    cv = np.concatenate([z, V.cumsum(0)])
    cc = np.concatenate([z, C.cumsum(0)])
    t = np.arange(T)
    a = np.clip(t + lo, 0, T)
    b = np.clip(t + hi + 1, 0, T)
    s = cv[b] - cv[a]
    c = cc[b] - cc[a]
    with np.errstate(invalid="ignore", divide="ignore"):
        out = s / c
    out[c == 0] = np.nan
    return out


def ffill_idx(X):
    T = X.shape[0]
    idx = np.where(~np.isnan(X), np.arange(T)[:, None], -1)
    return np.maximum.accumulate(idx, axis=0)


def bfill_idx(X):
    T = X.shape[0]
    idx = np.where(~np.isnan(X), np.arange(T)[:, None], T)
    return np.minimum.accumulate(idx[::-1], axis=0)[::-1]


def take(A, i, j):
    """A[i, j] with NaN where i is out of range."""
    i = np.asarray(i)
    ok = (i >= 0) & (i < A.shape[0])
    out = np.full(i.shape, np.nan)
    out[ok] = A[i[ok], np.asarray(j)[ok] if np.ndim(j) else j]
    return out


# ----------------------------------------------------------------------------- data
class Rec:
    def __init__(self, name, day, weekday, first, Y):
        self.name, self.day, self.weekday, self.first = name, day, weekday, first
        self.Y = Y  # T x U, NaN = no count
        self.T = Y.shape[0]


def find_data_dir(d):
    if d and os.path.exists(os.path.join(d, "train.csv")):
        return d
    for root, _, files in sorted(os.walk("/kaggle/input", followlinks=True)):
        if {"train.csv", "test.csv", "sample_submission.csv"} <= set(files):
            return root
    sys.exit(f"train.csv not found in {d!r}")


def load(data_dir):
    tr = pd.read_csv(os.path.join(data_dir, "train.csv"))
    te = pd.read_csv(os.path.join(data_dir, "test.csv"))
    recs = pd.read_csv(os.path.join(data_dir, "recordings.csv"))
    units = sorted(set(tr["unit"]) | set(te["unit"]))
    uix = {u: i for i, u in enumerate(units)}
    out = {}
    for r in recs.itertuples():
        df = tr if r.split == "train" else te
        sub = df[(df["recording"] == r.recording)]
        first = hhmm(r.first)
        last = hhmm(r.last)
        if len(sub):
            first = min(first, int(sub["minute_of_day"].min()))
            last = max(last, int(sub["minute_of_day"].max()))
        T = last - first + 1 + (HMAX if r.split == "test" else 0)
        Y = np.full((T, len(units)), np.nan)
        s = sub[sub["people"].notna()]
        Y[s["minute_of_day"].to_numpy() - first, s["unit"].map(uix).to_numpy()] = s["people"].to_numpy()
        out[r.recording] = Rec(r.recording, str(r.day), str(r.weekday), first, Y)
        out[r.recording].split = r.split
    global KNOWN
    KNOWN = np.array([u in set(tr["unit"]) for u in units])
    holes = te[te["id"].notna()].copy()
    holes["u"] = holes["unit"].map(uix)
    return out, units, holes


# ----------------------------------------------------------------------------- profile
def build_profile(recs, U):
    """Mean people per (weekday, minute_of_day, unit), smoothed; falls back to all-days."""
    s = {}
    for r in recs:
        for key in (r.weekday, "all"):
            if key not in s:
                s[key] = [np.zeros((1440, U)), np.zeros((1440, U))]
            m = r.first + np.arange(r.T)
            ok = ~np.isnan(r.Y)
            s[key][0][m] += np.nan_to_num(r.Y)
            s[key][1][m] += ok
    prof = {}
    for key, (a, c) in s.items():
        with np.errstate(invalid="ignore"):
            p = a / c
        prof[key] = nanroll(p, -4, 4)
    allp = pd.DataFrame(prof["all"]).interpolate(limit_direction="both").to_numpy().copy()
    allp[:, np.isnan(allp).all(0)] = np.nan  # camera never on training days
    for key in list(prof):
        p = prof[key]
        prof[key] = np.where(np.isnan(p), allp, p)
    prof["all"] = allp
    return prof


# ----------------------------------------------------------------------------- simulation
def simulate(Y, rng, hidden, n_gaps=15, start=(15, 45), between=(8, 40)):
    """Mask a fully-known recording like a test recording. Returns M and holes."""
    T, U = Y.shape
    M = Y.copy()
    M[:, list(hidden)] = np.nan
    blank = np.zeros(T, bool)
    nows = []
    t = int(rng.integers(*start))
    while t + HMAX < T:
        nows.append(t)
        blank[t + 1:t + 1 + BLANK] = True
        t += BLANK + int(rng.integers(*between))
    M[blank] = np.nan
    visible = [u for u in range(U) if u not in hidden]
    gaps, tries = [], 0
    used = np.zeros((T, U), bool)
    while len(gaps) < n_gaps and tries < 2000:
        tries += 1
        u = int(rng.choice(visible))
        L = int(rng.integers(5, 21))
        a = int(rng.integers(1, max(2, T - L - 1)))
        b = a + L - 1
        if b + 1 >= T or blank[a - 1:b + 2].any():
            continue
        if used[a - 1:b + 2, u].any() or np.isnan(M[a - 1, u]) or np.isnan(M[b + 1, u]) \
                or np.isnan(M[a:b + 1, u]).all():
            continue
        M[a:b + 1, u] = np.nan
        used[a:b + 1, u] = True
        gaps.append((u, a, b))
    H = {k: [] for k in KINDS}
    li = ffill_idx(M)
    for now in nows:
        for u in range(U):
            for h in range(1, HMAX + 1):
                if now + h >= T or np.isnan(Y[now + h, u]):
                    continue
                if u in hidden:
                    H["hidden-future"].append((u, now, h))
                elif li[now, u] >= 0 and now - li[now, u] <= 5:
                    H["forecast"].append((u, now, h))
    rel = np.where(~blank)[0]
    for u in hidden:
        for t in rel:
            if not np.isnan(Y[t, u]):
                H["hidden"].append((u, t, 0))
    for u, a, b in gaps:
        for t in range(a, b + 1):
            if not np.isnan(Y[t, u]):
                H["missing"].append((u, t, 0))
    H = {k: np.array(v, dtype=int).reshape(-1, 3) for k, v in H.items()}
    return M, H


# ----------------------------------------------------------------------------- features
class Feat:
    """Feature builder for one (masked) recording."""

    def __init__(self, M, rec, prof):
        self.M = M
        self.T, self.U = M.shape
        self.mods = rec.first + np.arange(self.T)
        self.fri = float(rec.weekday.startswith("Fri"))
        self.prof = prof.get(rec.weekday, prof["all"])
        self.pt = prayer_times(rec.day)
        self.li = ffill_idx(M)
        self.ri = bfill_idx(M)
        self.tm = {w: nanroll(M, -w + 1, 0) for w in (3, 5, 10, 15, 30)}
        self.cm = {w: nanroll(M, -w, w) for w in (1, 2, 5, 10)}
        k = KNOWN if KNOWN is not None else np.ones(self.U, bool)
        self.tot5 = np.nansum(self.tm[5][:, k], 1)
        self.tot15 = np.nansum(self.tm[15][:, k], 1)
        self.tot30 = np.nansum(self.tm[30][:, k], 1)
        self.totc2 = np.nansum(self.cm[2][:, k], 1)
        self.nvis = (~np.isnan(self.cm[2][:, k])).sum(1)

    def pfeat(self, mod):
        d = np.clip(np.asarray(mod, float)[:, None] - self.pt[None, :], -300, 300)
        near = d[np.arange(len(d)), np.abs(d).argmin(1)]
        cols = {f"d_{p}": d[:, k] for k, p in enumerate(PRAYERS)}
        cols["d_near"] = near
        cols["mod"] = np.asarray(mod, float)
        cols["fri"] = np.full(len(d), self.fri)
        return cols

    def P(self, mod, u):
        return self.prof[np.clip(np.asarray(mod), 0, 1439), u]

    def last(self, now, u):
        i = self.li[now, u]
        return np.where(i >= 0, self.M[np.maximum(i, 0), u], np.nan), now - i

    # -- forecast: causal
    def forecast(self, u, now, h):
        f = {}
        last, age = self.last(now, u)
        f["last"], f["age"] = last, age
        for w, A in self.tm.items():
            f[f"tm{w}"] = A[now, u]
        f["slope"] = f["tm3"] - f["tm15"]
        f["slope2"] = f["tm5"] - f["tm30"]
        mn, mt = self.mods[now], self.mods[now] + h
        pn, pt = self.P(mn, u), self.P(mt, u)
        f["p_now"], f["p_tgt"], f["p_d"] = pn, pt, pt - pn
        f["lvl"] = f["tm5"] / (pn + 1)
        f["ratio_pred"] = f["tm5"] * (pt + 1) / (pn + 1)
        f["tot_r1"] = self.tot5[now] / (self.tot15[now] + 1)
        f["tot_r2"] = self.tot5[now] / (self.tot30[now] + 1)
        for v in range(self.U):
            f[f"tr_{v}"] = self.tm[5][now, v] / (self.tm[30][now, v] + 1)
        f.update(self.pfeat(mt))
        f["mod_now"] = mn
        f["h"] = h
        X = pd.DataFrame(f)
        base = np.where(np.isnan(last), f["ratio_pred"], last)
        base = np.where(np.isnan(base), pt, base)
        return X, base

    # -- hidden: non-causal, other cameras at t
    def hidden(self, u, t):
        f = {}
        for v in range(self.U):
            f[f"x_{v}"] = self.M[t, v]
            for w, A in self.cm.items():
                f[f"c{w}_{v}"] = A[t, v]
        f["tot"] = self.totc2[t]
        f["nvis"] = self.nvis[t]
        f["p_u"] = self.P(self.mods[t], u)
        f.update(self.pfeat(self.mods[t]))
        return pd.DataFrame(f)

    # -- hidden-future: causal, other cameras up to now
    def hidden_track(self, model, u):
        """Hidden model's estimate at every minute with any camera released.
        Its windows reach at most 10 minutes ahead and every camera is blank for
        30 minutes after each `now`, so the estimate at minutes <= now uses
        only rows <= now (legal for hidden-future holes)."""
        tr = np.full(self.T, np.nan)
        t = np.where(self.nvis > 0)[0]
        if len(t):
            tr[t] = model.predict(self.hidden(u, t))
        return tr

    def hidden_future(self, u, now, h, track=None):
        f = {}
        if track is not None:
            tr = track[:, None]
            li = ffill_idx(tr)[now, 0]
            f["hp_last"] = np.where(li >= 0, tr[np.maximum(li, 0), 0], np.nan)
            f["hp_age"] = now - li
            for w in (5, 15):
                f[f"hp{w}"] = nanroll(tr, -w + 1, 0)[now, 0]
            f["hp_ratio"] = f["hp_last"] * (self.P(self.mods[now] + h, u) + 1) / (self.P(self.mods[now], u) + 1)
        for v in range(self.U):
            f[f"l_{v}"] = self.last(now, v)[0]
            f[f"t5_{v}"] = self.tm[5][now, v]
            f[f"t15_{v}"] = self.tm[15][now, v]
        mn, mt = self.mods[now], self.mods[now] + h
        f["p_now"], f["p_tgt"] = self.P(mn, u), self.P(mt, u)
        f["tot5"], f["tot_r"] = self.tot5[now], self.tot5[now] / (self.tot30[now] + 1)
        f.update(self.pfeat(mt))
        f["mod_now"], f["h"] = mn, h
        return pd.DataFrame(f)

    # -- missing: interpolation residual, other cameras' deviation over the same gap
    def missing(self, u, t):
        T = self.T
        li, ri = self.li[t, u], self.ri[t, u]
        # holes are NaN in M, so li < t < ri; but li/ri could be off-range
        yl = take(self.M, li, u)
        yr = take(self.M, ri, u)
        frac = np.where((li >= 0) & (ri < T), (t - li) / np.maximum(ri - li, 1), 0.5)
        interp = np.where(np.isnan(yl), yr, np.where(np.isnan(yr), yl, yl + (yr - yl) * frac))
        f = {"interp": interp, "yl": yl, "yr": yr, "frac": frac,
             "gap": ri - li - 1, "dl": t - li, "dr": ri - t,
             "yls": take(self.cm[2], li, u), "yrs": take(self.cm[2], ri, u)}
        S, Si = np.zeros(len(t)), np.zeros(len(t))
        for v in range(self.U):
            el = take(self.cm[1], li, v)
            er = take(self.cm[1], ri, v)
            iv = el + (er - el) * frac
            xv = self.cm[1][t, v]
            rd = (xv - iv) / (np.abs(iv) + 1)
            rd = np.where(v == u, np.nan, rd)
            f[f"rd_{v}"] = rd
            ok = ~np.isnan(rd) & (True if KNOWN is None else bool(KNOWN[v]))
            S += np.where(ok, xv, 0)
            Si += np.where(ok, iv, 0)
        f["tot_rd"] = (S - Si) / (Si + 1)
        f["est_tot"] = interp * (1 + f["tot_rd"])
        f.update(self.pfeat(self.mods[t]))
        f["unit"] = u
        return pd.DataFrame(f), interp


# ----------------------------------------------------------------------------- model
PARAMS = dict(objective="l1", learning_rate=0.03, num_leaves=31, min_child_samples=40,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
              n_estimators=600, verbose=-1)


class Model:
    def __init__(self, n_seeds=1, **kw):
        self.p = {**PARAMS, **kw}
        self.n_seeds = n_seeds

    def fit(self, X, y):
        cat = ["unit"] if "unit" in X.columns else "auto"
        self.ms = [lgb.LGBMRegressor(**self.p, random_state=s).fit(X, y, categorical_feature=cat)
                   for s in range(self.n_seeds)]
        return self

    def predict(self, X):
        return np.mean([m.predict(X) for m in self.ms], 0)


class BlendModel:
    """Mean of LightGBM (raw), LightGBM (log1p target) and a log-linear Huber
    regression on the smoothed camera columns. The linear part is much more
    stable across days than trees alone (hidden: 0.80 -> 0.74 in CV)."""

    def __init__(self, n_seeds, prefixes):
        self.n, self.prefixes = n_seeds, prefixes

    def fit(self, X, y):
        from sklearn.linear_model import HuberRegressor
        self.a = Model(self.n).fit(X, y)
        self.b = Model(self.n).fit(X, np.log1p(np.clip(y, 0, None)))
        self.cols = [c for c in X.columns if c.startswith(self.prefixes) and X[c].notna().mean() > 0.5]
        self.med = X[self.cols].median()
        self.h = HuberRegressor(max_iter=1000).fit(self._lin(X), np.log1p(np.clip(y, 0, None)))
        return self

    def _lin(self, X):
        return np.log1p(X[self.cols].fillna(self.med).clip(lower=0).to_numpy())

    def predict(self, X):
        return (self.a.predict(X) + np.expm1(self.b.predict(X)) + np.expm1(self.h.predict(self._lin(X)))) / 3


def sims_for(recs, prof, hidden_fn, n, seed):
    rng = np.random.default_rng(seed)
    for k in range(n):
        for r in recs:
            H = hidden_fn(rng, r)
            M, holes = simulate(r.Y, rng, H, n_gaps=40)
            yield r, M, holes, Feat(M, r, prof)


def train_generic(recs, prof, U, n_sims, seed=0, n_seeds=1, extra_missing=()):
    """Forecast + missing models (independent of which camera is hidden)."""
    FX, Fy, MX, My = [], [], [], []
    present = lambda r: [u for u in range(U) if not np.isnan(r.Y[:, u]).all()]
    for r, M, H, F in sims_for(recs, prof, lambda g, r: [int(g.choice(present(r)))], n_sims, seed):
        u, now, h = H["forecast"].T
        X, base = F.forecast(u, now, h)
        FX.append(X); Fy.append(r.Y[now + h, u] - base)
        u, t, _ = H["missing"].T
        X, base = F.missing(u, t)
        MX.append(X); My.append(r.Y[t, u] - base)
    # missing model may also learn from released test rows (allowed by the rules)
    rng = np.random.default_rng(seed + 99)
    for r in extra_missing:
        for _ in range(n_sims):
            M, H = simulate_gaps_only(r.Y, rng, 40)
            F = Feat(M, r, prof)
            u, t, _ = H.T
            if len(u) == 0:
                continue
            X, base = F.missing(u, t)
            MX.append(X); My.append(r.Y[t, u] - base)
    fm = Model(n_seeds).fit(pd.concat(FX, ignore_index=True), np.concatenate(Fy))
    mm = Model(n_seeds).fit(pd.concat(MX, ignore_index=True), np.concatenate(My))
    return fm, mm


def simulate_gaps_only(Y, rng, n_gaps):
    T, U = Y.shape
    M = Y.copy()
    out, tries = [], 0
    while len(out) < n_gaps and tries < 3000:
        tries += 1
        u = int(rng.integers(U))
        L = int(rng.integers(5, 21))
        a = int(rng.integers(1, max(2, T - L - 1)))
        b = a + L - 1
        if b + 1 >= T or np.isnan(M[a - 1, u]) or np.isnan(M[b + 1, u]) or np.isnan(M[a:b + 1, u]).any():
            continue
        M[a:b + 1, u] = np.nan
        out += [(u, t, 0) for t in range(a, b + 1)]
    return M, np.array(out, dtype=int).reshape(-1, 3)


def train_hidden(recs, prof, Hset, n_sims, seed=0, n_seeds=1):
    """Per hidden camera u in Hset: a hidden model and a hidden-future model."""
    sims = list(sims_for(recs, prof, lambda g, r: list(Hset), n_sims, seed))

    def hid_fit(idx, u, n):
        X, y = [], []
        for i in idx:
            r, M, H, F = sims[i]
            hh = H["hidden"][H["hidden"][:, 0] == u]
            if len(hh):
                X.append(F.hidden(u, hh[:, 1])); y.append(r.Y[hh[:, 1], u])
        if not X:
            return None
        return BlendModel(n, ("c2_", "c5_")).fit(pd.concat(X, ignore_index=True), np.concatenate(y))

    out = {}
    for u in Hset:
        full = hid_fit(range(len(sims)), u, n_seeds)
        if full is None:
            out[u] = None
            continue
        # out-of-fold hidden tracks (leave one training recording out) as a
        # feature for hidden-future, so its training sees honest estimates
        tracks = {}
        for r in recs:
            mine = [i for i, s_ in enumerate(sims) if s_[0] is r]
            oof = hid_fit([i for i, s_ in enumerate(sims) if s_[0] is not r], u, 1)
            for i in mine:
                tracks[i] = sims[i][3].hidden_track(oof or full, u)
        X, y = [], []
        for i, (r, M, H, F) in enumerate(sims):
            hf = H["hidden-future"][H["hidden-future"][:, 0] == u]
            if len(hf):
                now, h = hf[:, 1], hf[:, 2]
                X.append(F.hidden_future(u, now, h, tracks[i])); y.append(r.Y[now + h, u])
        out[u] = (full, Model(n_seeds).fit(pd.concat(X, ignore_index=True), np.concatenate(y)))
    return out


def hidden_reference(recs, u, Hset, U):
    """Best single visible camera, least-squares scaled on training days."""
    best = (np.inf, None, 1.0)
    for v in range(U):
        if v in Hset:
            continue
        y = np.concatenate([r.Y[:, u] for r in recs])
        x = np.concatenate([r.Y[:, v] for r in recs])
        ok = ~np.isnan(x) & ~np.isnan(y)
        if ok.sum() < 30:
            continue
        s = (x[ok] * y[ok]).sum() / max((x[ok] ** 2).sum(), 1e-9)
        mae = np.abs(s * x[ok] - y[ok]).mean()
        if mae < best[0]:
            best = (mae, v, s)
    return best[1], best[2]


def predict_kinds(F, H, fm, mm, hm):
    """Predict every hole in H (dict kind -> (u, t|now, h) arrays)."""
    P = {}
    u, now, h = H["forecast"].T
    if len(u):
        X, base = F.forecast(u, now, h)
        P["forecast"] = base + fm.predict(X)
    u, t, _ = H["missing"].T
    if len(u):
        X, base = F.missing(u, t)
        P["missing"] = base + mm.predict(X)
    for kind in ("hidden", "hidden-future"):
        arr = H[kind]
        p = np.full(len(arr), np.nan)
        for uu in np.unique(arr[:, 0]) if len(arr) else []:
            sel = arr[:, 0] == uu
            if hm.get(uu) is None:
                continue
            if kind == "hidden":
                p[sel] = hm[uu][0].predict(F.hidden(uu, arr[sel, 1]))
            else:
                track = F.hidden_track(hm[uu][0], uu)
                p[sel] = hm[uu][1].predict(F.hidden_future(uu, arr[sel, 1], arr[sel, 2], track))
        P[kind] = p
    return {k: np.clip(v, 0, None) for k, v in P.items()}


def references(F, H, refs):
    """The organisers' baselines (used for scoring in CV)."""
    R = {}
    M = F.M
    u, now, h = H["forecast"].T
    R["forecast"] = F.last(now, u)[0] if len(u) else np.array([])
    u, t, _ = H["missing"].T
    R["missing"] = F.missing(u, t)[1] if len(u) else np.array([])
    for kind in ("hidden", "hidden-future"):
        arr = H[kind]
        out = np.full(len(arr), np.nan)
        for i, (uu, tt, _) in enumerate(arr):
            v, s = refs[uu]
            x = M[tt, v] if kind == "hidden" else F.last(np.array([tt]), v)[0][0]
            if np.isnan(x):
                x = F.cm[2][tt, v] if kind == "hidden" else F.tm[15][tt, v]
            out[i] = s * x
        R[kind] = np.nan_to_num(out)
    return R


# ----------------------------------------------------------------------------- CV
def run_cv(recs, U, n_sims, n_eval, seed, folds=None, hsets=None):
    train = [r for r in recs.values() if r.split == "train"]
    folds = folds or [r.name for r in train if r.T >= 400]
    err = {k: [0.0, 0.0, 0] for k in KINDS}
    for fold in folds:
        t0 = time.time()
        held = recs[fold]
        rest = [r for r in train if r.name != fold]
        prof = build_profile(rest, U)
        fm, mm = train_generic(rest, prof, U, n_sims, seed)
        rng = np.random.default_rng(seed + 7)
        present = [u for u in range(U) if not np.isnan(held.Y[:, u]).all()]
        choices = [h for h in (hsets or []) if all(u in present for u in h)] or [[u] for u in present]
        for k in range(n_eval):
            Hset = list(choices[k % len(choices)])
            hm = train_hidden(rest, prof, Hset, n_sims, seed + k)
            refs = {u: hidden_reference(rest, u, Hset, U) for u in Hset}
            M, H = simulate(held.Y, rng, Hset)
            F = Feat(M, held, prof)
            P = predict_kinds(F, H, fm, mm, hm)
            R = references(F, H, refs)
            for kind in KINDS:
                if not len(H[kind]):
                    continue
                arr = H[kind]
                tgt = arr[:, 1] + arr[:, 2]
                y = held.Y[tgt, arr[:, 0]]
                p = np.where(np.isnan(P[kind]), R[kind], P[kind])
                err[kind][0] += np.abs(p - y).sum()
                err[kind][1] += np.abs(R[kind] - y).sum()
                err[kind][2] += len(y)
        print(f"fold {fold} done in {time.time() - t0:.0f}s", flush=True)
    ratios = {}
    for kind, (a, b, n) in err.items():
        ratios[kind] = a / b if b else float("nan")
        print(f"  {kind:14s} n={n:6d}  MAE={a / max(n, 1):7.3f}  ref={b / max(n, 1):7.3f}  ratio={ratios[kind]:.4f}")
    score = np.nanmean(list(ratios.values()))
    print(f"CV score (mean ratio, lower is better): {score:.4f}")
    return score


# ----------------------------------------------------------------------------- submission
def run_predict(recs, U, holes, data_dir, out, n_sims, seed, n_seeds):
    train = [r for r in recs.values() if r.split == "train"]
    test = [r for r in recs.values() if r.split == "test"]
    prof = build_profile(train, U)
    print("training forecast + missing models ...", flush=True)
    fm, mm = train_generic(train, prof, U, n_sims, seed, n_seeds, extra_missing=test)
    pred = {}
    cache = {}
    for r in test:
        hr = holes[holes["recording"] == r.name]
        Hset = tuple(sorted(hr.loc[hr["kind"].isin(["hidden", "hidden-future"]), "u"].unique().tolist()))
        if Hset not in cache:
            print(f"training hidden models for {[u for u in Hset]} ...", flush=True)
            cache[Hset] = train_hidden(train, prof, list(Hset), n_sims, seed, n_seeds)
        F = Feat(r.Y, r, prof)
        H, ids = {}, {}
        for kind in KINDS:
            k = hr[hr["kind"] == kind]
            if kind in ("forecast", "hidden-future"):
                now = k["now_minute_of_day"].to_numpy().astype(int) - r.first
                h = k["horizon"].to_numpy().astype(int)
            else:
                now = k["minute_of_day"].to_numpy().astype(int) - r.first
                h = np.zeros(len(k), int)
            H[kind] = np.stack([k["u"].to_numpy(), now, h], 1).astype(int).reshape(-1, 3)
            ids[kind] = k["id"].to_numpy()
        P = predict_kinds(F, H, fm, mm, cache[Hset])
        for kind in KINDS:
            if len(ids[kind]):
                pred.update(zip(ids[kind], P[kind]))
    ss = pd.read_csv(os.path.join(data_dir, "sample_submission.csv")).set_index("id")["people"]
    pred = pd.Series(pred, dtype=float).reindex(ss.index)
    nbad = int(pred.isna().sum())
    if nbad:
        print(f"warning: {nbad} holes fell back to the reference")
    sub = pd.DataFrame({"id": ss.index, "people": pred.fillna(ss).clip(lower=0).round(4).values})
    sub.to_csv(out, index=False)
    print(f"wrote {out} ({len(sub)} rows)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="submission.csv")
    ap.add_argument("--cv", action="store_true")
    ap.add_argument("--sims", type=int, default=20, help="simulated maskings per train recording")
    ap.add_argument("--eval", type=int, default=4, help="CV: hidden-camera choices per fold")
    ap.add_argument("--seeds", type=int, default=3, help="LightGBM seeds to average")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    d = find_data_dir(a.data)
    recs, units, holes = load(d)
    print(f"units: {units}; recordings: {len(recs)}; test holes: {len(holes)}")
    if a.cv:
        hs = [sorted(g["u"].unique().tolist()) for _, g in
              holes[holes["kind"] == "hidden"].groupby("recording")]
        print("hidden places on test days:", [[units[u] for u in h] for h in hs])
        run_cv(recs, len(units), a.sims, a.eval, a.seed, hsets=hs)
    else:
        run_predict(recs, len(units), holes, d, a.out, a.sims, a.seed, a.seeds)


if __name__ == "__main__":
    main()
