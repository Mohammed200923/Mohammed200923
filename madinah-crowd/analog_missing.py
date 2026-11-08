"""Analog (nearest-neighbour) gap filler for missing holes: for a gap of length L, find stretches
of the same length whose shapes before and after match, and take how they curved between the edges
(residual from straight-line interpolation, in log space). Missing holes may use the whole table."""
import numpy as np
from sklearn.neighbors import NearestNeighbors

CTX = 5


def _shape(lx, a, b):
    """features around a gap a..b (inclusive) in log1p space; None if context incomplete."""
    l, r = a - 1, b + 1
    if l - CTX < 0 or r + CTX >= len(lx):
        return None
    pre = lx[l - CTX:l + 1]; post = lx[r:r + CTX + 1]
    if np.isnan(pre).any() or np.isnan(post).any():
        return None
    return np.r_[pre - lx[l], post - lx[r], lx[r] - lx[l]]


def build(recs, units, Lmax=20, k=40):
    db = {}
    for L in range(1, Lmax + 1):
        X, Y = [], []
        for r in recs:
            for u in units:
                lx = np.log1p(r.Y[:, u])
                if np.isnan(lx).all():
                    continue
                for a in range(CTX + 1, r.T - L - CTX - 1, 2):
                    b = a + L - 1
                    inside = lx[a:b + 1]
                    if np.isnan(inside).any():
                        continue
                    f = _shape(lx, a, b)
                    if f is None:
                        continue
                    lin = lx[a - 1] + (lx[b + 1] - lx[a - 1]) * np.arange(1, L + 1) / (L + 1)
                    X.append(f); Y.append(inside - lin)
        if len(X) > k:
            X = np.array(X); mu, sd = X.mean(0), X.std(0) + 1e-9
            db[L] = (NearestNeighbors(n_neighbors=k).fit((X - mu) / sd), mu, sd, np.array(Y))
    return db


def fill(db, r, M, u, a, b):
    """residual-corrected fill for gap a..b of camera u in matrix M (log1p space -> counts)."""
    L = b - a + 1
    if L not in db:
        return None
    lx = np.log1p(M[:, u])
    f = _shape(lx, a, b)
    if f is None:
        return None
    nn, mu, sd, Y = db[L]
    _, idx = nn.kneighbors(((f - mu) / sd)[None, :])
    res = np.median(Y[idx[0]], axis=0)
    lin = lx[a - 1] + (lx[b + 1] - lx[a - 1]) * np.arange(1, L + 1) / (L + 1)
    return np.expm1(lin + res)
