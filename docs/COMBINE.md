# How SkyShift and Ibrahim's interfaces fit together

The product is Ibrahim's **3D sky**, running on the SkyShift engine. Opening the site (`/`) goes straight to it.

| Where | What | Built by |
|---|---|---|
| `/spherex-immersive/` | **3D sky**: fly to a target on a three.js globe, step through its real observations, compare dates, Star Stories, English and Arabic | Ibrahim (interface), SkyShift (data) |
| **Analysis** button in the 3D sky toolbar (also "Full analysis" in the observation viewer) | The complete SkyShift tool as a full-screen panel, opened on the selected target: time-lapse, every SPHEREx band, mover search with WISE 2010–2024, Gaia / CatWISE / JPL overlays, difference view, click-to-measure spectrum and light curve, NEOSSat, sky context, video / PNG / CSV export, share link and embed code | SkyShift |
| `/analysis.html` | The same analysis tool as a standalone page: the target of embed codes, and used by the automated tests | SkyShift |

Shared links work: `/?q=Barnard's Star` or `/spherex-immersive/?ra=…&dec=…` open the 3D sky with the analysis already showing that field.

The analysis panel is not a copy: it loads the markup of `analysis.html` and runs the same `js/main.js`, restyled with the 3D sky's colour tokens (`spherex-immersive/css/analysis.css`, generated from `css/style.css`). Every function therefore behaves identically in both places. (`/spherex-explorer/`, Ibrahim's earlier interface, is still in the repository because the shared data provider lives in it, but the site no longer links to it.)

## How the data reaches Ibrahim's interfaces

Ibrahim's interfaces never call an archive directly. They call `SX.data`, which wraps a *provider* and checks every answer against `spherex-explorer/js/data/contracts.js`. His repository ships a mock provider. We added a real one:

```
spherex-explorer/js/data/providers/skyshift.js   ← the real provider (new)
        │  getFeaturedTargets, searchTargets, getObservations,
        │  getObservationImage, getObservationMetadata, getComparisonResult …
        ▼
js/field.js   loadField({ra, dec, …})   ← UI-free SkyShift engine (new)
        │
        ├─ IRSA SIA + cutouts: SPHEREx Wide and Deep, DR1 + QR3 (FITS, WCS, EPSF)
        ├─ AllWISE + NEOWISE W2 frames (2010–2024), CatWISE2020
        ├─ Gaia DR3 at MAST, JPL small bodies
        └─ mover search + WISE 15-year refit
```

- **Observations**: one per SPHEREx survey visit (a weighted stack of every exposure in it), plus WISE frames about every 3 years back to 2010.
- **Images**: rendered to PNG from the real FITS data. The "composite" band is a false-colour RGB: blue = detectors 1–2, green = 3–4, red = 5–6.
- **Metadata**: real dates, wavelengths, exposure counts and masked-pixel fractions, plus the movers found in the field with their measured speeds.
- **Comparison**: a noise-normalised difference of two real frames; gold = brighter, cyan = fainter. The candidates are the measured movers, e.g. *"Target: 10.32 ± 0.10″/yr (Gaia DR3 10.39″/yr)"*.
- **Targets**: Ibrahim's 21-object catalogue plus the challenge targets, with positions propagated to 2026. Nothing is marked simulated.

The first visit to a field takes a few minutes (it downloads every exposure), so the provider allows longer time-outs than the mock. After that the server cache serves it in seconds.

## What we changed in Ibrahim's code

Kept to a minimum, so his updates can be merged again:

- `spherex-explorer/index.html` loads `js/boot-skyshift.js` (the real provider, then his `app.js`) and has two rail links.
- `spherex-explorer/js/app.js` uses `SX.providers.skyshift` when it is present, else his mock.
- `spherex-explorer/js/data/service.js`: a provider may set longer per-call time-outs.
- `spherex-immersive/js/main.js` builds its provider from the SkyShift one and starts the Analysis panel; `js/data/provider.js` turns off the decorative extras.
- New `spherex-immersive/js/ui/analysis.js` and `css/analysis.css`; an **Analysis** toolbar button (`index.html`, `js/ui/hud.js`) and a **Full analysis** button in `js/ui/viewer.js`.

Source: [Ibrahim-oss1/Nasa-spaceapps.](https://github.com/Ibrahim-oss1/Nasa-spaceapps.), copied at commit `dca1d9d`.
