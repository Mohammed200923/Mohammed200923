# SPHEREx Sky Explorer: front end (Style 2, final)

The finished front end for the NASA Space Apps SPHEREx / Planet X project. It builds on the **Style 2 · Orbit Deck** workspace prototype (`../ui-experiments/style2-workspace`) and keeps its stack: plain HTML, CSS and vanilla JavaScript, no framework, no build step.

> **Everything shown is simulated demonstration data.** No NASA, SPHEREx or IRSA data is loaded or requested. Real data is connected later by replacing one provider object; see **[FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)**.

## Run

```bash
cd spherex-explorer
npx serve .          # or: python -m http.server 8800   (any static server)
```
Open the printed address. All testing used an HTTP server. The app uses classic `<script>` tags (no ES modules), so opening `index.html` directly should also work, but that was not verified. Google Fonts fall back to system fonts offline.

## What's in it

| Area | Summary |
|---|---|
| **Onboarding** | First-run setup: language → theme → experience level → accessibility → summary. Skippable; replay from Help or Settings. |
| **Languages** | English and Arabic with real right-to-left layout. Switch any time (rail, Settings, or ask the guide). |
| **Themes** | Dark, light, or follow the system. Green / teal / gold identity. |
| **Experience levels** | Beginner (presets, plain-language help), Intermediate (+ wavelength, field of view, brightness/contrast, overlays), Advanced (+ histogram, overview map, metadata, data inspector). Levels hide controls; they never lock features. |
| **Accessibility** | Reduced motion, larger text, high contrast, full keyboard use, visible focus rings, screen-reader labels and live announcements. |
| **Sky Explorer** | Interactive star map (pan, zoom, pinch, keyboard), search by name, RA/Dec entry with validation, object panel, viewing modes, infrared wavelength/bands, field of view, brightness/contrast, timeline playback. |
| **Observations** | Every visit for the selected object or position: thumbnails, status, quality flags, band availability, metadata dialog. |
| **Comparison** | Before/after slider, side by side, difference image, blink; observation date and band selection; change summary. |
| **Guide** | Built-in demonstration assistant: predefined bilingual answers, some of which run real UI actions. Clearly labelled as not AI. |
| **Responsive** | Desktop workspace, tablet landscape side panel, tablet portrait / phone bottom sheet with bottom tab bar (safe-area aware). |
| **States** | Initial, loading, success, empty, missing observation/band, invalid coordinates, unsupported operation, network error/timeout, all with retry where it makes sense. |

Keyboard: `/` search · arrows move the map · `+`/`−` zoom · `N`/`P` next/previous object · `Space` play/pause · `[` `]` step visits · `g` then `e o c h s` go to a section · `?` help.

## Layout

```
index.html                 shell, icon sprite, all five views
css/                       tokens (palette, themes, a11y modes) · base · components · layout · explorer · views · responsive
js/core/                   util · store (prefs + session, localStorage) · coords (RA/Dec parsing) · controller
js/i18n/                   i18n engine + en.js + ar.js
js/data/contracts.js       data shapes + validators + DataError
js/data/service.js         SX.data: the only thing the UI uses to get data
js/data/mock/              demo catalog, simulated images, MOCK PROVIDER  (delete when real data is connected)
js/engine/                 skymap (canvas map) · compare widget · render helpers · procedural backdrop
js/ui/                     shell · explorer · observations · comparison · searchbox · assistant · help · settings · onboarding
js/app.js                  boot; the one place the provider is chosen
tools/                     check-i18n.mjs · test-core.mjs
```

## Checks

```bash
node tools/check-i18n.mjs   # English and Arabic dictionaries cover every key used
node tools/test-core.mjs    # coordinate parsing/validation + data-contract validators
node tools/check-contrast.mjs   # WCAG contrast of the colour tokens in every theme
```

## Not in scope (by design)

NASA API access, dataset download, FITS handling, image alignment, motion-detection or spectra algorithms, backend, authentication, deployment. The UI exposes clean seams for them; see the integration guide.

## Known limitations

* Verified in the in-app Chromium browser at phone, tablet and desktop sizes. **Not** tested on real iOS/Android devices, Safari or Firefox, or with a screen reader.
* Colour contrast of every token pair is verified by `node tools/check-contrast.mjs` (WCAG AA, dark, light and both high-contrast modes). A full automated audit of rendered pages (axe or similar) was not run; a structural check (accessible names, labels, ARIA references, duplicate ids) was done by script.
* The star map's sky is procedural decoration; positions of the 21 demo objects are approximate.
* Arabic text for demo objects, glossary and guide was written for this demo and deserves a native-speaker review before public use.
