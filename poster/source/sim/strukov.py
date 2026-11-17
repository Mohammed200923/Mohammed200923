"""Strukov linear ion-drift memristor with a Joglekar window (p = 1).

Parameters are the ones listed in Table 2 of the Ibdaa project form:
D = 10 nm, mu_v = 1e-14 m^2/(V s), R_on = 100 Ohm, R_off = 25 kOhm,
1 V sine drive at 1, 5 and 20 Hz, two cycles each.

Loop area is measured on ONE lobe (the positive half-cycle of the second
period), because integrating I dV over the whole figure-eight lets the two
lobes cancel. The time step scales with the period (T / 4000).
"""
import numpy as np
from scipy.integrate import solve_ivp

D, MU, RON, ROFF, V0 = 10e-9, 1e-14, 100.0, 25e3, 1.0
K = MU * RON / D**2  # dx/dt = K * i * F(x), x = w / D


def run(f, x0, steps_per_period=4000, cycles=2):
    T = 1.0 / f
    def rhs(t, x):
        v = V0 * np.sin(2 * np.pi * f * t)
        m = RON * x[0] + ROFF * (1 - x[0])
        i = v / m
        return [K * i * (1 - (2 * x[0] - 1) ** 2)]
    t = np.linspace(0, cycles * T, cycles * steps_per_period + 1)
    sol = solve_ivp(rhs, (0, cycles * T), [x0], t_eval=t, max_step=T / steps_per_period,
                    rtol=1e-9, atol=1e-12)
    x = sol.y[0]
    v = V0 * np.sin(2 * np.pi * f * t)
    i = v / (RON * x + ROFF * (1 - x))
    return t, v, i, T


def lobe_area(t, v, i, T):
    """|closed integral of I dV| over the positive lobe of the last period."""
    m = (t >= T) & (t <= 1.5 * T)
    return abs(np.trapezoid(i[m], v[m]))


def whole_trace_area(t, v, i):
    """What the original code did: integral over the whole trace (lobes cancel)."""
    return abs(np.trapezoid(i, v))


if __name__ == "__main__":
    import sys
    x0 = float(sys.argv[1]) if len(sys.argv) > 1 else 0.1
    for f in (1, 5, 20):
        for spp in (4000, 40000):
            t, v, i, T = run(f, x0, spp)
            print(f"x0={x0} f={f:>2} Hz steps/period={spp:>5}  lobe={lobe_area(t, v, i, T):.2e}  "
                  f"whole={whole_trace_area(t, v, i):.2e}  Imax={i.max()*1e6:.0f} uA")
