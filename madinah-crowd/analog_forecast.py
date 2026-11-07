"""Analog (nearest-neighbour) forecaster: find past situations where the same kind of camera
had a similar recent trajectory at a similar prayer-aligned time, and average what happened
next. Uses only rows at or before `now`. Meant as a diverse averaging partner for LightGBM."""
import numpy as np
from sklearn.neighbors import NearestNeighbors
import solution as S

LAGS = (1, 2, 3, 5, 8, 12, 15)
HMAX = 15


def _last_filled(M, u):
    """forward-filled log1p series of camera u (NaN before the first value)."""
    x = M[:, u]
    idx = S.ffill_idx(x[:, None])[:, 0]
    out = np.where(idx >= 0, x[np.maximum(idx, 0)], np.nan)
    return np.log1p(out)


def _feats(lx, t, wmin, fri, tw=1.0, lags=LAGS):
    cur = lx[t]
    f = [lx[t - L] - cur if t - L >= 0 else np.nan for L in lags]
    return np.array(f + [tw * wmin / 60.0, 2.0 * fri]), cur


class Analog:
    def __init__(self, k=40, tw=1.0, lags=LAGS):
        self.k, self.tw, self.lags = k, tw, tuple(lags)

    def fit(self, recs, units_known):
        X, Y = [], []
        for r in recs:
            wm = S.warp(r.day)[np.clip(r.first + np.arange(r.T), 0, 1439)]
            fri = float(r.weekday.startswith("Fri"))
            for u in units_known:
                if np.isnan(r.Y[:, u]).all():
                    continue
                lx = np.log1p(r.Y[:, u])
                for t in range(max(self.lags), r.T - HMAX):
                    if np.isnan(lx[t]):
                        continue
                    f, cur = _feats(lx, t, wm[t], fri, self.tw, self.lags)
                    tgt = lx[t + 1:t + 1 + HMAX] - cur
                    if np.isnan(f).any() or np.isnan(tgt).sum() > 3:
                        continue
                    X.append(f); Y.append(tgt)
        self.X = np.array(X); self.Y = np.array(Y)
        self.mu = self.X.mean(0); self.sd = self.X.std(0) + 1e-9
        self.nn = NearestNeighbors(n_neighbors=self.k).fit((self.X - self.mu) / self.sd)
        return self

    def predict(self, rec, M, u, now, h):
        """Predicted counts for holes (u, now, h) of recording rec with released matrix M."""
        wm = S.warp(rec.day)[np.clip(rec.first + np.arange(rec.T), 0, 1439)]
        fri = float(rec.weekday.startswith("Fri"))
        out = np.full(len(u), np.nan)
        cache = {}
        for i, (uu, nw, hh) in enumerate(zip(u, now, h)):
            key = (uu, nw)
            if key not in cache:
                lx = _last_filled(M[:nw + 1], uu)
                f, cur = _feats(lx, nw, wm[nw], fri, self.tw, self.lags)
                if np.isnan(f).any() or np.isnan(cur):
                    cache[key] = None
                else:
                    _, idx = self.nn.kneighbors(((f - self.mu) / self.sd)[None, :])
                    cache[key] = (cur, np.nanmedian(self.Y[idx[0]], axis=0))
            c = cache[key]
            if c is not None:
                out[i] = np.expm1(c[0] + c[1][hh - 1])
        return out
