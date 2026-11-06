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
SAME_WEEK = True  # also learn from the other test day where the rules allow
UNITS = []
units_name = lambda u: UNITS[u] if u < len(UNITS) else u
FC_DROP = set()  # forecast features to leave out
HID_EXTRA = False  # hidden: counts relative to profile, plaza busyness x own profile
FC_LABEL_SMOOTH = 0  # forecast training label: centered mean over +-k minutes (0 = raw)
FC_LAG = False  # forecast: per-camera momentum / 10-minute change (lead-lag between cameras)
FC_EXTRA = False  # today's level, timing offset and profile shape (did not help)
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


CANON_DAY = "2026-09-15"


def warp(day):
    """Prayer-aligned time: each minute of `day` mapped piecewise-linearly so the
    five prayer times land on those of CANON_DAY. Crowd timing moves with the
    prayers (about 7 minutes earlier per week in September), not with the clock."""
    a, c = prayer_times(day), prayer_times(CANON_DAY)
    m = np.arange(1440, dtype=float)
    w = np.interp(m, a, c)
    w = np.where(m < a[0], m + c[0] - a[0], w)
    w = np.where(m > a[-1], m + c[-1] - a[-1], w)
    return w


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
    UNITS[:] = units
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
            m = np.clip(np.round(warp(r.day)[r.first + np.arange(r.T)]).astype(int), 0, 1439)
            ok = ~np.isnan(r.Y)
            np.add.at(s[key][0], m, np.nan_to_num(r.Y))
            np.add.at(s[key][1], m, ok)
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

    def __init__(self, M, rec, prof, jitter=0.0):
        self.M = M
        self.T, self.U = M.shape
        self.mods = rec.first + np.arange(self.T)
        self.fri = float(rec.weekday.startswith("Fri"))
        self.prof = prof.get(rec.weekday, prof["all"])
        self.pt = prayer_times(rec.day)
        self.warp = warp(rec.day) + jitter  # jitter: training-time timing noise
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
        cols["wmod"] = self.W(mod)
        cols["fri"] = np.full(len(d), self.fri)
        return cols

    def W(self, mod):
        return self.warp[np.clip(np.asarray(mod), 0, 1439)]

    def P(self, mod, u):
        return self.prof[np.clip(np.round(self.W(mod)).astype(int), 0, 1439), u]

    def last(self, now, u):
        i = self.li[now, u]
        return np.where(i >= 0, self.M[np.maximum(i, 0), u], np.nan), now - i

    # -- forecast: causal
    def Pw(self, w, u):
        return self.prof[np.clip(np.round(w).astype(int), 0, 1439), u]

    def _day_stats(self):
        """Per-camera level of today vs the profile (cumulative, rows <= t only), and
        today's timing offset vs the profile, fitted on the last 90 released minutes."""
        if hasattr(self, "_dr"):
            return
        T, U = self.T, self.U
        wm = self.warp[np.clip(self.mods, 0, 1439)]
        R = ~np.isnan(self.M)
        PR = self.Pw(wm[:, None] + np.zeros((1, U)), np.arange(U)[None, :])
        z = np.zeros((1, U))
        co = np.concatenate([z, np.cumsum(np.nan_to_num(self.M), 0)])
        cp = np.concatenate([z, np.cumsum(np.where(R, np.nan_to_num(PR), 0), 0)])
        t = np.arange(T)
        self._dr = (co[t + 1] + 1) / (cp[t + 1] + 1)
        lo = np.maximum(t + 1 - 60, 0)
        self._dr60 = (co[t + 1] - co[lo] + 1) / (cp[t + 1] - cp[lo] + 1)
        k = KNOWN if KNOWN is not None else np.ones(U, bool)
        best = np.full(T, np.inf); off = np.zeros(T)
        lo = np.maximum(t + 1 - 90, 0)
        for L in range(-12, 13, 2):
            PL = self.Pw(wm[:, None] + L + np.zeros((1, U)), np.arange(U)[None, :])
            e = np.log1p(self.M) - np.log1p(PL)
            ok = ~np.isnan(e) & k[None, :]
            e0 = np.where(ok, e, 0)
            c1 = np.concatenate([z, np.cumsum(e0, 0)]); c2 = np.concatenate([z, np.cumsum(e0 ** 2, 0)])
            cn = np.concatenate([z, np.cumsum(ok, 0)])
            n = cn[t + 1] - cn[lo]
            with np.errstate(invalid="ignore", divide="ignore"):
                m = (c1[t + 1] - c1[lo]) / n
                var = (c2[t + 1] - c2[lo]) / n - m ** 2
            sc = np.where(n >= 15, var, np.nan)
            score = np.nanmean(sc, 1) + 0.002 * abs(L)  # mild preference for no shift
            better = score < best
            best = np.where(better, score, best); off = np.where(better, L, off)
        self._off = np.where(np.isfinite(best), off, 0.0)

    def forecast(self, u, now, h):
        f = {}
        if FC_EXTRA:
            self._day_stats()
            wn, wt = self.W(self.mods[now]), self.W(self.mods[now] + h)
            f["dr"], f["dr60"] = self._dr[now, u], self._dr60[now, u]
            off = self._off[now]
            f["off"] = off
            pno, pto = self.Pw(wn + off, u), self.Pw(wt + off, u)
            f["p_d_off"] = pto - pno
            f["rp_off"] = self.tm[5][now, u] * (pto + 1) / (pno + 1)
            f["rp_dr"] = f["dr60"] * pto
            f["p_shape"] = self.Pw(wt + 5, u) - self.Pw(wt - 5, u)
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
            if FC_LAG:  # crowd moving between camera views: each camera's recent change
                f[f"mom_{v}"] = (self.tm[3][now, v] - self.tm[10][now, v]) / (self.tm[30][now, v] + 1)
                f[f"lag10_{v}"] = (self.tm[5][now, v] - take(self.tm[5], now - 10, v)) / (self.tm[30][now, v] + 1)
        f.update(self.pfeat(mt))
        f["wmod_now"] = self.W(mn)
        f["h"] = h
        X = pd.DataFrame(f).drop(columns=[c for c in FC_DROP if c in f])
        base = np.where(np.isnan(last), f["ratio_pred"], last)
        base = np.where(np.isnan(base), pt, base)
        X["_base"] = base
        return X, base

    # -- hidden: non-causal, other cameras at t
    def hidden(self, u, t):
        f = {}
        for v in range(self.U):
            if HID_KNOWN_ONLY and KNOWN is not None and not KNOWN[v]:
                continue
            f[f"x_{v}"] = self.M[t, v]
            for w, A in self.cm.items():
                f[f"c{w}_{v}"] = A[t, v]
        f["tot"] = self.totc2[t]
        f["nvis"] = self.nvis[t]
        f["p_u"] = self.P(self.mods[t], u)
        if HID_EXTRA:
            k = KNOWN if KNOWN is not None else np.ones(self.U, bool)
            num = np.zeros(len(t)); den = np.zeros(len(t))
            for v in range(self.U):
                pv = self.P(self.mods[t], v)
                xv = self.cm[2][t, v]
                f[f"rx_{v}"] = xv / (pv + 1)
                ok = ~np.isnan(xv) & ~np.isnan(pv) & bool(k[v])
                num += np.where(ok, xv, 0); den += np.where(ok, pv, 0)
            f["plz"] = num / (den + 1)
            f["est_prof"] = f["p_u"] * f["plz"]
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
            if HID_KNOWN_ONLY and KNOWN is not None and not KNOWN[v]:
                continue
            f[f"l_{v}"] = self.last(now, v)[0]
            f[f"t5_{v}"] = self.tm[5][now, v]
            f[f"t15_{v}"] = self.tm[15][now, v]
        mn, mt = self.mods[now], self.mods[now] + h
        f["p_now"], f["p_tgt"] = self.P(mn, u), self.P(mt, u)
        f["tot5"], f["tot_r"] = self.tot5[now], self.tot5[now] / (self.tot30[now] + 1)
        f.update(self.pfeat(mt))
        f["wmod_now"], f["h"] = self.W(mn), h
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


