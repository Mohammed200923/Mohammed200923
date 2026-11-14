# How SkyShift and Ibrahim's interfaces fit together

One site, three views, one data engine:

| URL | View | Built by | What it is for |
|---|---|---|---|
| `/` | Landing page | SkyShift | Three doors and the five challenge targets |
| `/spherex-immersive/` | **3D sky** | Ibrahim | Fly to a target on a three.js globe, step through its observations, compare, Star Stories |
| `/spherex-explorer/` | **Explorer** | Ibrahim | Target list, side-by-side comparison, image details, English and Arabic |
| `/analysis.html` | **Analysis** | SkyShift | Any RA/Dec, all 102 bands, mover search, light curves and spectra, overlays, video export |

Each view links to the others: the 3D sky toolbar has an **Analysis** button that opens the current target there, and the Explorer rail has **Analysis** and **3D sky** links.

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
- `spherex-immersive/js/main.js` builds its provider from the SkyShift one; `js/data/provider.js` turns off the decorative extras; an **Analysis** link in `index.html` and `js/ui/hud.js`.

Source: [Ibrahim-oss1/Nasa-spaceapps.](https://github.com/Ibrahim-oss1/Nasa-spaceapps.), copied at commit `dca1d9d`.
