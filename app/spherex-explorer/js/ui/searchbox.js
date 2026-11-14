/* Search box used by Sky Explorer, Observations and Comparison.
   - Type a name -> SX.data.searchTargets() suggestions (loading / empty / error / unsupported states).
   - Type coordinates in the same box, or use the RA/Dec popover with per-field validation.
   Selection goes through SX.ctrl so every view stays in sync.                                        */
(function () {
  const SX = window.SX, U = SX.ui, esc = SX.esc, t = function (k, p) { return SX.i18n.t(k, p); };

  const EXAMPLES = [
    { key: 'coord.exOrion', ra: '83.82', dec: '-5.39' },
    { key: 'coord.exSexa', ra: '05h35m17s', dec: '-05d23m' },
    { key: 'coord.exEmpty', ra: '150', dec: '30' },
    { key: 'coord.exNone', ra: '30', dec: '0' }
  ];

  function SearchBox(root, opts) {
    opts = opts || {};
    const self = this; this.root = root; this.opts = opts;
    const id = SX.uid('sb');
    this.ids = { input: id + '-in', list: id + '-list', pop: id + '-pop', ra: id + '-ra', dec: id + '-dec', raErr: id + '-raerr', decErr: id + '-decerr' };
    root.classList.add('sbox'); if (opts.compact) root.classList.add('compact');
    root.innerHTML =
      '<form class="sbox-form" role="search" autocomplete="off">' +
      '<label class="sr" for="' + this.ids.input + '" data-i18n="search.label"></label>' +
      '<span class="sbox-ic">' + SX.icon('search') + '</span>' +
      '<input id="' + this.ids.input + '" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + this.ids.list + '" data-i18n-attr="placeholder:search.placeholder" enterkeyhint="search" dir="auto" spellcheck="false">' +
      (opts.shortcut ? '<kbd class="sbox-kbd" aria-hidden="true">/</kbd>' : '') +
      '<button type="button" class="sbox-coordbtn" aria-expanded="false" aria-controls="' + this.ids.pop + '">' + SX.icon('crosshair') + '<span data-i18n="coord.button"></span></button>' +
      '</form>' +
      '<ul class="sbox-list" id="' + this.ids.list + '" role="listbox" hidden></ul>' +
      '<div class="coordpop" id="' + this.ids.pop + '" role="group" aria-labelledby="' + this.ids.pop + '-t" hidden>' +
      '<form novalidate class="coordform">' +
      '<p class="coordpop-title" id="' + this.ids.pop + '-t" data-i18n="coord.title"></p>' +
      '<div class="cfield"><label for="' + this.ids.ra + '" data-i18n="coord.ra"></label><input id="' + this.ids.ra + '" class="ltr" dir="ltr" autocomplete="off" inputmode="text" data-i18n-attr="placeholder:coord.raPh" aria-describedby="' + this.ids.raErr + '"><p class="cerr" id="' + this.ids.raErr + '"></p></div>' +
      '<div class="cfield"><label for="' + this.ids.dec + '" data-i18n="coord.dec"></label><input id="' + this.ids.dec + '" class="ltr" dir="ltr" autocomplete="off" inputmode="text" data-i18n-attr="placeholder:coord.decPh" aria-describedby="' + this.ids.decErr + '"><p class="cerr" id="' + this.ids.decErr + '"></p></div>' +
      '<p class="coord-hint" data-i18n="coord.hint"></p>' +
      '<div class="coord-ex" role="group"><span data-i18n="coord.examples"></span></div>' +
      '<div class="coordpop-actions"><button type="submit" class="btn solid sm"><span data-i18n="coord.go"></span></button><button type="button" class="btn sm coord-cancel"><span data-i18n="coord.cancel"></span></button></div>' +
      '<div class="coord-status" role="status" aria-live="polite"></div>' +
      '</form></div>' +
      '<p class="sbox-msg" role="status" hidden></p>';
    SX.i18n.apply(root);

    this.input = root.querySelector('input[type=search]'); this.list = root.querySelector('.sbox-list');
    this.pop = root.querySelector('.coordpop'); this.msg = root.querySelector('.sbox-msg');
    this.coordBtn = root.querySelector('.sbox-coordbtn'); this.raIn = root.querySelector('#' + this.ids.ra); this.decIn = root.querySelector('#' + this.ids.dec);
    this.active = -1; this.token = 0; this.rows = [];
    this._buildExamples();
    SX.bus.on('lang', function () { self._buildExamples(); if (!self.list.hidden) self._showSuggestions(); });
    SX.app.subscribe(['featured'], function () { if (!self.list.hidden && !self.input.value.trim()) self._showSuggestions(); });

    const debounced = SX.debounce(function () { self._showSuggestions(); }, 220);
    this.input.addEventListener('input', function () { self._hideMsg(); self.active = -1; debounced(); });
    this.input.addEventListener('focus', function () { self._showSuggestions(); });
    this.input.addEventListener('keydown', function (e) { self._onKey(e); });
    root.querySelector('.sbox-form').addEventListener('submit', function (e) { e.preventDefault(); self._submit(); });
    document.addEventListener('click', function (e) { if (!root.contains(e.target)) { self._closeList(); } });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!self.pop.hidden) { self.closePopover(true); e.stopPropagation(); } else if (!self.list.hidden) { self._closeList(); e.stopPropagation(); } } });

    this.coordBtn.addEventListener('click', function () { self.pop.hidden ? self.openPopover() : self.closePopover(true); });
    root.querySelector('.coord-cancel').addEventListener('click', function () { self.closePopover(true); });
    root.querySelector('.coordform').addEventListener('submit', function (e) { e.preventDefault(); self._submitCoords(); });
    [this.raIn, this.decIn].forEach(function (i) { i.addEventListener('input', function () { self._clearErrors(); }); });
  }
  U.SearchBox = SearchBox;
  const P = SearchBox.prototype;

  P._buildExamples = function () {
    const box = this.root.querySelector('.coord-ex'), self = this;
    Array.from(box.querySelectorAll('button')).forEach(function (b) { b.remove(); });
    EXAMPLES.forEach(function (ex) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t(ex.key);
      b.addEventListener('click', function () { self.raIn.value = ex.ra; self.decIn.value = ex.dec; self._clearErrors(); self.raIn.focus(); });
      box.appendChild(b);
    });
  };

  /* ----- message line ----- */
  P._msg = function (text, kind) { this.msg.hidden = !text; this.msg.textContent = text || ''; this.msg.className = 'sbox-msg' + (kind ? ' ' + kind : ''); if (text) U.announce(text); };
  P._hideMsg = function () { this.msg.hidden = true; };

  /* ----- suggestions ----- */
  P._closeList = function () { this.list.hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant'); this.active = -1; };
  P._setRows = function (rows) {
    const self = this; this.rows = rows.filter(function (r) { return r.action; });
    this.list.innerHTML = ''; let ai = 0;
    rows.forEach(function (r) {
      const li = document.createElement('li');
      if (r.action) {
        li.setAttribute('role', 'option'); li.id = self.ids.list + '-o' + ai; li.dataset.i = ai; li.className = 'sbox-opt'; li.innerHTML = r.html;
        const idx = ai; li.addEventListener('mousedown', function (e) { e.preventDefault(); }); li.addEventListener('click', function () { self._activate(idx); }); ai++;
      } else { li.setAttribute('role', 'presentation'); li.className = 'sbox-info ' + (r.cls || ''); li.appendChild(r.node || document.createTextNode('')); if (r.html) li.innerHTML = r.html; }
      self.list.appendChild(li);
    });
    this.list.hidden = false; this.input.setAttribute('aria-expanded', 'true'); this.active = -1;
  };
  P._targetRow = function (tg) {
    return { action: function () { return tg; }, target: tg, html: '<span class="sbox-opt-name">' + esc(U.name(tg)) + '</span><small>' + esc(U.typeLabel(tg)) + '</small>' };
  };

  P._showSuggestions = async function () {
    const q = this.input.value.trim(), my = ++this.token, self = this;
    if (SX.coords.looksLikeCoords(q)) {
      const c = SX.coords.parseCombined(q);
      if (c.ok) this._setRows([{ action: true, coords: c, html: '<span class="sbox-opt-name ltr">' + SX.icon('crosshair') + esc(t('search.goCoords')) + ' RA ' + esc(SX.fmtRA(c.ra)) + ' · Dec ' + esc(SX.fmtDec(c.dec)) + '</span>' }]);
      else this._setRows([{ cls: 'warn', html: SX.icon('warn') + '<span>' + esc(t('search.notCoords')) + '</span>' }]);
      return;
    }
    if (!q) {
      const f = SX.app.get('featured');
      if (f.status === 'loading' || f.status === 'idle') { this._setRows([{ cls: 'loading', html: '<span class="spinner sm"></span><span>' + esc(t('state.loading')) + '</span>' }]); return; }
      if (f.status === 'error') { this._setRows([this._errorRow(f.error, function () { SX.ctrl.loadFeatured(); })]); return; }
      const rows = [{ cls: 'head', html: '<span>' + esc(t('search.suggestions')) + '</span>' }].concat(f.list.slice(0, 6).map(function (tg) { return self._targetRow(tg); }));
      this._setRows(rows); return;
    }
    this._setRows([{ cls: 'loading', html: '<span class="spinner sm"></span><span>' + esc(t('search.searching')) + '</span>' }]);
    const r = await SX.data.searchTargets(q);
    if (my !== this.token || document.activeElement !== this.input && this.list.hidden) return;
    if (r.status === 'ok') this._setRows(r.data.map(function (tg) { return self._targetRow(tg); }));
    else if (r.status === 'empty') this._setRows([{ cls: 'empty', html: SX.icon('search') + '<span>' + esc(t('search.noMatch', { q: q })) + '</span>' }, { cls: 'tip', html: '<span>' + esc(t('search.tryCoords')) + '</span>' }]);
    else this._setRows([this._errorRow(r.error, function () { self._showSuggestions(); })]);
  };
  P._errorRow = function (err, retry) {
    const c = U.errorCopy(err), node = document.createElement('div');
    node.className = 'sbox-err'; node.innerHTML = '<span class="sbox-err-t">' + SX.icon(err && err.code === 'unsupported' ? 'info' : 'warn') + esc(c.title) + '</span><small>' + esc(err && err.code === 'unsupported' ? err.message : c.text) + '</small>';
    if (!err || err.retryable !== false) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.innerHTML = SX.icon('retry') + '<span>' + esc(t('state.retry')) + '</span>'; b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('click', retry); node.appendChild(b); }
    return { node: node, cls: 'err' };
  };

  P._activate = function (i) {
    const row = this.rows[i]; if (!row) return;
    if (row.coords) { this._closeList(); this._goCoords(row.coords.ra, row.coords.dec); return; }
    const tg = row.action(); this._pick(tg);
  };
  P._pick = function (tg) {
    this._closeList(); this.input.value = U.name(tg); this._hideMsg();
    SX.ctrl.selectTarget(tg, { fly: true });
    U.announce(t('search.selected', { name: U.name(tg) }));
    if (this.opts.onPick) this.opts.onPick(tg);
    this.input.blur();
  };
  P._setActive = function (i) {
    const opts = Array.from(this.list.querySelectorAll('.sbox-opt'));
    if (!opts.length) return;
    this.active = (i + opts.length) % opts.length;
    opts.forEach(function (o, k) { o.setAttribute('aria-selected', k === this.active ? 'true' : 'false'); }, this);
    this.input.setAttribute('aria-activedescendant', opts[this.active].id); opts[this.active].scrollIntoView({ block: 'nearest' });
  };
  P._onKey = function (e) {
    if (e.key === 'ArrowDown') { if (this.list.hidden) this._showSuggestions(); else this._setActive(this.active + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { this._setActive(this.active - 1); e.preventDefault(); }
    else if (e.key === 'Enter' && this.active >= 0) { e.preventDefault(); this._activate(this.active); }
  };

  P._submit = async function () {
    const q = this.input.value.trim(); if (!q) { this.input.focus(); return; }
    if (SX.coords.looksLikeCoords(q)) {
      const c = SX.coords.parseCombined(q);
      if (!c.ok) { this._msg(t('search.notCoords'), 'warn'); this.openPopover(); return; }
      this._closeList(); this._goCoords(c.ra, c.dec); return;
    }
    this._closeList(); this._msg(t('search.searching'));
    const r = await SX.data.searchTargets(q);
    if (r.status === 'ok') { this._pick(r.data[0]); }
    else if (r.status === 'empty') this._msg(t('search.noMatchLong', { q: q }), 'warn');
    else this._msg(r.error.code === 'unsupported' ? r.error.message : U.errorCopy(r.error).title + '. ' + U.errorCopy(r.error).text, 'error');
  };

  /* ----- coordinates ----- */
  P.openPopover = function () {
    this._closeList(); this.pop.hidden = false; this.coordBtn.setAttribute('aria-expanded', 'true'); this._clearErrors();
    this.raIn.focus();
  };
  P.closePopover = function (refocus) { this.pop.hidden = true; this.coordBtn.setAttribute('aria-expanded', 'false'); if (refocus) this.coordBtn.focus(); };
  P._clearErrors = function () {
    ['ra', 'dec'].forEach(function (k) { const inp = this[k + 'In'], er = this.root.querySelector('#' + this.ids[k + 'Err']); inp.removeAttribute('aria-invalid'); er.textContent = ''; }, this);
    this.root.querySelector('.coord-status').textContent = '';
  };
  P._submitCoords = async function () {
    this._clearErrors();
    const r = SX.coords.parse(this.raIn.value, this.decIn.value);
    if (!r.ok) {
      let first = null;
      ['ra', 'dec'].forEach(function (k) {
        if (!r.errors[k]) return;
        const inp = this[k + 'In'], er = this.root.querySelector('#' + this.ids[k + 'Err']);
        inp.setAttribute('aria-invalid', 'true'); er.textContent = t('coord.err.' + r.errors[k] + (k === 'ra' ? '.ra' : '.dec')); if (!first) first = inp;
      }, this);
      first.focus(); U.announce(t('coord.invalid')); return;
    }
    const status = this.root.querySelector('.coord-status'), btn = this.root.querySelector('.coordform button[type=submit]');
    status.textContent = t('coord.checking'); btn.disabled = true;
    const res = await this._goCoords(r.ra, r.dec, true);
    btn.disabled = false;
    if (res && res.ok) { status.textContent = ''; this.closePopover(false); }
    else if (res && res.error) { status.textContent = U.errorCopy(res.error).title + '. ' + res.error.message; }
  };
  P._goCoords = async function (ra, dec, fromPop) {
    const res = await SX.ctrl.goToField(ra, dec);
    if (!res.ok) { if (!fromPop) this._msg(res.error.message, 'error'); return res; }
    if (res.stale) return res;
    if (res.target) this._msg(t('coord.on', { name: U.name(res.target) }));
    else if (res.lookup) this._msg(t('coord.customLookupFailed'), 'warn');
    else this._msg(t('coord.custom'));
    if (res.target) this.input.value = U.name(res.target);
    if (this.opts.onPick) this.opts.onPick(res.target || null);
    return res;
  };

  P.focus = function () { this.input.focus(); this.input.select(); };
})();