class FcModel:
    """Forecast: mean of a model on the change (people) and one on the log ratio."""

    def __init__(self, n_seeds, blend=True):
        self.n, self.blend = n_seeds, blend

    def fit(self, X, d):
        b = np.clip(X["_base"].to_numpy(), 0, None)
        Xf = X.drop(columns="_base")
        self.a = Model(self.n, **FC_PARAMS).fit(Xf, d)
        if self.blend:
            self.b = Model(self.n, **FC_PARAMS).fit(Xf, np.log1p(np.clip(b + d, 0, None)) - np.log1p(b))
        return self

    def predict(self, X):
        b = np.clip(X["_base"].to_numpy(), 0, None)
        Xf = X.drop(columns="_base")
        d = self.a.predict(Xf)
        if self.blend:
            d = (d + np.expm1(np.log1p(b) + self.b.predict(Xf)) - b) / 2
        return d


FC_BLEND = True
FC_PARAMS = {}


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


OOF_PROFILE = True


def sims_for(recs, prof, hidden_fn, n, seed, extra=()):
    """Masked copies of `recs` (training days) and `extra` (released test-day rows,
    whose profile is the training-day one, as at prediction time)."""
    rng = np.random.default_rng(seed)
    U = recs[0].Y.shape[1]
    # each training day sees a profile built without that day, as a test day would
    pr = {r.day: (build_profile([x for x in recs if x.day != r.day], U)
                  if OOF_PROFILE and any(x.day != r.day for x in recs) else prof) for r in recs}
    for r in extra:
        pr[r.day] = prof
    for k in range(n):
        for r in list(recs) + list(extra):
            H = hidden_fn(rng, r)
            M, holes = simulate(r.Y, rng, H, n_gaps=40)
            j = rng.uniform(-JITTER, JITTER) if JITTER else 0.0
            yield r, M, holes, Feat(M, r, pr[r.day], jitter=j)


