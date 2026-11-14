# Frontend integration guide

This document is for the person who connects **real SPHEREx data** to the Sky Explorer front end.
You do not need to touch any UI code. You replace one object (the *data provider*) and, optionally, one more (the *sky backdrop*).

> Everything in this repo today is **simulated**. No NASA / SPHEREx / IRSA request is made anywhere.
> All scientific work (data access, FITS, alignment, spectra, motion detection) belongs to the data side.
> The UI only needs the **shapes** described below.

---

## 1. The 60-second version

1. Write a provider object that implements the functions in [section 4](#4-provider-functions). Each returns a Promise of plain data, or **throws** `SX.DataError(code, message)`.
2. Put it in a new file, e.g. `js/data/providers/spherex.js`, exposing `SX.providers.spherex = { ... }`.
3. Add `<script src="js/data/providers/spherex.js"></script>` to `index.html` **before** `js/app.js`.
4. In `js/app.js` change one line: `provider: SX.providers.spherex`.
5. Open the app, go to **Settings → Experience level → Advanced → Data inspector**. Every call the UI makes is listed there with timing and result. A wrong shape shows up as a `bad-response` error naming the field, instead of a broken screen.

That is the whole integration. Details follow.

---

## 2. Architecture

```
 UI views (explorer / observations / comparison / help / settings / assistant)
        │  read state, render, call controller functions
        ▼
 SX.app  (state store)          ◄──────────────  SX.ctrl  (js/core/controller.js)
                                                    "what happens when the user picks a target,
                                                     types coordinates, steps a visit ..."
                                                        │
                                                        ▼
                                                  SX.data  (js/data/service.js)
                                          wraps the provider, turns promises/exceptions into
                                          { status, data, error, meta }, validates shapes
                                          (contracts.js), caches images, logs every call
                                                        │
                                                        ▼
                                         PROVIDER  ◄── replace this
                                   js/data/mock/provider.js  (today)
                                   js/data/providers/spherex.js  (yours)
```

* **Views never call a provider.** They call `SX.ctrl.*` and render from `SX.app`.
* **`SX.data` is the only place that touches a provider.** It guarantees the UI always sees one of `ok | empty | error`.
* **The mock lives in `js/data/mock/` and nothing outside that folder imports it** (except the one wiring line in `app.js`). You can delete the folder once your provider works.
* The map's decorative sky (procedural stars, Milky Way band) is a separate, swappable `backdrop` (`js/engine/backdrop.js`, [section 8](#8-the-sky-backdrop)).

Plain HTML/CSS/vanilla JS, classic `<script>` tags, no build step. Serve the folder over HTTP (any static server) for development. Google Fonts are optional and fall back to system fonts offline.

---

## 3. Data contracts

Contracts are defined (with JSDoc and runtime validators) in `js/data/contracts.js`. Field names below are exact.

Conventions: angles are **degrees** (ICRS), wavelengths **micrometres (µm)**, timestamps **ISO-8601 UTC strings**, ids are **opaque strings** (the UI never parses them).

### 3.1 LocalizedText
Any user-visible text may be a plain string **or** an object keyed by language. The UI picks the current language and falls back to `en`.

```json
"Betelgeuse"
{ "en": "Betelgeuse", "ar": "منكب الجوزاء" }
```
A real backend can simply return English strings; Arabic can be added later without UI changes.

### 3.2 Coordinates
```json
{ "ra": 88.79, "dec": 7.41 }
```
`ra` 0 ≤ ra ≤ 360, `dec` −90 ≤ dec ≤ 90. Validated.

### 3.3 WavelengthBand
```json
{ "id": 4, "minMicron": 2.42, "maxMicron": 3.82, "channels": 17, "hint": "Ices and dust grains" }
```
`id` is what you receive as `band` in `getObservationImage`. `hint` is optional (the UI has its own translated hints for ids 1–6; unknown ids fall back to `hint`). The wavelength slider range is derived from the first `minMicron` and last `maxMicron`.

### 3.4 Target
```json
{
  "id": "betelgeuse",
  "name": { "en": "Betelgeuse", "ar": "منكب الجوزاء" },
  "aliases": ["alpha Ori", "Betelgeuse"],
  "classification": "star",
  "typeLabel": { "en": "Red supergiant", "ar": "عملاق فائق أحمر" },
  "coordinates": { "ra": 88.79, "dec": 7.41 },
  "constellation": "Orion",
  "description": { "en": "A huge, cool, red star that slowly pulses in brightness.", "ar": "…" },
  "whyInfrared": { "en": "Cool stars radiate most strongly in infrared …", "ar": "…" },
  "distanceLightYears": 550,
  "temperatureKelvin": 3600,
  "angularSizeDeg": 0.02,
  "apparentMagnitude": 0.6,
  "metadata": [
    { "key": "distance", "value": 550, "unit": "ly" },
    { "key": "temperature", "value": 3600, "unit": "K" },
    { "key": "spectralType", "value": "M1–2 Ia–ab" },
    { "key": "angularSize", "value": 0.02, "unit": "deg" },
    { "key": "apparentMagnitude", "value": 0.6 }
  ],
  "availability": "available",
  "observationCount": 6,
  "isSimulated": true
}
```

| Field | Required | Notes |
|---|---|---|
| `id`, `name`, `coordinates`, `description`, `metadata` | **yes** | `metadata` may be `[]`. |
| `classification` | recommended | One of `star`, `nebula`, `galaxy`, `cluster`, `region`, `brown-dwarf`, `other`. Drives the label (translated) and how the map draws the object. |
| `typeLabel` | no | More specific label shown under the name. Falls back to the translated classification. |
| `constellation` | no | IAU English name. Translated via `const.<Name>` keys if present, otherwise shown as is. |
| `temperatureKelvin`, `apparentMagnitude`, `angularSizeDeg` | no | Only used to **draw the marker** on the map (colour, brightness, size). Safe to omit. |
| `whyInfrared` | no | Shown as the "Why infrared?" box. |
| `availability` | no | `available | partial | none | unknown`. Badge on the object panel. |
| `isSimulated` | **yes, honest** | Set `false` for real data. Demo data shows "Demonstration data" labels everywhere. |
| `demo` | mock only | The mock adds `demo: { variable, mover }` to animate map markers. Real providers omit it. |

**MetadataField**: `{ key, label?, value, unit? }`. If the UI has a translation `meta.<key>` it uses that as the label; otherwise it uses `label` (LocalizedText); otherwise the raw `key`. Known keys with special formatting: `distance` (ly), `angularSize` (deg), `temperature` (K), `apparentMagnitude`, `startTime`, `status`. Any other key is displayed generically as `value + unit`, so you can add fields freely.

### 3.5 Observation
```json
{
  "id": "demo:betelgeuse:v3",
  "targetId": "betelgeuse",
  "center": { "ra": 88.79, "dec": 7.41 },
  "fieldOfViewDeg": 10,
  "startTime": "2026-06-15T12:00:00.000Z",
  "endTime": "2026-06-18T12:00:00.000Z",
  "status": "observed",
  "visitIndex": 3,
  "bands": [
    { "bandId": 1, "available": true,  "quality": [] },
    { "bandId": 5, "available": false, "quality": [ { "code": "scattered-light", "severity": "warning" } ] }
  ],
  "quality": [ { "code": "ok", "severity": "info" } ],
  "coverage": 1,
  "source": "demo",
  "isSimulated": true
}
```
* `status`: `observed | planned | processing | failed`. **Planned** observations have no images (the UI shows a "Planned" placeholder, skips them during playback, and excludes them from Comparison).
* `visitIndex`: 1-based label ("Visit 3"). `startTime` orders the timeline; the UI sorts by it.
* `bands[]`: per-band availability. If `available` is `false`, `getObservationImage` for that band should throw `not-available` (the UI then says "This band is missing for this visit").
* `coverage`: fraction (0–1) of the requested field covered.

### 3.6 QualityFlag
```json
{ "code": "low-snr", "severity": "warning", "detail": "optional free text" }
```
`severity`: `info | warning | error`. Codes with translations: `ok, low-snr, cosmic-ray, saturated, scattered-light, partial-coverage, pending`. **Unknown codes are displayed verbatim**, so adding new ones needs no UI change (add `q.<code>` strings to `en.js`/`ar.js` to translate them).

### 3.7 ObservationImage  (`getObservationImage`)
```json
{
  "observationId": "demo:betelgeuse:v3",
  "bandId": 4,
  "url": "https://…/obs/123/band4.png",
  "encoding": "intensity-gray",
  "width": 256, "height": 256,
  "wavelengthMinMicron": 2.42, "wavelengthMaxMicron": 3.82,
  "quality": [ { "code": "ok", "severity": "info" } ],
  "isSimulated": false
}
```
* `url`: any `https:`, `blob:` or `data:` URL to a **PNG/JPEG**. (The mock returns `data:` URLs; no server needed.)
* `encoding`:
  * `"intensity-gray"`: a single-band picture. The **UI applies the colour palette, brightness and contrast** (that is what the *Viewing mode / palette / brightness / contrast* controls do). Pixel value 0–255 is mapped to 0–1; the UI's formula is `clamp((v·brightness − 0.5)·contrast + 0.5)` then the palette lookup.
  * `"rgb"`: an already coloured picture (used for `bandId: "composite"`). Only brightness/contrast are applied.
* `bandId` may also be the string `"composite"` (the "All bands" viewing mode). If you do not support composites, throw `unsupported`; the UI shows an inline message.
* **CORS:** to colourise the image the UI reads pixels through a canvas. If your image host sends no CORS headers (`Access-Control-Allow-Origin`), the browser blocks pixel access and the UI automatically **falls back to CSS brightness/contrast only** (no palette). Serve images with CORS, or proxy them, for the full experience.
* The UI requests `size` 160–256 px previews through `opts.size`. Honour it if you can (it is a hint).

### 3.8 ObservationMetadata  (`getObservationMetadata`)
```json
{
  "observationId": "demo:betelgeuse:v3",
  "fields": [
    { "key": "exposure", "value": 106, "unit": "s" },
    { "key": "pointing", "value": "05h 55m 10s  +07° 24′ 36″" },
    { "key": "processingLevel", "value": "L2" }
  ],
  "quality": [ { "code": "ok", "severity": "info" } ],
  "provenance": { "source": "spherex-irsa", "retrievedAt": "2026-11-14T13:40:07Z", "processingVersion": "2025.2" },
  "isSimulated": false
}
```
Shown in the Observation **Details** dialog. `fields` use the same `MetadataField` shape as targets, so any key works.

### 3.9 ComparisonResult  (`getComparisonResult`)
```json
{
  "observationA": "demo:barnard:v1",
  "observationB": "demo:barnard:v3",
  "bandId": 4,
  "differenceImageUrl": "https://…/diff.png",
  "width": 192, "height": 192,
  "summary": { "changedPixelFraction": 0.0149, "peakChange": 2.145, "significance": "moderate" },
  "candidates": [
    { "id": "c1", "label": { "en": "Possible moving source", "ar": "…" }, "pixel": { "x": 107, "y": 96 }, "changeType": "moved", "confidence": 0.7 }
  ],
  "notes": { "en": "This object moves across the sky.", "ar": "…" },
  "quality": [],
  "isSimulated": false
}
```
* `differenceImageUrl`: an already coloured image (the mock uses **gold = brighter in B, cyan = dimmer in B**). Pixel coordinates in `candidates[].pixel` refer to **this image's** `width × height` and are drawn as rings on the stage.
* `summary.significance`: `none | low | moderate | high`.
* `candidates` may be `[]`. `changeType`: `moved | brightened | dimmed`.
* The before/after pictures themselves come from `getObservationImage`, **not** from this result.

---

## 4. Provider functions

All are `async` (return a Promise). On failure **throw** `SX.DataError(code, message, { retryable? })`. Returning data means success.

| Function | Returns | Notes |
|---|---|---|
| `getWavelengthBands()` | `WavelengthBand[]` | Called once at start-up. If it fails the UI falls back to `SX.DEFAULT_BANDS` (6 bands, 0.75–5 µm). |
| `getFeaturedTargets()` | `Target[]` | The objects drawn as clickable rings on the map, shown as suggestions. A curated list (tens, not thousands). |
| `getTargetById(id)` | `Target` | Used to restore the last session. Throw `not-found` if unknown. |
| `searchTargets(query)` | `Target[]` | Name / alias / type search. Empty query = a few suggestions. `[]` = "no match". Throw `unsupported` for query kinds you do not support (the UI shows your message). |
| `getTargetsNear(ra, dec, radiusDeg)` | `Target[]` (nearest first, each may include `separationDeg`) | Used when the user enters coordinates or clicks empty sky. If a target is within `max(0.5°, 0.6 × angularSizeDeg)` the UI treats the coordinates *as that object*; otherwise it shows a "sky position" and the nearest object. The UI asks for radius 90°; any radius you can honour is fine. |
| `getObservations(ra, dec, fieldOfView)` | `Observation[]` | Observations covering that position. `fieldOfView` (degrees) is the current map width, clamped to 0.5–60; use it or ignore it. **`[]` means "no observations here"** and is shown as a friendly empty state, not an error. Order does not matter (sorted by `startTime`). |
| `getObservationImage(observationId, band, opts)` | `ObservationImage` | `band` is a band id **or** `"composite"`. `opts.size` is a hint. Throw `not-available` for planned/failed observations or missing bands. |
| `getObservationMetadata(observationId)` | `ObservationMetadata` | |
| `getComparisonResult(observationA, observationB, opts)` | `ComparisonResult` | `opts.bandId`. Both observations are guaranteed `observed` by the UI. Throw `unsupported` if they do not share a field. |
| `exportObservation(observationId, format)` | anything | *Optional.* The "Download data product" button calls it. Omit it, or throw `unsupported`, to show "not supported". |
| `describe()` | `{ name, simulated, version?, note? }` | *Optional.* Shown in Settings → Data and in the Advanced metrics. |
| `controls` | object | *Optional, demo only.* Present on the mock to power the "simulate a problem" controls. A real provider should **omit** it (the section then hides itself). |

### Example responses
See the JSON in [section 3](#3-data-contracts); those samples were captured from the running mock provider.

### Errors you can throw

```js
throw SX.DataError('network', 'Could not reach the SPHEREx service.');          // retryable by default
throw SX.DataError('not-available', 'Band 5 is missing for this visit.', { retryable: false });
```

| `code` | Meaning | What the user sees |
|---|---|---|
| `network` | Could not reach the service | "Connection problem", with **Try again** |
| `timeout` | Took too long (the service also aborts after 15 s) | "Taking too long", **Try again** |
| `invalid-coordinates` | RA/Dec out of range | Inline error in the coordinate form |
| `not-found` | Unknown id | "Not found" |
| `no-observations` | (alias for an empty result) | "No observations" |
| `not-available` | Exists but no data (planned, missing band, withheld) | "Not available" / "Planned: no image yet" / "Band missing" |
| `unsupported` | Operation not offered | "Not supported" with your message |
| `bad-response` | *Raised by the service layer* when your data breaks the contract | "Unexpected data" + exact field in the Data inspector |
| `unknown` | Anything else (any non-`DataError` exception) | "Something went wrong", **Try again** |

`retryable` controls whether **Try again** is shown (`false` hides it).

---

## 5. Loading, empty and error states (how the UI behaves)

`SX.data.*` always resolves (never rejects) to:

```js
{ status: 'ok' | 'empty' | 'error', data, error: DataError | null, meta: { fn, ms, cached? } }
```
* `empty` = the provider returned an **empty array** (zero search matches, zero observations).
* `error` = the provider threw (or timed out, or broke the contract).

State holders in `SX.app` (what views render from):

| State key | Shape | Set by |
|---|---|---|
| `featured` | `{ status: 'idle'\|'loading'\|'ok'\|'empty'\|'error', list, error }` | `ctrl.loadFeatured` |
| `obs` | `{ status: 'idle'\|'loading'\|'ok'\|'empty'\|'error', list, error }` | `ctrl.loadObservations` |
| `target`, `field` | selected object / inspected position | `ctrl.selectTarget`, `ctrl.goToField` |

| Situation | Where the user sees it |
|---|---|
| **Initial** (nothing selected) | Object panel "Choose something to explore" + suggestion chips; timeline "No object yet"; Observations / Comparison prompts |
| **Loading** | Spinner rows in map banner, timeline, object thumbnail, suggestion list, Observation cards (skeletons), Comparison overlay |
| **Success** | Normal UI |
| **Empty / no coverage** | Map banner + timeline + Observations: "No observations cover this region"; the map and object panel still work |
| **Missing image / band** | Thumbnail and cards show "Planned: no image yet" or "This band is missing"; Comparison overlay names the visit and band |
| **Invalid coordinates** | Per-field errors in the RA/Dec form (`aria-invalid`, announced); typed-in-search coordinates show a hint |
| **Unsupported operation** | Search with an unsupported query; "Download data product" |
| **Network error / timeout** | Red banner/panel with **Try again** in every place data is loaded |

**Reviewing these states without a backend:** Settings → *Data* (any level) → **Network speed** and **Simulate a problem** (network error, random failures, timeout, images unavailable, no observations anywhere). Examples that trigger real states with the mock: search `polaris` (no coverage), coordinates `30, 0` (empty field), search `obsid:1` (unsupported), band 5 of Betelgeuse visit 3 (missing band), visits 4–6 of every object (planned).

---

## 6. Which UI consumes which data

| Provider function | Stored in / flows through | Consumed by |
|---|---|---|
| `getWavelengthBands` | `SX.app.bands` → `ctrl.bands()` | View panel (wavelength slider range, band buttons, readouts), Observations (preview-band select), Comparison (band select), map strip |
| `getFeaturedTargets` | `SX.app.featured` | Map markers (`SkyMap.setTargets`), search suggestions, object-panel "Try one of these", Observations / Comparison empty-state chips, overview map, assistant |
| `getTargetById` | `ctrl.restore` | Restoring the last selected object after reload; assistant fallback |
| `searchTargets` | none (per keystroke) | Search box (`js/ui/searchbox.js`: suggestions, Enter), assistant "find *name*" |
| `getTargetsNear` | `ctrl.goToField` | Coordinate form, search-box coordinates, "Inspect this position" chip on empty-sky click |
| `getObservations` | `SX.app.obs` | Timeline + playback, object panel (availability, current visit), map banner, Observations list, Comparison pickers, advanced metrics |
| `getObservationImage` | `ctrl.fetchImage` (decoded + cached) | Object thumbnail, Observation cards, Comparison before/after |
| `getObservationMetadata` | none | Observation **Details** dialog |
| `getComparisonResult` | none | Comparison summary card, difference mode, candidate rings, raw-JSON (Advanced) |
| `exportObservation` | none | Details dialog button |

Files: `js/ui/explorer.js`, `observations.js`, `comparison.js`, `searchbox.js`, `assistant.js`; shared logic in `js/core/controller.js`.

---

## 7. Replacing the mock: step by step

**1. Create the provider** (`js/data/providers/spherex.js`):

```js
(function () {
  const SX = window.SX, DataError = SX.DataError;
  const BASE = 'https://your-backend.example/api';

  async function get(path) {
    let res;
    try { res = await fetch(BASE + path); }
    catch (e) { throw DataError('network', 'Could not reach the SPHEREx service.'); }
    if (res.status === 404) throw DataError('not-found', 'Not found.', { retryable: false });
    if (!res.ok) throw DataError('network', 'Service error ' + res.status + '.');
    return res.json();
  }

  SX.providers = SX.providers || {};
  SX.providers.spherex = {
    describe: () => ({ name: 'SPHEREx service', simulated: false, version: '1.0' }),
    getWavelengthBands: () => get('/bands'),
    getFeaturedTargets: () => get('/targets/featured'),
    getTargetById: (id) => get('/targets/' + encodeURIComponent(id)),
    searchTargets: (q) => get('/targets?q=' + encodeURIComponent(q)),
    getTargetsNear: (ra, dec, r) => get(`/targets/near?ra=${ra}&dec=${dec}&radius=${r}`),
    getObservations: (ra, dec, fov) => get(`/observations?ra=${ra}&dec=${dec}&fov=${fov}`),
    getObservationImage: (id, band, opts) => get(`/observations/${encodeURIComponent(id)}/image?band=${band}&size=${(opts && opts.size) || 192}`),
    getObservationMetadata: (id) => get(`/observations/${encodeURIComponent(id)}/metadata`),
    getComparisonResult: (a, b, opts) => get(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&band=${(opts && opts.bandId) || 4}`)
  };
})();
```
(The endpoint design is yours; this only shows the shape of the code. Adapt your backend's field names to the contracts **inside the provider**, so the UI never needs to know.)

**2. Register it.** In `index.html`, add the script before `js/app.js`. In `js/app.js` change `provider: SX.mock.provider` to `provider: SX.providers.spherex`.

**3. Verify.** Open Settings (Advanced level) → *Data inspector*. Each row shows the function, arguments, `ok / empty / error`, the error code and the duration. A shape problem reads like `bad-response: target[3].coordinates.ra must be a number in 0..360`.

**4. Clean up (optional).** Delete `js/data/mock/` and the three `<script>` tags for `catalog.js`, `sim.js`, `provider.js`. Nothing else depends on them. The "Simulate a problem" controls disappear automatically because your provider has no `controls`.

**Things to decide on the data side**
* **IDs** are opaque; pick anything stable. Observation ids must be accepted back by `getObservationImage`, `getObservationMetadata` and `getComparisonResult`.
* **Language:** return `LocalizedText` objects for Arabic names/descriptions if you have them; English strings work today.
* **Cancellation:** the UI ignores stale results itself (a newer selection wins). You do not need to implement abort.
* **Speed:** thumbnails are requested at 160–256 px; the Observations page requests up to 6 at once.

---

## 8. The sky backdrop

The star map's background (random stars, Milky Way band, dust) lives in `js/engine/backdrop.js` and is wired by `SX.config.backdrop` in `app.js`. It is decoration only and independent of the provider. To use something else, provide an object with:

```js
{
  getStars():        [{ ra, dec, mag, t }],   // t: 0 = hot/blue … 1 = cool/red
  getGalacticPlane(): [{ ra, dec }],           // polyline for the Milky Way band
  getDustBlobs():     [{ ra, dec, r, a }]      // soft patches; r degrees, a 0..1
}
```
A true survey tile layer (HiPS, etc.) would replace `js/engine/skymap.js` drawing code; that is a larger, optional task. The projection, hit-testing, gestures and keyboard control are separate from the drawing and can be kept.

---

## 9. Architecture and design decisions (short)

* **Keep the Style 2 stack.** The prototype was plain HTML/CSS/JS, so the final app is too. There is no build step and no framework. Modules are IIFEs sharing a single `SX` namespace and load order is explicit in `index.html`.
* **Three layers between UI and data** (`ctrl` → `SX.data` → provider). The provider is the only thing a data engineer writes; the controller holds the interaction rules once; the service guarantees uniform states and early contract errors.
* **Contracts instead of components.** The UI depends on documented shapes, not on how the mock fabricates data. The mock's helper fields (`demo`, simulated frames) stay inside `js/data/mock/`.
* **Experience levels hide controls, they do not lock features.** `data-min="intermediate|advanced"` / `data-only="beginner"` attributes plus one CSS rule per level; nothing is removed from the DOM logic, and the level can change at any time.
* **Accessibility first-class.** Native form controls (radio cards, switches are real checkboxes), roving focus in the timeline, focus traps in dialogs, live-region announcements, visible `:focus-visible` outlines, `prefers-reduced-motion` honoured and overridable, high-contrast and large-text modes, rem-based sizes.
* **i18n/RTL by construction.** Flat dictionaries (`js/i18n/en.js`, `ar.js`), `data-i18n` attributes, CSS logical properties so the layout mirrors with `dir="rtl"`. Deliberately **not** mirrored: the sky map, the timeline and the before/after slider (time and image comparison are spatial), coordinates and numbers (always LTR, Latin digits for scientific values).
* **The sky stays dark in the light theme.** It is a night-sky viewer, like most astronomy tools; the surrounding chrome (rail, cards, forms) follows the theme tokens in `css/tokens.css`.
* **Honesty labels.** "Demonstration data" appears on the map, comparison images, object and dialog text. Nothing simulated is presented as a NASA measurement.
* **Adaptive, not shrunk.** Desktop: rail + map + cards + timeline. Tablet landscape: docked tabbed panel. Tablet portrait/phone: full-screen map with a draggable bottom sheet and (phone) a bottom tab bar, safe-area aware.

---

## 10. Developer tools

```bash
node tools/check-i18n.mjs     # every translation key used exists in English AND Arabic
node tools/test-core.mjs      # coordinate parsing/validation + contract validators (no dependencies)
node tools/check-contrast.mjs # WCAG contrast of every colour-token pair in all themes
```
Serve the folder with any static server (for example `npx serve .`) and open `index.html`. State and preferences are in `localStorage` (`sx.prefs.v1`, `sx.session.v1`, `sx.hint.v1`). Settings → *Reset everything* clears them.

Handy in the browser console: `SX.data.getLog()` (recent calls), `SX.app.get()` (state), `SX.mock.controls.failure = 'network'` (force errors).
