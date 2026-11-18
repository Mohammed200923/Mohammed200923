"""Same-weekday ratio patterns between a hidden camera and a partner camera: on the training days
of the same weekday, the ratio hidden/partner follows a repeatable prayer-aligned daily pattern
(Fri-to-Fri 0.81-0.97, Sat-to-Sat 0.73-0.93). Estimate = pattern(time) x partner's count."""
import numpy as np
import solution as S

BINW = 20


def profile(recs, ui, num, den):
    n = np.zeros(1440 // BINW + 2); d = np.zeros_like(n)
    for r in recs:
        Ys = S.nanroll(r.Y, -3, 3); w = S.warp(r.day)[r.first + np.arange(r.T)]
        ok = np.isfinite(Ys[:, ui[num]]) & np.isfinite(Ys[:, ui[den]])
        b = (w[ok] // BINW).astype(int)
        np.add.at(n, b, Ys[ok, ui[num]]); np.add.at(d, b, Ys[ok, ui[den]])
    c = (np.arange(len(n)) + .5) * BINW; ok = d > 0
    return lambda wm: np.interp(wm, c[ok], n[ok] / d[ok])