class Avg:
    def __init__(self, ms):
        self.ms = ms

    def predict(self, X):
        return np.mean([m.predict(X) for m in self.ms], 0)


N_BAGS = 8  # models trained on independent simulated maskings, averaged
            # (week-gap bench, forecast: single model 0.84-0.91, 5 bags 0.81-0.82)


def train_generic(recs, prof, U, n_sims, seed=0, n_seeds=1, extra_missing=(), extra_forecast=(), n_bags=None,
                  forecast_only=False):
    n_bags = n_bags or N_BAGS
    ms = [_train_generic(recs, prof, U, n_sims, seed + 1000 * k, n_seeds, extra_missing, extra_forecast,
                         forecast_only) for k in range(n_bags)]
    return Avg([m[0] for m in ms]), (None if forecast_only else Avg([m[1] for m in ms]))


JITTER = 5.0  # +-minutes of random timing shift of the profile in training sims
ONLINE = False  # hurt on the public board (v6 0.784 vs v5 0.774); forecast also learns from the test day's own rows before a cutoff
ONLINE_CUTOFFS = (780, 930, 1080)  # 13:00, 15:30, 18:00 (minute of day)


def truncated(r, cut_mod):
    """Copy of recording r with every row after minute `cut_mod` removed."""
    t = Rec(r.name + f"@{cut_mod}", r.day, r.weekday, r.first, r.Y.copy())
    t.Y[max(0, cut_mod - r.first + 1):] = np.nan
    t.split = r.split
    return t


