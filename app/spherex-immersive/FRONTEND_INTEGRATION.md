# Integration guide: connecting real data, stories and the assistant

For the teammate connecting SPHEREx data, and whoever writes the Star Stories text. You do not need to touch UI code.

There are **three** seams:

1. **Data provider**: observations, images, metadata, comparison results (same contract as the Style 2 app).
2. **Assistant adapter**: answers for the guide panel.
3. **Editorial content**: Star Stories text.

---

## 1. Data provider

This app uses the **same data layer and contract** as `../spherex-explorer`. Read `../spherex-explorer/FRONTEND_INTEGRATION.md` (sections 3 to 7) for the exact shapes of `Target`, `Observation`, `ObservationImage`, `ObservationMetadata`, `ComparisonResult`, the provider functions and the error codes. Nothing in that contract changed.

Wiring is one line in `js/main.js`:

```js
const provider = buildProvider(SX.mock.provider);   // <- replace SX.mock.provider with your provider
SX.data.use(provider);
```

* Your provider is a plain object implementing `getWavelengthBands`, `getFeaturedTargets`, `getTargetById`, `searchTargets`, `getTargetsNear`, `getObservations`, `getObservationImage`, `getObservationMetadata`, `getComparisonResult`, optional `exportObservation`, `describe`.
* Return data, or **throw `SX.DataError(code, message)`**. `SX.data` turns that into `ok | empty | error`; every screen already has loading, empty, error and unsupported states.
* Set `isSimulated: false` on real data. All "Demonstration data" chips disappear automatically.
* `js/data/provider.js` (`buildProvider`) wraps the provider to add two flagged demo targets (RW Aurigae, R Draconis) needed by the stories. If your provider already returns targets with ids `rwaur` and `rdra`, set `USE_EXTRAS = false` in that file and pass your provider straight through. Story ids must match target ids.
* Settings, advanced level, **Data inspector** lists every provider call with timing and result; a wrong shape shows as `bad-response` naming the field.
* What each screen calls:

| Screen | Calls |
|---|---|
| Sky markers, search suggestions, sky chart | `getFeaturedTargets` |
| Search | `searchTargets`, `getTargetsNear` (to resolve typed coordinates) |
| Timeline, info panel | `getObservations(ra, dec, fov)` |
| Viewer (single, slider, side, blink) | `getObservationImage(id, band, {size})` |
| Viewer (difference), info "Existing analysis results", guide | `getComparisonResult(a, b, {bandId})` |
| Viewer details, info "Observation metadata" | `getObservationMetadata` |
| "Download data product" | `exportObservation` (optional) |
| Star Stories, chapter 5 | `getObservations` + `getObservationImage` |

The decorative sky (`js/sky/skyscene.js`) takes no data except the target list for the markers. To replace the procedural stars with a real catalogue later, change `buildStars()` only.

---

## 2. Assistant adapter

The guide panel calls `window.SXI.assistant.ask(request)`. Today that is the template demo in `js/data/assistant-demo.js`. To connect a real service, set it **before** `main.js` finishes booting, or replace the line in `main.js`:

```js
window.SXI.assistant = { ask: async (request) => reply };
```

### Request

```jsonc
{
  "question": "What changed between these images?",   // user text (localised)
  "intent": "q.changed",                                // present when a suggestion chip was used; otherwise absent
  "previous": { /* the previous reply, for "explain more simply" */ },
  "context": {
    "target": { /* Target or null */ },
    "position": { "ra": 269.45, "dec": 4.69 },
    "view": { "ra": 269.45, "dec": 4.69, "fov": 12, "roll": 0 },
    "viewer": { "open": true, "mode": "slider", "a": { /* Observation */ }, "b": { /* Observation */ }, "band": "composite", "palette": "natural" },
    "level": "beginner | intermediate | advanced",
    "language": "en | ar"
  }
}
```

### Reply

```jsonc
{
  "status": "ok | unsupported | error",
  "provenance": "demo | model | analysis",      // shown on every answer
  "text": "plain string in the user's language",
  "simple": "optional shorter text used by 'explain more simply'",
  "blocks": [
    { "type": "highlight",  "regions": [ { "label": "Possible moving source", "pixel": { "x": 107, "y": 96 }, "observationA": "id", "observationB": "id" } ] },
    { "type": "evidence",   "items": [ { "kind": "observation | target | analysis | position", "label": "2026-06-08", "ref": 2, "disabled": false } ] },
    { "type": "confidence", "value": 0.7, "uncertainty": "Differences can also come from noise…", "quality": [ { "code": "low-snr", "severity": "warning" } ] },
    { "type": "prediction", "observed": "…", "extrapolated": { "validated": false, "text": "…", "modelId": "optional" }, "speculative": "…" },
    { "type": "action",     "action": "diff | compare | timeline | ir", "label": "Difference" },
    { "type": "note",       "text": "small print" }
  ]
}
```

Rules the UI enforces and your adapter should respect:

* `evidence.ref` for `observation` is the **index** into the current observation list (the UI sorts it by `startTime`).
* Show a prediction only with `extrapolated.validated: true` **and** a validated model. Otherwise return `status: "unsupported"`. The UI always renders observed / model-based / speculative as separate, labelled tiers.
* `confidence.value` may be `null` ("no confidence value available"). Always provide `uncertainty` text.
* Throwing (or a rejected promise) shows the error state with **Try again**.
* Keep `provenance: "demo"` for anything that is not real. The panel also carries a permanent "Demo answers" badge until you change it in `js/ui/assistant.js` (`as.demo_badge`).

---

## 3. Star Stories content

Text lives in `js/data/editorial.js` (`STORIES`), keyed by **target id**. All current text is **draft** and says so on screen.

```js
rwaur: {
  targetId: 'rwaur', status: 'draft',        // set 'verified' when the science team signs off
  scene: 'variable',                          // artwork: motion | cold | variable | longperiod
  theme: { accent: '#ff7a59', accent2: '#ffd84d', bg: ['#14070a', '#2d0f1c'], tone: 'drama' },
  chapters: [ { id, title: {en, ar}, body: {en, ar}, interactive: 'motion|cold|variable|longperiod|obs|go' }, … ]   // 6 chapters
}
```

* Chapters: meet, discovery, characteristics, what makes it interesting, what NASA observes (`obs`), explore it yourself (`go`).
* Write measured values only from verified sources; put them in the chapter text or, better, in the provider's `Target.metadata` (shown under **More detail** in chapter 3 with the provider's provenance chip).
* Interactive diagrams are **illustrations** (labelled). If you add a real light curve or proper-motion track, add a new `interactive` type and mark it with the provider's provenance, not "Illustration".
* Objects without an entry get a neutral generic story built only from provider data and "awaiting verified content" slots.
* Arabic needs native review.

---

## Other notes

* **Languages**: add keys to both `js/core/lang-en.js` and `lang-ar.js`; `node tools/check-i18n.mjs` fails if either is missing a key the code uses.
* **Quality flag codes, metadata keys**: unknown codes/keys are shown verbatim. Add `q.<code>` / `meta.<key>` strings to translate them.
* **Persistence**: preferences only (`localStorage` key `sxi.prefs.v1`). Nothing user-specific is sent anywhere.
* **Shared files**: this app loads `../spherex-explorer/js/{core/util,core/coords,data/contracts,engine/render,data/service,data/mock/*}.js`. If the Style 2 folder is moved, update the `<script>` tags at the bottom of `index.html` and `tools/serve.mjs`.
