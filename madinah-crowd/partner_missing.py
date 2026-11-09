"""Missing holes from the best partner camera: for each gap, pick the visible camera whose ratio
to the missing one is most stable in the hour around the gap (released minutes only), interpolate
that ratio across the gap from its edges, and multiply by the partner's counts inside the gap."""
import numpy as np


def gap_estimate(Y, u, a, b, W=60, E=10):
    T, U = Y.shape
    lo, hi = max(0, a - W), min(T, b + W + 1)
    best = None
    for v in range(U):
        if v == u:
            continue
        inside = Y[a:b + 1, v]
        if np.isnan(inside).any():
            continue
        win = np.r_[lo:a, b + 1:hi]
        ok = np.isfinite(Y[win, u]) & np.isfinite(Y[win, v]) & (Y[win, v] > 0)
        if ok.sum() < 15:
            continue
        lr = np.log((Y[win, u][ok] + 1) / (Y[win, v][ok] + 1))
        L = np.r_[max(0, a - E):a]; R = np.r_[b + 1:min(T, b + 1 + E)]
        okL = np.isfinite(Y[L, u]) & np.isfinite(Y[L, v]); okR = np.isfinite(Y[R, u]) & np.isfinite(Y[R, v])
        if okL.sum() < 3 or okR.sum() < 3:
            continue
        sd = lr.std()
        if best is None or sd < best[0]:
            rl = np.median(np.log((Y[L, u][okL] + 1) / (Y[L, v][okL] + 1)))
            rr = np.median(np.log((Y[R, u][okR] + 1) / (Y[R, v][okR] + 1)))
            best = (sd, v, rl, rr)
    if best is None:
        return None, None
    sd, v, rl, rr = best
    fr = np.arange(1, b - a + 2) / (b - a + 2)
    ratio = np.exp(rl + (rr - rl) * fr)
    return ratio * (Y[a:b + 1, v] + 1) - 1, (v, sd)
