/* Boot sequence. This is the only place that picks the data provider.
   To connect real data: implement the provider contract (see FRONTEND_INTEGRATION.md), then replace
   `SX.mock.provider` below with your provider (and optionally the backdrop with a real sky layer).     */
(function () {
  const SX = window.SX;

  /* ---- 1. wiring: provider + map backdrop ---- */
  SX.config = {
    provider: (SX.providers && SX.providers.skyshift) || SX.mock.provider,   // real NASA data (SkyShift) when loaded
    backdrop: SX.proceduralBackdrop        // <- swap for a real sky-survey layer (or keep the procedural stars)
  };
  SX.data.use(SX.config.provider);

  /* ---- 2. first-run defaults ---- */
  if (!SX.prefs.hasSaved() && /^ar/i.test(navigator.language || '')) SX.prefs.set({ lang: 'ar' });

  /* ---- 3. UI ---- */
  SX.shell.init();
  SX.explorer.init();
  SX.observations.init();
  SX.comparison.init();
  SX.help.init();
  SX.settings.init();
  SX.assistant.init();
  SX.onboarding.init();
  SX.shell.init = null;

  /* ---- 4. data bootstrap (never blocks the UI; failures show as states) ---- */
  SX.ctrl.loadBands();
  SX.ctrl.loadFeatured().then(function () { return SX.ctrl.restore(); });

  if (!SX.prefs.get('onboarded')) SX.onboarding.open();
})();
