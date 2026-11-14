/* Comparison widget: before/after slider, side by side, difference image, blink.
   It only displays canvases. The caller paints canvases `ca` (before), `cb` (after), `cd` (difference)
   using SX.render.paint(). Styles live in css/components.css (.cmp-*).                                  */
(function () {
  const SX = window.SX, clamp = SX.clamp;

  function Compare(root, opts) {
    opts = opts || {};
    this.root = root; this.mode = 'slider'; this.pos = 0.5; this.blinkOn = false; this.blinkPaused = false; this._timer = null;
    this.t = opts.t || function (k) { return k; };
    root.innerHTML =
      '<div class="cmp-stage" data-mode="slider" tabindex="-1">' +
      '<canvas class="cmp-a" aria-hidden="true"></canvas>' +
      '<div class="cmp-clip"><canvas class="cmp-b" aria-hidden="true"></canvas></div>' +
      '<canvas class="cmp-d" aria-hidden="true"></canvas>' +
      '<div class="cmp-markers" aria-hidden="true"></div>' +
      '<div class="cmp-handle" dir="ltr" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><span></span></div>' +
      '<span class="cmp-tag cmp-tag-a"></span><span class="cmp-tag cmp-tag-b"></span>' +
      '<span class="cmp-sim"></span>' +
      '<button type="button" class="cmp-blinkbtn" hidden></button>' +
      '</div>';
    const q = function (s) { return root.querySelector(s); };
    this.stage = q('.cmp-stage'); this.ca = q('.cmp-a'); this.cb = q('.cmp-b'); this.cd = q('.cmp-d');
    this.clip = q('.cmp-clip'); this.handle = q('.cmp-handle'); this.markers = q('.cmp-markers');
    this.tagA = q('.cmp-tag-a'); this.tagB = q('.cmp-tag-b'); this.sim = q('.cmp-sim'); this.blinkBtn = q('.cmp-blinkbtn');
    const self = this; let drag = false;
    const mv = function (e) { const r = self.stage.getBoundingClientRect(); self.setPos((e.clientX - r.left) / r.width); };
    this.stage.addEventListener('pointerdown', function (e) {
      if (self.mode !== 'slider' || e.target.closest('.cmp-blinkbtn')) return;
      drag = true; self.stage.setPointerCapture(e.pointerId); mv(e);
    });
    this.stage.addEventListener('pointermove', function (e) { if (drag) mv(e); });
    this.stage.addEventListener('pointerup', function () { drag = false; });
    this.stage.addEventListener('pointercancel', function () { drag = false; });
    this.handle.addEventListener('keydown', function (e) {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowDown') { self.setPos(self.pos - 0.05); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'ArrowUp') { self.setPos(self.pos + 0.05); e.preventDefault(); }
      else if (k === 'Home') { self.setPos(0.02); e.preventDefault(); }
      else if (k === 'End') { self.setPos(0.98); e.preventDefault(); }
    });
    this.blinkBtn.addEventListener('click', function () { self.blinkPaused = !self.blinkPaused; self._syncBlinkBtn(); });
    this.stage.addEventListener('click', function (e) { if (self.mode === 'blink' && self.blinkPaused && !e.target.closest('.cmp-blinkbtn')) self._blinkFlip(); });
    this.setPos(0.5);
  }
  SX.Compare = Compare;
  const P = Compare.prototype;

  P.setPos = function (p) {
    this.pos = clamp(p, 0.02, 0.98);
    if (this.mode === 'slider') this.clip.style.clipPath = 'inset(0 0 0 ' + (this.pos * 100) + '%)';
    this.handle.style.left = (this.pos * 100) + '%';
    this.handle.setAttribute('aria-valuenow', Math.round(this.pos * 100));
    this.handle.setAttribute('aria-valuetext', Math.round(this.pos * 100) + '%');
  };
  P.setLabels = function (a, b, simText, sliderLabel) {
    this.tagA.textContent = a; this.tagB.textContent = b; this.sim.textContent = simText || '';
    if (sliderLabel) this.handle.setAttribute('aria-label', sliderLabel);
  };
  P.setMarkers = function (list, size) {
    this.markers.innerHTML = (list || []).map(function (m) {
      return '<i style="left:' + (m.x / size * 100) + '%;top:' + (m.y / size * 100) + '%" title="' + SX.esc(m.label || '') + '"></i>';
    }).join('');
  };
  P._syncBlinkBtn = function () {
    this.blinkBtn.hidden = this.mode !== 'blink';
    this.blinkBtn.setAttribute('aria-pressed', String(this.blinkPaused));
    this.blinkBtn.textContent = this.blinkPaused ? this.t('cmp.blinkResume') : this.t('cmp.blinkPause');
  };
  P._blinkFlip = function () { this.blinkOn = !this.blinkOn; this.clip.style.clipPath = this.blinkOn ? 'inset(0)' : 'inset(0 0 0 100%)'; this.tagA.style.opacity = this.blinkOn ? 0.35 : 1; this.tagB.style.opacity = this.blinkOn ? 1 : 0.35; };
  P.setMode = function (m) {
    this.mode = m; this.stage.dataset.mode = m;
    clearInterval(this._timer); this._timer = null;
    this.tagA.style.opacity = 1; this.tagB.style.opacity = 1;
    this.handle.hidden = m !== 'slider';
    if (m === 'slider') this.setPos(this.pos);
    else if (m === 'side') this.clip.style.clipPath = 'none';
    else if (m === 'diff') this.clip.style.clipPath = 'inset(0 0 0 100%)';
    else if (m === 'blink') {
      this.blinkOn = false; this.blinkPaused = SX.motionReduced(); this._blinkFlip();
      const self = this;
      this._timer = setInterval(function () { if (!self.blinkPaused && !SX.motionReduced()) self._blinkFlip(); }, 900);
    }
    this._syncBlinkBtn();
  };
  P.destroy = function () { clearInterval(this._timer); };
})();
