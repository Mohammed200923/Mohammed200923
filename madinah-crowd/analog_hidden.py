"""Nearest-neighbour estimate for a hidden camera: find minutes (training days and the other test
day) where the visible cameras looked alike (smoothed, log scale) at a similar prayer-aligned time,
and take the hidden camera's value then. Hidden holes may use the whole released table."""
import numpy as np
from sklearn.neighbors import NearestNeighbors
import solution as S


def _feat(r, Ms, cams, t):
    wm = S.warp(r.day)[np.clip(r.first + t, 0, 1439)]
    x = np.log1p(Ms[np.ix_(t, cams)])
    return np.c_[x, wm[:, None] / 60.0]


def estimate(recs_db, rec, u, cams, t, k=30):
    X, Y = [], []
    for r in recs_db:
        if np.isnan(r.Y[:, u]).all() or any(np.isnan(r.Y[:, c]).all() for c in cams):
            continue
        Ms = S.nanroll(r.Y, -2, 2)
        tt = np.arange(r.T)
        f = _feat(r, Ms, cams, tt); y = r.Y[tt, u]
        ok = np.isfinite(f).all(1) & np.isfinite(y)
        X.append(f[ok]); Y.append(np.log1p(y[ok]))
    X = np.vstack(X); Y = np.concatenate(Y)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    nn = NearestNeighbors(n_neighbors=k).fit((X - mu) / sd)
    Ms = S.nanroll(rec.Y, -2, 2)
    f = _feat(rec, Ms, cams, t)
    out = np.full(len(t), np.nan)
    ok = np.isfinite(f).all(1)
    if ok.any():
        _, idx = nn.kneighbors((f[ok] - mu) / sd)
        out[ok] = np.expm1(np.median(Y[idx], axis=1))
    return out