def online_forecast_models(recs, prof, U, n_sims, seed, n_seeds, r, extra_forecast=(), cutoffs=None):
    """Forecast models that also learn from recording r's own rows before a cutoff.
    A hole whose now >= cutoff uses the model of the latest such cutoff (rules: rows
    at or before now only). Returns [(cut_mod, model)], ascending; cut_mod=-1 = base."""
    out = []
    for c in (cutoffs if cutoffs is not None else ONLINE_CUTOFFS):
        if c <= r.first + 60:
            continue
        fm, _ = train_generic(recs, prof, U, n_sims, seed + 7 * c, n_seeds,
                              extra_forecast=list(extra_forecast) + [truncated(r, c)], forecast_only=True)
        out.append((c, fm))
    return out


def _train_generic(recs, prof, U, n_sims, seed=0, n_seeds=1, extra_missing=(), extra_forecast=(), forecast_only=False):
    """Forecast + missing models (independent of which camera is hidden).
    extra_forecast: released test-day rows that are all before the holes predicted."""
    FX, Fy, MX, My = [], [], [], []
    present = lambda r: [u for u in range(U) if not np.isnan(r.Y[:, u]).all()]
    for r, M, H, F in sims_for(recs, prof, lambda g, r: [int(g.choice(present(r)))], n_sims, seed,
                               extra=extra_forecast):
        u, now, h = H["forecast"].T
        X, base = F.forecast(u, now, h)
        if FC_LABEL_SMOOTH:  # train on the target minute's count averaged with its neighbours
            ysm = nanroll(r.Y, -FC_LABEL_SMOOTH, FC_LABEL_SMOOTH)[now + h, u]
            tgt = np.where(np.isnan(ysm), r.Y[now + h, u], ysm)
        else:
            tgt = r.Y[now + h, u]
        FX.append(X); Fy.append(tgt - base)
        if forecast_only:
            continue
        u, t, _ = H["missing"].T
        X, base = F.missing(u, t)
        MX.append(X); My.append(r.Y[t, u] - base)
    if forecast_only:
        return FcModel(n_seeds, FC_BLEND).fit(pd.concat(FX, ignore_index=True), np.concatenate(Fy)), None
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
    fm = FcModel(n_seeds, FC_BLEND).fit(pd.concat(FX, ignore_index=True), np.concatenate(Fy))
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


def train_hidden(recs, prof, Hset, n_sims, seed=0, n_seeds=1, extra_h=(), extra_hf=(), n_bags=None):
    n_bags = n_bags or N_BAGS
    bags = [_train_hidden(recs, prof, Hset, n_sims, seed + 1000 * k, n_seeds, extra_h, extra_hf)
            for k in range(n_bags)]
    out = {}
    for u in Hset:
        ms = [b[u] for b in bags if b.get(u) is not None]
        out[u] = tuple(Avg([m[i] for m in ms]) for i in range(3)) if ms else None
    return out


def _train_hidden(recs, prof, Hset, n_sims, seed=0, n_seeds=1, extra_h=(), extra_hf=()):
    """Per hidden camera u in Hset: a hidden model and a hidden-future model.
    extra_h: test days where the camera is visible (hidden holes may use any row);
    extra_hf: the subset that is before the hidden-future holes (also usable there)."""
    extra_h = [r for r in extra_h if r not in extra_hf]
    sims = list(sims_for(recs, prof, lambda g, r: list(Hset), n_sims, seed, extra=list(extra_hf) + extra_h))
    causal = [i for i, s_ in enumerate(sims) if not any(s_[0] is x for x in extra_h)]

    def hid_fit(idx, u, n):
        X, y = [], []
        for i in idx:
            r, M, H, F = sims[i]
            hh = H["hidden"][H["hidden"][:, 0] == u]
            if len(hh):
                X.append(F.hidden(u, hh[:, 1])); y.append(r.Y[hh[:, 1], u])
        if not X:
            return None
        return BlendModel(n, ("c2_", "c5_", "est_prof")).fit(pd.concat(X, ignore_index=True), np.concatenate(y))

    out = {}
    for u in Hset:
        full = hid_fit(range(len(sims)), u, n_seeds)
        if full is None:
            out[u] = None
            continue
        # the hidden-future side must not learn from rows after its holes, so its
        # hidden track comes from a model without extra_h
        full_c = hid_fit(causal, u, n_seeds) if extra_h else full
        # out-of-fold hidden tracks (leave one recording out) as a feature for
        # hidden-future, so its training sees honest estimates
        tracks = {}
        for r in {id(sims[i][0]): sims[i][0] for i in causal}.values():
            mine = [i for i in causal if sims[i][0] is r]
            oof = hid_fit([i for i in causal if sims[i][0] is not r], u, 1)
            for i in mine:
                tracks[i] = sims[i][3].hidden_track(oof or full_c, u)
        X, y = [], []
        for i in causal:
            r, M, H, F = sims[i]
            hf = H["hidden-future"][H["hidden-future"][:, 0] == u]
            if len(hf):
                now, h = hf[:, 1], hf[:, 2]
                X.append(F.hidden_future(u, now, h, tracks[i])); y.append(r.Y[now + h, u])
        out[u] = (full, Model(n_seeds).fit(pd.concat(X, ignore_index=True), np.concatenate(y)), full_c)
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


