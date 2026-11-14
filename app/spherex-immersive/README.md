# SPHEREx Immersive Explorer (front end)

An immersive, map-like way to explore SPHEREx observations: a full-screen 3D sky you drag and zoom, minimal floating controls around the edges, a proper 2D observation viewer, cinematic **Star Stories**, and an integrated astronomy **guide**.

It is a **separate front-end variant**. The existing apps (`../spherex-explorer` = Style 2, `../Nasa-spaceapps.-main` = Next.js prototype, `../ui-experiments`) are untouched.

> **Everything shown is demonstration data.** No NASA, SPHEREx or IRSA request is made. The decorative stars are procedural. Real data plugs in through one provider object (see [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)).

## Run

```bash
node spherex-immersive/tools/serve.mjs        # from the workspace root, then open the printed address
# http://localhost:8810/spherex-immersive/
```

Any static server works **if its root is the workspace folder** (the page loads the shared data layer from `../spherex-explorer/js`). Example: `npx serve .` from the workspace root, then open `/spherex-immersive/`. Needs a modern browser with WebGL (the app still works without it: search, observations and stories stay usable).

No build step, no npm install. Three.js (r187, MIT) is vendored in `js/vendor/`.
Google Fonts (Manrope, IBM Plex Sans Arabic, Instrument Serif) are optional and fall back to system fonts offline.

Checks:

```bash
node spherex-immersive/tools/check-i18n.mjs   # English and Arabic cover every key the code uses
```

## Composition (follows the supplied reference interface)

| Reference element | Here |
|---|---|
| Dominant full-bleed scene | Interactive 3D sky (Three.js, seen from inside the celestial sphere) |
| Circular back button + caption | Back / start over, current target under it |
| Left circular tools with captions | Explore · Search · Observations · Compare · Star Stories |
| Faint grid + coordinates | Screen grid, celestial graticule, RA/Dec readout |
| Selected object with corner handles, label and stacked menu | Handles + name/type + **Discover its story / Analyze / Zoom / Observations** |
| "N New Messages" + map card with white button | "Ask the guide" + sky chart (click to jump, expands to a full chart) |
| Lights + level bars | Infrared view + sliders (infrared, stars, grid, wavelength band) |
| Big-number status row | RA, Dec, field of view, visits, band, data source |
| Circular ticked rotation control + "1x" | Sky-rotation dial (celestial north marker) + zoom preset |

The dial rotates the **sky view**. It is not a terrestrial compass.

## Features

- **Sky**: drag, wheel/trackpad/pinch zoom, keyboard (arrows, `+`/`−`, `Q`/`E`), inertia, smooth fly-to with zoom-out arc, selection, hover, tap empty sky to pin a position.
- **Search**: by name/alias (Arabic too) or by RA/Dec (decimal, h m s, d m s) with per-field validation and plain-language errors.
- **Information** in layers: basic → explore (intermediate) → advanced (coordinates, timestamps, per-band availability, metadata, quality flags, existing analysis results, spectral placeholder).
- **Observation viewer** (flat 2D, never mapped onto 3D): single image, before/after slider, side by side, difference, blink; shared pan/zoom across visits; wavelength presets and per-band selection; display colour map, brightness, contrast; provenance and quality labels; metadata.
- **Timeline**: collapsible; previous/next, play/pause, speed, date chips, planned visits shown as such.
- **Star Stories**: gallery + six-chapter cinematic presentations (Barnard's Star, WISE 0855, RW Aurigae, R Draconis, plus a neutral template for any other object). All text is **draft**, flagged on screen; artwork is labelled *Illustration*. See "Content rules" below.
- **Guide** (assistant UI): questions, answers, highlighted regions, evidence links, confidence/uncertainty, three-tier prediction block (observed / model-based / speculation), unsupported and error states. Demo answers are templates; there is no model.
- **Onboarding**: welcome → language → appearance → experience level → accessibility → done. Optional and skippable; everything is repeatable in Settings.
- **Languages**: English and Arabic with real RTL layout (logical CSS properties; sky overlays mirror).
- **Themes**: dark, light, follow system. Stories use fixed "exhibition lighting" in both.
- **Levels**: beginner / intermediate / advanced reveal controls (CSS `lvl-int`, `lvl-adv`); nothing is locked.
- **Accessibility**: reduced motion (system/on/off), larger text, high contrast, full keyboard use, visible focus, focus trapping in dialogs, live announcements, labelled controls, no hover-only actions.
- **Devices**: desktop workspace, tablet layout with docked panels, phone layout with bottom navigation, bottom-sheet panels, safe-area insets, touch-sized targets, pinch zoom. **Low-performance mode** reduces stars and effects.

## Layout of the code

```
index.html                 shell, icon sprite, HUD skeleton
css/                       tokens · base · hud · panels · story · responsive
js/main.js                 boot: the ONLY place that picks the data provider and assistant adapter
js/core/                   state (prefs + session + bus) · controller · i18n (+ lang-en/ar) · appearance · dom helpers · ui registry
js/sky/skyscene.js         Three.js sky: stars, glow, graticule, markers, camera, fly-to, picking
js/data/                   provider.js (wraps the shared provider) · editorial.js (draft story text) · assistant-demo.js
js/ui/                     hud · selection · minimap · timeline · info · viewer · search · stories · assistant · onboarding · settings · help · common
js/vendor/                 three.module.js + three.core.js (MIT)
tools/                     serve.mjs · check-i18n.mjs · list-keys.mjs
```

Shared (read-only) from `../spherex-explorer/js`: `core/util.js`, `core/coords.js`, `data/contracts.js`, `engine/render.js`, `data/mock/*` (demo catalog and provider), `data/service.js` (`SX.data`). Nothing there was modified.

## Content rules (important)

- No astronomical fact is invented. Story chapters that need measurements show "awaiting verified data". Values that do appear come from the data provider and carry its provenance chip.
- Decorative sky, glow clouds, story artwork and display colour maps are never presented as observations. Labels: *Decorative sky*, *Illustration*, *Demonstration data*.
- No prediction is shown as a forecast. The guide separates **observed**, **model-based extrapolation** (only when a validated model is connected) and **speculation** (not shown).
- Two extra targets (RW Aurigae, R Draconis) exist only as flagged demo entries so their stories can be built; positions are approximate.

## Known limits

- Not tested on real iOS/Android devices, Safari, Firefox or screen readers. Touch and pinch code paths exist but were only exercised with emulation and desktop input.
- Arabic text is a first translation and needs review by a native speaker and an astronomy editor.
- The 3D sky is a navigation aid with procedural stars; it contains no survey imagery.
- Difference/candidate colours and confidence values are whatever the provider returns; the demo values are not scientific.
