"""Share-pattern estimator for a hidden camera: u(t) ~ R_{u/den}(prayer-aligned t) * den_smoothed(t)."""
import sys, numpy as np, pandas as pd, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "/home/user/Mohammed200923/madinah-crowd")
import solution as S
D = "/tmp/claude-0/-home-user-Mohammed200923/c02bf0e5-135a-5743-8a32-f322bf167f7f/scratchpad/data"
recs, units, holes = S.load(D); ui = {u: i for i, u in enumerate(units)}

def share_profile(rs, u, dens, binw=20, smooth=3, weights=None):
    """Sum-ratio of u to sum(dens) per prayer-aligned bin over recordings rs; returns f(warped minute)."""
    num = np.zeros(1440 // binw + 2); den = np.zeros_like(num)
    for k, r in enumerate(rs):
        w = weights[k] if weights is not None else 1.0
        Ys = S.nanroll(r.Y, -smooth, smooth)
        wt = S.warp(r.day)[r.first + np.arange(r.T)]
        x = Ys[:, [ui[d] for d in dens]].sum(1); y = Ys[:, ui[u]]
        ok = ~np.isnan(x) & ~np.isnan(y) & ~np.isnan(Ys[:, [ui[d] for d in dens]]).any(1)
        b = (wt[ok] // binw).astype(int)
        np.add.at(num, b, w * y[ok]); np.add.at(den, b, w * x[ok])
    with np.errstate(invalid="ignore", divide="ignore"):
        R = num / den
    centers = (np.arange(len(R)) + 0.5) * binw
    ok = np.isfinite(R) & (den > 0)
    glob = num[ok].sum() / den[ok].sum()
    def f(wm):
        return np.interp(wm, centers[ok], R[ok], left=R[ok][0], right=R[ok][-1]) if ok.sum() else np.full(len(wm), glob)
    return f

def estimate(r, M, u, dens, prof_f, smooth=3):
    Ms = S.nanroll(M, -smooth, smooth)
    x = Ms[:, [ui[d] for d in dens]]
    x = np.where(np.isnan(x).any(1), np.nan, x.sum(1))
    wt = S.warp(r.day)[r.first + np.arange(r.T)]
    return prof_f(wt) * x
