# SkyShift — hackathon plan

Challenge: **Planet X and SPHEREx** (Advanced). Event: NASA Space Apps Saudi Arabia, 14–15 Nov 2026. Submission deadline: **11:59 pm Saudi time, 15 Nov**.

## Rules — read first

The Participant Guide (§12, Rule 01) says building starts on 14 November: *"Research and team planning before then are fine; writing code or making project assets are not."* Early work can get the team disqualified.

This repository contains working code written on 31 October. Your options:

1. **Safest:** treat this repo as research and practice. On 14 Nov, create a fresh public repo and rebuild during the weekend, using this plan and your own understanding. You will move fast because the hard problems (FITS, WCS, reprojection, archive APIs) are already understood.
2. Ask your city's Local Lead (contacts in the Participant Guide, §14) or post in Space Apps Connect whether pre-existing code may be used if it is disclosed. Follow their answer.
3. Don't submit this repo as is without (1) or (2).

Either way, list every tool, library and AI assistant in the project's References and "Use of AI" fields.

## Problem (slide 2 — Impact)

SPHEREx maps the whole sky in 102 infrared bands every six months, over a billion sources per pass. Comets, asteroids, nearby stars, cold brown dwarfs and perhaps a "Planet X" reveal themselves by **shifting between passes**, but nobody can look through that data by hand. Citizen-science projects like Backyard Worlds found most known nearby brown dwarfs this way, using WISE. **SPHEREx has no public flip-book yet.**

## Solution (slide 3 — Creativity)

*"Type a spot in the sky, get a movie."* SkyShift takes coordinates and returns an aligned, stackable, downloadable time-lapse of SPHEREx data with these tools:

- a difference mode that turns movers into blue/orange pairs
- proper-motion track and Gaia overlays that separate known movers from new ones
- one-click spectra and light curves from all 102 bands
- shareable and embeddable URLs, so any website or classroom can use it

## How it works (slide 4 — Validity)

1. Resolve the name (CDS Sesame), or parse decimal/sexagesimal RA, Dec.
2. Propagate the proper motion so the field is centred on the object during the survey.
3. Run an IRSA SIA v2 query to list all SPHEREx Level-2 images covering the point (ObsCore: time, λ range, detector).
4. Filter by λ and detector, then download small cutouts (multi-extension FITS).
5. In the browser:
   1. Subtract the `ZODI` model.
   2. Mask `FLAGS` bad pixels (bit names come from the `MP_*` header keywords; `SOURCE` is never masked).
   3. Apply TAN-SIP WCS and bilinear reprojection onto a north-up 6.15″/px grid.
6. Group the exposures into survey visits (gap > N days) and mean-coadd each visit to boost signal-to-noise.
7. Display: asinh/log/sqrt stretch, colour maps, difference against the per-pixel median of all visits.
8. Photometry: aperture plus annulus, converted from MJy/sr to mJy. The aperture follows the predicted track when you click the target.

## NASA data (slide 5 — Relevance)

SPHEREx Level-2 spectral images from IRSA are the core of the tool: without them there is no product. Gaia DR3 (ESA, partner data) and 2MASS/AllWISE context images (NASA/IPAC) are layered on top.

## Demo script (slide 6 / 30-second video)

| Time | Shot |
|---|---|
| 0–5 s | Full-sky SPHEREx image: "A billion objects. Some of them are moving." |
| 5–12 s | Click **Barnard's Star** → movie plays and the star slides north along the predicted cyan track. |
| 12–18 s | Toggle **Difference**: the static sky vanishes and the mover becomes a blue/orange pair. |
| 18–24 s | Click it → spectrum and light curve appear. Switch to **3.8–5 µm** and load **WISE 0855** (the coldest brown dwarf). |
| 24–30 s | "Copy embed code" → the same movie inside a school web page. *"SkyShift — NASA SPHEREx, for everyone."* |

Record a backup of the demo before judging in case the live archive is slow.

## 7-slide deck

1. **Title:** SkyShift — Watch the infrared sky move · Planet X and SPHEREx · team · city
2. **Problem:** 1 billion sources × 102 bands × every 6 months; discoveries hide in the motion
3. **Solution:** screenshot plus one sentence
4. **How it works:** the pipeline diagram above
5. **NASA data:** SPHEREx/IRSA (core), Gaia, 2MASS/AllWISE
6. **Demo:** Barnard's Star difference GIF, WISE 0855 spectrum
7. **Impact and next steps:** citizen science, classrooms, embeddable; next: automatic dipole detection, JPL Horizons asteroid matching, NEOWISE 15-year baseline

## Weekend task split (4–6 people)

| Role | Saturday | Sunday |
|---|---|---|
| Data lead | Confirm the live IRSA SIA collection, columns and cutout syntax; fix `providers/irsa.js` | Validate all five test targets; record what works |
| Builder 1 | Pipeline (FITS/WCS/reprojection), performance | Photometry, per-pixel wavelength from `WCS-WAVE` |
| Builder 2 | UI, playback, video export | URL/embed, Gaia overlay, deploy to GitHub Pages plus the proxy |
| Designer | Visual polish, mobile, accessibility | Deck visuals, video edit |
| Storyteller | Project page text, References | 30-second video, pitch rehearsal (×2) |
| Team Owner | Repo, team membership | **Submit early, re-submit before 11:59 pm** |

## Live archive checks (done 13 Nov 2026)

- [x] SIA works with `COLLECTION=spherex_dr1&COLLECTION=spherex_qr3`. The old name `spherex_qr` is superseded.
- [x] Rows have `access_url`, `t_min`, `em_min`/`em_max` (metres), and `energy_bandpassname` (`SPHEREx-D1`…`D6`).
- [x] `<access_url>?center=RA,DECd&size=DEG` returns IMAGE, FLAGS, VARIANCE, ZODI, EPSF and WCS-WAVE.
- [x] Barnard's Star: 358 images over 6 visits (Aug 2025 – Sep 2026). The star follows its predicted track to within about 1 px.
- [x] All five targets on real data (14 Nov). See [RESULTS.md](RESULTS.md).
- [x] Gaia overlay works (falls back to VizieR mirrors when CDS is down). The Aladin sky map loads; its image tiles still need checking on a normal connection.

## Test target notes

| Target | Why | Expectation |
|---|---|---|
| Barnard's Star | 10.4″/yr, brightest test | Clear motion and dipole in difference mode |
| Epsilon Indi B | Brown-dwarf binary, ~4.7″/yr | Motion across visits; unresolved pair at 6″ pixels |
| WISE 0855−0714 | ~250 K brown dwarf, 8.1″/yr | Only visible at long λ; use the 3.8–5 µm preset |
| RW Aurigae | Young variable star | Brightness changes, no motion |
| R Draconis | Mira variable, ~245-day period | Large brightness swings between visits |
