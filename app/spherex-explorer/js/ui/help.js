/* Help view: glossary (the quick-start, shortcuts and demo notice are static markup translated by data-i18n). */
(function () {
  const SX = window.SX, esc = SX.esc, $ = SX.$, t = function (k, p) { return SX.i18n.t(k, p); };
  const H = (SX.help = {});
  const TERMS = ['ra', 'dec', 'infrared', 'wavelength', 'band', 'fov', 'observation', 'difference', 'browndwarf', 'nebula', 'lightyear', 'redshift'];

  function render() {
    $('#glossary').innerHTML = TERMS.map(function (id) {
      return '<details class="gl"><summary>' + esc(t('gloss.' + id + '.t')) + '</summary><p>' + esc(t('gloss.' + id + '.d')) + '</p></details>';
    }).join('');
  }
  H.init = function () { render(); SX.bus.on('lang', render); };
})();
