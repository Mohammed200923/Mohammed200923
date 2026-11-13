# Combining SkyShift with SPHEREx Explorer

Two projects from the same team, built for the same challenge:

- **SPHEREx Explorer** ([Ibrahim-oss1/Nasa-spaceapps.](https://github.com/Ibrahim-oss1/Nasa-spaceapps.)): a Next.js / React / TypeScript app with a polished interface.
- **SkyShift** (this repo): a browser engine that loads **real** SPHEREx data and turns it into aligned frames.

They fit together well. SPHEREx Explorer's README says its SPHEREx time sequence is simulated, and that `src/services/index.ts` is *"the one file to change when real SPHEREx/IRSA APIs are wired in"*. SkyShift is that real SPHEREx/IRSA layer, already checked against the live archive.

## Blocker: the Explorer source code isn't on GitHub yet

The Explorer repo has one commit ("Add files via upload") that contains only config files (`package.json`, `tsconfig.json`, `next.config.ts`, …). The whole `src/` folder is missing, so the app can't be built from the repo. Ibrahim needs to push it, either with `git push` or by dragging the whole `src` folder into GitHub's "Upload files" page. Uploading single files drops the folder structure.

Everything below is based on the Explorer README and the file list in its `tsconfig.tsbuildinfo`, not on its source.

## Who does what best

| Area | SPHEREx Explorer | SkyShift | Combined product uses |
|---|---|---|---|
| Interface, onboarding, guided tour | ✅ polished | basic | **Explorer** |
| English / Arabic (i18n) | ✅ | – | **Explorer** (strong for Saudi local judging) |
| Blink, 6 comparison modes, zoom/pan, keyboard | ✅ | play / scrub / difference | **Explorer** UI |
| Provenance badges (Real / Simulated / Computed) | ✅ | watermark only | **Explorer** |
| Context sky imagery (AllWISE / 2MASS / DSS2) via Aladin + `/api/hips` | ✅ real | Aladin (browser only) | **Explorer** |
| Archival cutouts DSS2 → Pan-STARRS via `/api/cutout` | ✅ real | – | **Explorer** |
| **SPHEREx images** | simulated | ✅ **real** (IRSA SIA + cutouts) | **SkyShift** |
| FITS reading, SIP distortion, reprojection, visit stacking | – | ✅ tested vs astropy | **SkyShift** |
| Zodiacal-light subtraction, artifact masking | – | ✅ | **SkyShift** |
| Spectra | illustrative templates | ✅ real photometry at exact per-pixel λ | **SkyShift** |
| Change detection (threshold + regions on difference image) | ✅ on simulated frames | – | **Explorer's algorithm on SkyShift's real frames** |
| Gaia DR3 proper-motion overlay | metadata | ✅ per-frame overlay | **SkyShift** |
| Video export | – | ✅ | **SkyShift** |
| Assistant | scripted, no AI | – | Keep only if clearly labelled; it's the weakest part for "Validity" |

## How to merge

Keep **Explorer as the app** and move SkyShift's engine into it as a library.

1. Copy SkyShift's modules into `src/lib/spherex/` and add types:
   `fits.js`, `wcs.js`, `stack.js`, `spherex.js`, `catalogs.js`, `providers/irsa.js`. They are plain ES modules with no dependencies, so `allowJs` already lets Next.js import them; convert them to `.ts` later if time allows.
2. Add a Next.js route `src/app/api/irsa/route.ts` to replace `server.py`'s proxy. It must allow-list `irsa.ipac.caltech.edu` and stream the response, so the browser can stop reading after ~120 KB of each ~4 MB cutout. IRSA sends no CORS headers, so this proxy is required.
3. Write `src/services/real/observations.ts` implementing Explorer's observation contract (`src/services/types.ts`):
   - `irsaProvider.search()` gives the list of SPHEREx images
   - `fetchCutout()` + `decodeCutout()` + `reproject()` give aligned frames
   - `buildSequence(mode: 'visit')` gives one frame per six-month visit (Explorer's timeline already expects ~6-month visits)
4. Write `src/services/real/spectra.ts` with `aperturePhotometry()` + `wavelengthAt()`, so spectra become **Real** instead of **Illustrative**.
5. Switch `src/services/index.ts` to the real services, keeping the mock ones as an offline fallback, and set provenance badges from the data source.
6. Run Explorer's `detect.ts` on the real difference images, then compare its detections against the predicted track and Gaia overlay.
7. Port SkyShift's tests into Vitest (`src/**/*.test.ts`): the WCS-vs-astropy and wavelength-vs-astropy checks, and the live Barnard's Star check.

Estimated effort: steps 1–5 take one builder about half a day; step 6 and testing take about a quarter day.

## New challenge resources (released 13 Nov)

- **IRSA SPHEREx tutorials:** used to verify SkyShift. Collections are now `spherex_dr1` and `spherex_qr3`. The cutout syntax `?center=RA,DECd&size=DEG`, the FLAGS names (`MSKNnnnn`) and the `WCS-WAVE` lookup all match the code.
- **WiseView:** the model for this tool (a flip-book of WISE epochs). Our blink/difference and the visit flip-book follow the same idea, and the pitch can say "WiseView for SPHEREx".
- **Gaia DR3 at MAST:** SkyShift reads the same DR3 catalogue from CDS VizieR; either source is fine.
- **NEOSSat / CADC (CSA partner data, optional):** an add-on for asteroids, e.g. showing NEOSSat observations of a known asteroid next to the SPHEREx movie. Do it only after the core works.

## Rule 01

Building is allowed only on 14–15 November. Do the merge itself during the hackathon, and declare both earlier prototypes and the AI tools used on the project page.
