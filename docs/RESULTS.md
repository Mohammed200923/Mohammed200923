# Real-data results: the five challenge targets

Run on **14 November 2026** against the live NASA/IPAC archive (SPHEREx collections `spherex_dr1` + `spherex_qr3`) with `node tests/live.mjs <target>`. Up to 36 exposures were sampled evenly across all available SPHEREx images of each target and stacked into one frame per survey visit.

**How to read the tables**
- **Offset** is the distance between the brightest pixel near the target and where the target's catalogue proper motion predicts it should be on that date. One SPHEREx pixel is 6.15″. Values under about 1 px mean the target sits on its predicted track.
- **Flux** is aperture photometry at the predicted position. Each visit mixes different wavelengths, and stars are much brighter at some wavelengths than others. So flux changes between visits are only a first hint of variability, not a clean light curve. For a real light curve, click the star in the app and compare points of similar wavelength (colour = λ).
- Visits with only 1–3 exposures are noisy; faint targets may not be detected in them.

| Target | Visits | Moves as predicted? | Gaia DR3 overlay |
|---|---|---|---|
| Barnard's Star | 6 | ✅ within 0.41 px in the 3 well-covered visits | 1411 stars, Barnard's Star flagged as fast |
| Epsilon Indi B | 5 | ✅ within 0.6 px in every visit | 142 stars |
| WISE 0855−0714 (3.8–5 µm only) | 4 | ✅ within 0.57 px | 159 stars (WISE 0855 isn't in Gaia; it's too cold) |
| RW Aurigae | 3 | slow mover: stays put | 617 stars |
| R Draconis | 4 | slow mover: stays put | 106 stars |

![Barnard's Star, difference mode](img/live/barnard-s-star-diff.png)

## Barnard's Star

| Visit date | Exposures | λ (µm) | Offset (px) | Flux at target (mJy) |
|---|---|---|---|---|
| 2025-08-25 | 11 | 0.99–4.93 | 0.41 | 5230 |
| 2025-09-30 | 1 | 0.84–0.84 | 1.13 | 1570 |
| 2026-03-16 | 11 | 0.99–4.86 | 0.35 | 6290 |
| 2026-05-04 | 1 | 4.86–4.86 | 0.43 | 3400 |
| 2026-08-22 | 11 | 1.14–4.60 | 0.11 | 6060 |
| 2026-09-22 | 1 | 4.29–4.29 | 0.24 | 4520 |

## Epsilon Indi B

| Visit date | Exposures | λ (µm) | Offset (px) | Flux at target (mJy) |
|---|---|---|---|---|
| 2025-04-28 | 7 | 1.56–4.42 | 0.52 | 26.5 |
| 2025-06-07 | 3 | 1.89–4.38 | 0.43 | 30.9 |
| 2025-10-12 | 11 | 0.78–4.64 | 0.17 | 20.5 |
| 2026-04-25 | 5 | 0.77–3.83 | 0.24 | 18.3 |
| 2026-09-27 | 10 | 1.35–4.94 | 0.6 | 29.9 |

## WISE 0855−0714

| Visit date | Exposures | λ (µm) | Offset (px) | Flux at target (mJy) |
|---|---|---|---|---|
| 2025-05-06 | 3 | 4.04–4.97 | 0.15 | 0.294 |
| 2025-11-09 | 12 | 3.82–4.98 | 0.19 | 0.604 |
| 2025-12-12 | 2 | 4.19–4.70 | 0.07 | 0.669 |
| 2026-05-01 | 9 | 3.83–4.90 | 0.57 | 0.503 |

## RW Aurigae

| Visit date | Exposures | λ (µm) | Offset (px) | Flux at target (mJy) |
|---|---|---|---|---|
| 2025-09-10 | 12 | 0.78–4.57 | 0 | 662 |
| 2026-03-02 | 12 | 0.79–4.94 | 0 | 1030 |
| 2026-09-11 | 12 | 0.75–4.49 | 0 | 673 |

## R Draconis

| Visit date | Exposures | λ (µm) | Offset (px) | Flux at target (mJy) |
|---|---|---|---|---|
| 2025-06-17 | 10 | 0.92–4.44 | 1 | 16200 |
| 2025-11-24 | 14 | 0.78–4.80 | 1.41 | 18800 |
| 2026-05-07 | 5 | 1.68–4.70 | 1 | 20900 |
| 2026-07-01 | 7 | 1.01–4.58 | 1.42 | 13400 |