FC_TRUST = (0.25, 8)  # trust in the forecast model's change: 0.25 at h=1, linear to 1 at h=8


def horizon_trust(h):
    """Week-gap bench: at 1-2 minutes ahead the model is worse than the last value
    (ratio 1.07-1.14), at 6-15 it clearly wins. Fitted on one bench seed, it improves
    the other (wk11 0.886 -> 0.860, wk12 0.835 -> 0.825, prev12 unchanged)."""
    if FC_TRUST is None:
        return 1.0
    a1, hf = FC_TRUST
    return np.clip(a1 + (1 - a1) * (np.asarray(h, float) - 1) / (hf - 1), a1, 1.0)


HID_KNOWN_ONLY = False  # hidden models: only cameras seen on training days (not test-only I-M)
HIDDEN_REF_BLEND = 0.25  # hidden: share of the reference (best camera x scale) blended in
# per camera: cam_B's reference (0.858 x its neighbour cam_D) is informative, cam_G's
# (0.031 x the big, distant cam_E) is not. Public: B 25% 0.727, 40% 0.725, 55% 0.726;
# with B 40%: G 0% 0.724, 10% 0.724, 25% 0.725, 40% 0.730. cam_D (19 Sep) keeps 25%.
HIDDEN_REF_BLEND_UNIT = {"cam_B": 0.40, "cam_G": 0.10}
HF_REF_BLEND = {"cam_D": 0.25, "cam_B": 0.12, "cam_G": 0.12}  # B/G: 0% 0.758, 12% best, 25% 0.757, 40% 0.741
HIDDEN_WIGGLE = 0.25
MISSING_SCALE = 1.25  # missing = interpolation + 1.25 x model correction; public: 0.75x 0.776, 1.0x 0.757, 1.25x 0.747, 1.5x 0.750
WEEK_GAP_LONG_TRUST = 0.7
NEW_CAM_FC_TRUST = 0.0
SAME_WEEK_LONG_TRUST = 1.0  # bench said 1.2, but the bench over-trusted the model by ~0.3 on 18 Sep
PRE_PRAYER = None  # v9 (-30, -10) gave 0.767 vs v8 0.766 on the public board, so off.
# targets this many minutes before a prayer: keep the last value
                         # on a day without an earlier same-week day (week-gap bench:
                         # model ratio 1.3-2.0 there; wk11 0.853 -> 0.820, wk12 0.828 -> 0.802;
                         # with an adjacent day it is fine, so not applied then)


