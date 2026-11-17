"""Regenerate poster Figs. 6 and 7 with the corrections from the review.

Fig. 6: Strukov model, single-lobe loop area (x0 = 0.5, step = T/4000).
Fig. 7: empirical parameter map on a 0.1 wt% grid (the 2 wt% grid hid that the
        ratio keeps rising right up to the assumed threshold).
"""
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from strukov import run, lobe_area

out = sys.argv[1]
BLUE, ORANGE, GREEN, RED, GREY = "#2c7bd6", "#e8692f", "#21a36b", "#b2483a", "#6b7b78"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 17, "axes.titlesize": 17,
                     "axes.labelsize": 17, "xtick.labelsize": 15, "ytick.labelsize": 15,
                     "legend.fontsize": 15, "axes.spines.top": False, "axes.spines.right": False})

# ---------------- Fig. 6 ----------------
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4.6), gridspec_kw={"width_ratios": [1.15, 1]})
areas = {}
for f, c in ((1, BLUE), (5, ORANGE), (20, GREEN)):
    t, v, i, T = run(f, 0.5)
    m = t >= T
    a.plot(v[m], i[m] * 1e6, color=c, lw=2.4, label=f"{f} Hz")
    areas[f] = lobe_area(t, v, i, T)
a.axhline(0, color="#999", lw=.8); a.axvline(0, color="#999", lw=.8)
a.set_xlabel("Voltage (V)"); a.set_ylabel("Current (µA)"); a.set_title("(a) I-V loops", loc="left")
a.legend(frameon=False, loc="upper left")
fs = np.array([1, 5, 20]); ar = np.array([areas[f] for f in fs])
b.loglog(fs, ar, "o-", color=RED, lw=2.4, ms=10)
for f, y in zip(fs, ar):
    b.annotate(f"{y:.1e}", (f, y), textcoords="offset points", xytext=(10, 6), fontsize=15)
b.set_xticks(fs); b.set_xticklabels(["1 Hz", "5 Hz", "20 Hz"]); b.minorticks_off()
b.set_xlim(0.7, 40); b.set_ylim(ar.min()/2, ar.max()*3); b.set_ylabel("Single-lobe area (V·A)")
b.set_title("(b) Loop area vs frequency", loc="left")
b.grid(True, which="major", alpha=.3)
fig.tight_layout(); fig.savefig(f"{out}/fig6.png", dpi=220); plt.close(fig)
print("fig6 lobe areas:", {k: f"{v:.2e}" for k, v in areas.items()})

# ---------------- Fig. 7 ----------------
PC, RON0, ROFF0 = 22.0, 5e3, 25e3
phi = np.round(np.arange(0, PC, 0.1), 1)
fr = phi / PC
ron = RON0 * (1 - 0.95 * fr ** 0.8)
roff = ROFF0 * (1 + 40 * fr ** 1.5)
ratio = roff / ron
coarse = np.arange(0, 21, 2)
cr = ROFF0 * (1 + 40 * (coarse / PC) ** 1.5) / (RON0 * (1 - 0.95 * (coarse / PC) ** 0.8))

plt.rcParams.update({"font.size": 17, "axes.titlesize": 17, "axes.labelsize": 17,
                     "xtick.labelsize": 15, "ytick.labelsize": 15, "legend.fontsize": 15})
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4.6))
for ax in (a, b):
    ax.axvspan(PC, 25, color="#e9e6dc"); ax.axvline(PC, color=GREY, ls="--", lw=1.6)
    ax.set_xlim(0, 25); ax.set_xlabel("rGO loading (wt%)")
a.semilogy(phi, ratio, color=BLUE, lw=3, label="0.1 wt% grid")
a.semilogy(coarse, cr, "o", color=BLUE, mfc="white", ms=8, mew=2, label="2 wt% grid")
a.set_ylabel("ON/OFF ratio"); a.set_title("(a) ON/OFF ratio", loc="left")
a.set_ylim(3, 2e4)
a.text(23.5, 8e3, "short", fontsize=15, color=GREY, ha="center", rotation=90, va="top")
a.annotate("10³ range", (21.3, 2.8e3), xytext=(9.0, 6e3), fontsize=17, color=RED, fontweight="bold",
           arrowprops=dict(arrowstyle="->", color=RED, lw=2))
a.legend(frameon=False, loc="lower right", bbox_to_anchor=(0.86, 0.0))
b.semilogy(phi, roff, color=ORANGE, lw=3, label="R_off")
b.semilogy(phi, ron, color=BLUE, lw=3, label="R_on")
b.set_ylabel("Resistance (Ω)"); b.set_title("(b) R_on and R_off", loc="left")
b.legend(frameon=False, loc="center left")
for ax in (a, b):
    ax.grid(True, which="major", alpha=.3)
fig.tight_layout(); fig.savefig(f"{out}/fig7.png", dpi=220); plt.close(fig)
i20, i21 = np.argmin(abs(phi - 20)), np.argmin(abs(phi - 21.8))
print(f"fig7: ON/OFF 20 wt% = {ratio[i20]:.0f}, 21.8 wt% = {ratio[i21]:.0f}, max on grid = {ratio.max():.0f}")

# ---------------- Fig. 8 ----------------
# Map (fine grid, as Fig. 7) against the drift-diffusion output as reported in the
# project form: ON/OFF = 1.0 at every loading on the 0-24 wt% / 2 wt% grid.
fig, ax = plt.subplots(figsize=(10, 4.4))
ax.axvspan(PC, 25, color="#e9e6dc"); ax.axvline(PC, color=GREY, ls="--", lw=1.6)
ax.semilogy(phi, ratio, color=BLUE, lw=3, label="Empirical parameter map")
dd = np.arange(0, 25, 2)
ax.semilogy(dd, np.ones_like(dd, dtype=float), "s-", color=ORANGE, lw=2.4, ms=8,
            label="1-D drift-diffusion (ON/OFF = 1)")
ax.set_xlim(0, 25); ax.set_ylim(0.5, 2e4)
ax.set_xlabel("rGO loading (wt%)"); ax.set_ylabel("ON/OFF ratio")
ax.legend(frameon=False, loc="upper left"); ax.grid(True, which="major", alpha=.3)
fig.tight_layout(); fig.savefig(f"{out}/fig8.png", dpi=220); plt.close(fig)
print("fig8 done")
