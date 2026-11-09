"""Missing holes from the best partner camera: for each gap, pick the visible camera whose ratio
to the missing one is most stable in the hour around the gap (released minutes only), interpolate
that ratio across the gap from its edges, and multiply by the partner's counts inside the gap."""
import numpy as np


def gap_estimate(Y, u, a, b, W=120, E=5, top=1, smooth=0):  # bench preferred smooth=3 (0.725) but public: v65 0.697 vs v63 0.684, so off  # bench (1042 simulated gaps): E=5,W=120 0.768 vs E=10,W=60 0.797
    T, U = Y.shape
    lo, hi = max(0, a - W), min(T, b + W + 1)
    best = None
    cands = []
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
        rl = np.median(np.log((Y[L, u][okL] + 1) / (Y[L, v][okL] + 1)))
        rr = np.median(np.log((Y[R, u][okR] + 1) / (Y[R, v][okR] + 1)))
        cands.append((sd, v, rl, rr))
    if not cands:
        return None, None
    cands.sort()
    fr = np.arange(1, b - a + 2) / (b - a + 2)
    ests, ws = [], []
    for sd, v, rl, rr in cands[:top]:
        pv = Y[a:b + 1, v]
        if smooth:  # partner counts averaged over +-smooth minutes (its minute noise is not the gap's)
            pv = np.array([np.nanmean(Y[max(0, t - smooth):t + smooth + 1, v]) for t in range(a, b + 1)])
        ests.append(np.exp(rl + (rr - rl) * fr) * (pv + 1) - 1); ws.append(1 / max(sd, 1e-3))
    est = np.average(np.array(ests), axis=0, weights=np.array(ws))
    return est, (cands[0][1], cands[0][0])


def gap_estimate_right(Y, u, a, b, W=120, E=5):
    """One-sided version for gaps that start right after a blank (no left edge): partner chosen by
    ratio stability in the window after the gap, ratio measured on the right edge and held constant."""
    T, U = Y.shape
    hi = min(T, b + W + 1)
    best = None
    for v in range(U):
        if v == u or np.isnan(Y[a:b + 1, v]).any():
            continue
        win = np.r_[b + 1:hi]
        ok = np.isfinite(Y[win, u]) & np.isfinite(Y[win, v]) & (Y[win, v] > 0)
        if ok.sum() < 15:
            continue
        R = np.r_[b + 1:min(T, b + 1 + E)]
        okR = np.isfinite(Y[R, u]) & np.isfinite(Y[R, v])
        if okR.sum() < 3:
            continue
        sd = np.log((Y[win, u][ok] + 1) / (Y[win, v][ok] + 1)).std()
        if best is None or sd < best[0]:
            best = (sd, v, np.median(np.log((Y[R, u][okR] + 1) / (Y[R, v][okR] + 1))))
    if best is None:
        return None
    _, v, rr = best
    return np.exp(rr) * (Y[a:b + 1, v] + 1) - 1