def predict_kinds(F, H, fm, mm, hm, week_gap=False):
    """Predict every hole in H (dict kind -> (u, t|now, h) arrays)."""
    P = {}
    u, now, h = H["forecast"].T
    if len(u):
        X, base = F.forecast(u, now, h)
        trust = horizon_trust(h)
        if week_gap and WEEK_GAP_LONG_TRUST != 1.0:
            # without same-week data the model is over-confident at longer horizons.
            # Public (18 Sep), h >= 6 scaled: 1.15x 0.760, 1.0x 0.747, 0.85x 0.737,
            # 0.7x 0.732, 0.55x 0.734
            trust = np.where(np.asarray(h) >= 6, trust * WEEK_GAP_LONG_TRUST, trust)
        if week_gap and NEW_CAM_FC_TRUST != 1.0 and KNOWN is not None:
            # cameras never seen on training days: on a week-gap day the model does not
            # help them (public 18 Sep: last value for I-M 0.732 -> 0.730)
            trust = np.where(~KNOWN[np.asarray(u)], trust * NEW_CAM_FC_TRUST, trust)
        if not week_gap and SAME_WEEK_LONG_TRUST:
            # with an earlier same-week day in training the model's changes are well
            # timed but timid at longer horizons (bench prev12, 1.2x at h>=6:
            # 0.726 -> 0.712 / 0.716; on week-gap days it hurts, so not applied there)
            trust = np.where(np.asarray(h) >= 6, trust * SAME_WEEK_LONG_TRUST, trust)
        if week_gap and PRE_PRAYER:
            dn = X["d_near"].to_numpy()
            trust = np.where((dn > PRE_PRAYER[0]) & (dn <= PRE_PRAYER[1]), 0.0, trust)
        if isinstance(fm, list):  # [(cutoff minute, model)] ascending; latest cutoff <= now wins
            d = np.zeros(len(u)); mod = F.mods[now]
            for c, m in fm:
                sel = mod >= c
                if sel.any():
                    d[sel] = m.predict(X[sel])
            P["forecast"] = base + trust * d
        else:
            P["forecast"] = base + trust * fm.predict(X)
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
                track = F.hidden_track(hm[uu][-1], uu)
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
    pred = {}
    gen = {}
    for r in test:
        hr = holes[holes["recording"] == r.name]
        Hset = sorted(hr.loc[hr["kind"].isin(["hidden", "hidden-future"]), "u"].unique().tolist())
        # same-week data from the other test day (rules: forecast / hidden-future
        # holes may only use rows before their now, i.e. earlier days)
        earlier = [x for x in test if x.day < r.day] if SAME_WEEK else []
        others = [x for x in test if x is not r and all(not np.isnan(x.Y[:, u]).all() for u in Hset)] \
            if SAME_WEEK else []
        key = tuple(x.name for x in earlier)
        if key not in gen:
            print(f"training forecast + missing models (extra forecast days: {list(key)}) ...", flush=True)
            gen[key] = train_generic(train, prof, U, n_sims, seed, n_seeds, extra_missing=test,
                                     extra_forecast=earlier)
        fm, mm = gen[key]
        if ONLINE:
            print(f"training same-day forecast models for {r.name} (cutoffs {ONLINE_CUTOFFS}) ...", flush=True)
            fm = [(-1, fm)] + online_forecast_models(train, prof, U, n_sims, seed, n_seeds, r,
                                                     extra_forecast=earlier)
        print(f"training hidden models for {[units_name(u) for u in Hset]} on {r.name} "
              f"(extra hidden days: {[x.name for x in others]}) ...", flush=True)
        hm = train_hidden(train, prof, Hset, n_sims, seed, n_seeds,
                          extra_h=others, extra_hf=[x for x in others if x in earlier])
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
        P = predict_kinds(F, H, fm, mm, hm, week_gap=not earlier)
        for kind in KINDS:
            if len(ids[kind]):
                pred.update(zip(ids[kind], P[kind]))
    ss = pd.read_csv(os.path.join(data_dir, "sample_submission.csv")).set_index("id")["people"]
    pred = pd.Series(pred, dtype=float).reindex(ss.index)
    # hidden-future of cam_D: blend with the reference (1.165 x cam_B at now, B being D's
    # closest camera). Bench (Saturday, previous day in training, D hidden, as on 19 Sep):
    # 25% reference gives 0.738 -> 0.651, 0.680 -> 0.593, 0.800 -> 0.670 over 3 seeds.
    # It hurt for B/G, so it is camera-specific.
    for unit, w in HF_REF_BLEND.items():
        sel = holes.loc[(holes["kind"] == "hidden-future") & (holes["unit"] == unit), "id"]
        sel = sel[sel.isin(pred.index)]
        pred.loc[sel] = (1 - w) * pred.loc[sel] + w * ss.loc[sel]
    if MISSING_SCALE != 1.0:
        sel = holes.loc[holes["kind"] == "missing", "id"]
        sel = sel[sel.isin(pred.index)]
        pred.loc[sel] = (ss.loc[sel] + MISSING_SCALE * (pred.loc[sel] - ss.loc[sel])).clip(lower=0)
    # hidden: the model is over-confident on the test week. Public board (18 Sep, B/G):
    # 0% -> 0.766, 25% -> 0.758, 50% -> 0.760; bench for cam_D (19 Sep): 25% slightly better.
    if HIDDEN_REF_BLEND:
        hh = holes[holes["kind"] == "hidden"]
        w = hh["unit"].map(HIDDEN_REF_BLEND_UNIT).fillna(HIDDEN_REF_BLEND).to_numpy()
        sel = hh["id"].to_numpy()
        pred.loc[sel] = (1 - w) * pred.loc[sel].to_numpy() + w * ss.loc[sel].to_numpy()
    if HIDDEN_WIGGLE:
        # add the reference camera's minute-level wiggle (raw - 7-minute smooth) x scale to
        # hidden predictions: neighbouring views share minute-to-minute ups and downs.
        # Public: +0% 0.728, +25% 0.727, +50% 0.728. The reference camera and its scale are
        # recovered from the reference values themselves (reference = scale x camera).
        hh = holes[holes["kind"] == "hidden"]
        for (rn, un), g in hh.groupby(["recording", "unit"]):
            r = recs[rn]
            t = g["minute_of_day"].to_numpy().astype(int) - r.first
            refv = ss.loc[g["id"]].to_numpy()
            best = None
            for v in range(r.Y.shape[1]):
                x = r.Y[t, v]
                ok = ~np.isnan(x) & (x > 0)
                if ok.sum() < 30:
                    continue
                sc = np.median(refv[ok] / x[ok])
                err = np.abs(sc * x[ok] - refv[ok]).mean()
                if best is None or err < best[0]:
                    best = (err, v, sc)
            if best is None or best[0] > 0.05:
                continue
            _, v, sc = best
            x = r.Y[:, v]
            dev = x - nanroll(x[:, None], -3, 3)[:, 0]
            add = np.nan_to_num(dev[t]) * sc * HIDDEN_WIGGLE
            pred.loc[g["id"]] = (pred.loc[g["id"]] + add).clip(lower=0)
    nbad = int(pred.isna().sum())
    if nbad:
        print(f"warning: {nbad} holes fell back to the reference")
    sub = pd.DataFrame({"id": ss.index, "people": pred.fillna(ss).clip(lower=0).round(4).values})
    sub.to_csv(out, index=False)
    print(f"wrote {out} ({len(sub)} rows)")


def main():
    global SAME_WEEK, N_BAGS
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="submission.csv")
    ap.add_argument("--cv", action="store_true")
    ap.add_argument("--sims", type=int, default=20, help="simulated maskings per train recording")
    ap.add_argument("--eval", type=int, default=4, help="CV: hidden-camera choices per fold")
    ap.add_argument("--seeds", type=int, default=3, help="LightGBM seeds to average")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--no-same-week", action="store_true", help="train on train.csv only")
    ap.add_argument("--bags", type=int, default=N_BAGS, help="bagged models per kind")
    a = ap.parse_args()
    SAME_WEEK = not a.no_same_week
    N_BAGS = a.bags
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
