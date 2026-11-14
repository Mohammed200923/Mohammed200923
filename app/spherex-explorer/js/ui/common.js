/* Shared UI building blocks: toasts, live announcements, state panels (loading / empty / error / initial /
   unsupported), option cards, quality chips, metadata formatting, dialogs.                                  */
(function () {
  const SX = window.SX, $ = SX.$, esc = SX.esc, t = function (k, p) { return SX.i18n.t(k, p); };
  const U = (SX.ui = SX.ui || {});

  /* ---------- announcements + toasts ---------- */
  U.announce = function (msg) {
    const el = $('#live'); if (!el) return;
    el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 30);
  };
  U.toast = function (msg, kind) {
    const box = $('#toasts'); if (!box) return;
    const ob = $('#onboard'); if (ob && !ob.hidden) return;
    const n = document.createElement('div');
    n.className = 'toast' + (kind ? ' ' + kind : ''); n.textContent = msg;
    box.appendChild(n);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { n.classList.add('out'); setTimeout(function () { n.remove(); }, 300); }, 3200);
  };

  /* ---------- names, labels, formatting ---------- */
  U.name = function (target) { return SX.i18n.text(target.name); };
  U.typeLabel = function (target) {
    if (target.typeLabel) return SX.i18n.text(target.typeLabel);
    const k = 'cls.' + target.classification; return SX.i18n.has(k) ? t(k) : target.classification;
  };
  U.constellation = function (c) { if (!c) return ''; const k = 'const.' + c; return SX.i18n.has(k) ? t(k) : c; };

  U.metaLabel = function (f) {
    const k = 'meta.' + f.key;
    if (SX.i18n.has(k)) return t(k);
    return f.label ? SX.i18n.text(f.label) : f.key;
  };
  U.fmtMeta = function (f) {
    const v = f.value, I = SX.i18n;
    if (v == null || v === '') return '—';
    switch (f.key) {
      case 'distance': return v >= 1e6 ? I.num(v / 1e6, { maximumFractionDigits: 1 }) + ' ' + t('unit.millionLy') : I.num(v) + ' ' + t('unit.ly');
      case 'angularSize': return v < 1 ? I.num(v * 60, { maximumFractionDigits: 1 }) + '′' : I.num(v, { maximumFractionDigits: 1 }) + '°';
      case 'temperature': return I.num(v) + ' K';
      case 'apparentMagnitude': return I.num(v, { maximumFractionDigits: 1 });
      case 'startTime': return I.date(v);
      case 'status': return U.statusLabel(v);
      case 'visit': return '#' + v;
      default: return (typeof v === 'number' ? I.num(v) : String(v)) + (f.unit ? ' ' + (SX.i18n.has('unit.' + f.unit) ? t('unit.' + f.unit) : f.unit) : '');
    }
  };
  U.statusLabel = function (s) { const k = 'obs.status.' + s; return SX.i18n.has(k) ? t(k) : s; };
  U.availabilityLabel = function (a) { return t('avail.' + (a || 'unknown')); };

  /* Quality flag chip. */
  U.flagLabel = function (f) { const k = 'q.' + f.code; return SX.i18n.has(k) ? t(k) : f.code; };
  U.flags = function (list) {
    return (list || []).map(function (f) {
      const ic = f.severity === 'warning' ? 'warn' : f.severity === 'error' ? 'alert' : f.code === 'ok' ? 'check' : 'info';
      return '<span class="flag ' + esc(f.severity || 'info') + '"' + (f.detail ? ' title="' + esc(f.detail) + '"' : '') + '>' + SX.icon(ic) + esc(U.flagLabel(f)) + '</span>';
    }).join('');
  };
  U.statusBadge = function (s) { return '<span class="badge st-' + esc(s) + '">' + esc(U.statusLabel(s)) + '</span>'; };

  /* ---------- state panels ---------- */
  /* kinds: loading | empty | error | initial | unsupported | notice.  opts: {title, text, error, retry, actions:[{label, onClick, solid}], compact} */
  U.errorCopy = function (err) {
    const code = err && err.code ? err.code : 'unknown';
    const tk = 'err.' + code + '.title', xk = 'err.' + code + '.text';
    return { title: SX.i18n.has(tk) ? t(tk) : t('err.unknown.title'), text: SX.i18n.has(xk) ? t(xk) : t('err.unknown.text'), detail: err && err.message };
  };
  U.stateEl = function (kind, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'state state-' + kind + (opts.compact ? ' compact' : '');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    let title = opts.title, text = opts.text, detail = '';
    if (kind === 'error' && opts.error) { const c = U.errorCopy(opts.error); title = title || c.title; text = text || c.text; detail = c.detail; }
    const icon = { loading: null, empty: 'search', error: 'warn', initial: 'sparkle', unsupported: 'info', notice: 'info' }[kind];
    let h = '';
    if (kind === 'loading') h += '<span class="spinner" aria-hidden="true"></span>'; else if (icon) h += '<span class="state-ic">' + SX.icon(icon) + '</span>';
    h += '<div class="state-body">';
    if (title) h += '<p class="state-title">' + esc(title) + '</p>';
    if (text) h += '<p class="state-text">' + esc(text) + '</p>';
    if (detail && kind === 'error') h += '<p class="state-detail ltr">' + esc(detail) + '</p>';
    h += '</div>';
    el.innerHTML = h;
    const acts = (opts.actions || []).slice();
    if (kind === 'error' && opts.retry && (!opts.error || opts.error.retryable !== false)) acts.unshift({ label: t('state.retry'), onClick: opts.retry, solid: true, icon: 'retry' });
    if (acts.length) {
      const row = document.createElement('div'); row.className = 'state-actions';
      acts.forEach(function (a) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (a.solid ? ' solid' : '') + ' sm';
        b.innerHTML = (a.icon ? SX.icon(a.icon) : '') + '<span>' + esc(a.label) + '</span>'; b.addEventListener('click', a.onClick); row.appendChild(b);
      });
      el.appendChild(row);
    }
    return el;
  };
  U.renderState = function (container, kind, opts) {
    container.hidden = false; container.innerHTML = ''; container.appendChild(U.stateEl(kind, opts));
  };
  U.clearState = function (container) { container.innerHTML = ''; container.hidden = true; };
  U.loadingText = function (key) { return { text: t(key || 'state.loading'), compact: true }; };

  /* ---------- option cards (radio group styled as cards) ---------- */
  /* cfg: { name, label (aria), options:[{value, label, desc, icon, swatch}], get(), onChange(value) } */
  U.optionCards = function (root, cfg) {
    function build() {
      root.innerHTML = '';
      root.setAttribute('role', 'radiogroup'); root.setAttribute('aria-label', cfg.label ? t(cfg.label) : '');
      root.classList.add('opts');
      cfg.options.forEach(function (o) {
        const id = SX.uid('opt');
        const l = document.createElement('label'); l.className = 'opt'; l.setAttribute('for', id);
        l.innerHTML = '<input type="radio" id="' + id + '" name="' + cfg.name + '" value="' + esc(o.value) + '">' +
          '<span class="opt-body">' + (o.icon ? '<span class="opt-ic">' + SX.icon(o.icon) + '</span>' : '') + (o.swatch ? '<span class="opt-sw" style="background:' + o.swatch + '"></span>' : '') +
          '<span class="opt-text"><b' + (o.raw ? ' lang="' + o.value + '"' : '') + '>' + esc(o.raw || t(o.label)) + '</b>' + (o.desc ? '<small>' + esc(t(o.desc)) + '</small>' : '') + '</span><span class="opt-check">' + SX.icon('check') + '</span></span>';
        root.appendChild(l);
        l.querySelector('input').addEventListener('change', function () { cfg.onChange(o.value); });
      });
      sync();
    }
    function sync() { const v = cfg.get(); Array.from(root.querySelectorAll('input')).forEach(function (i) { i.checked = i.value === String(v); }); }
    build();
    return { sync: sync, rebuild: build };
  };

  /* ---------- dialogs ---------- */
  const open = [];
  U.openDialog = function (el, opts) {
    opts = opts || {};
    el.hidden = false; document.documentElement.classList.add('modal-open');
    const release = SX.trapFocus(el, { onEscape: function () { if (opts.closable !== false) U.closeDialog(el); } });
    el._release = release; el._onClose = opts.onClose; open.push(el);
    const first = opts.focus ? $(opts.focus, el) : SX.focusables(el)[0];
    if (first) first.focus({ preventScroll: true });
  };
  U.closeDialog = function (el) {
    if (el.hidden) return;
    el.hidden = true;
    const i = open.indexOf(el); if (i >= 0) open.splice(i, 1);
    if (!open.length) document.documentElement.classList.remove('modal-open');
    if (el._release) { el._release(); el._release = null; }
    if (el._onClose) el._onClose();
  };
  U.anyDialogOpen = function () { return open.length > 0; };

  /* Small helper: set text of element if it exists. */
  U.setText = function (sel, txt) { const e = typeof sel === 'string' ? $(sel) : sel; if (e) e.textContent = txt; };
})();
