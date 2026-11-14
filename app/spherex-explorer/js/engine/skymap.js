/* Canvas star map (stereographic projection, pan / zoom / pinch / keyboard).
   Presentational only: it draws whatever `backdrop` and `targets` it is given.
   The backdrop (procedural stars) is a placeholder for a real sky-survey tile layer.
   View state is {ra, dec, fov} where fov is the visible width in degrees.              */
(function () {
  const SX = window.SX, DEG = SX.DEG, clamp = SX.clamp, lerp = SX.lerp, R = SX.render;

  const DEFAULT_THEME = {
    bgInner: '#0b1f1b', bgOuter: '#030706', grid: 'rgba(120,255,214,.10)', gridLabel: 'rgba(190,240,225,.45)',
    label: 'rgba(235,250,244,.88)', labelFont: '600 12px Manrope, "IBM Plex Sans Arabic", system-ui, sans-serif',
    accent: '#38f2c2', ring: '#f4fff9', footprint: 'rgba(255,216,77,.95)', marker: '#ffd84d', vignette: 0.45
  };
  const BAND_TINT = { natural: '150,205,190', emerald: '40,230,175', aurum: '255,205,80', ice: '90,190,255', dust: '230,90,170', mono: '170,190,200' };

  function SkyMap(canvas, opts) {
    opts = opts || {};
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.backdrop = opts.backdrop;
    this.opts = Object.assign({ grid: false, labels: true, footprint: false, dust: true, hints: true, label: function (t) { return String(t.id); } }, opts);
    this.theme = Object.assign({}, DEFAULT_THEME, opts.theme || {});
    this.ir = Object.assign({ wl: 1.6, palette: 'emerald', brightness: 1, contrast: 1 }, opts.ir || {});
    this.view = Object.assign({ ra: 83.8, dec: 4, fov: 40 }, opts.view || {});
    this.minFov = 0.6; this.maxFov = 120;
    this.markers = []; this.stars = this.backdrop ? this.backdrop.getStars() : [];
    this.selectedId = null; this.hoverId = null; this.marker = null; this.visit = 0;
    this.on = {};
    this.W = 0; this.H = 0; this.dpr = 1; this._dirty = true; this._anim = null; this._ptrs = new Map();
    this.labelRects = []; this.cxf = 0.5; this.cyf = 0.5;
    this._bind(); this.resize();
    const self = this;
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(canvas.parentElement || canvas);
    else window.addEventListener('resize', function () { self.resize(); });
    (function loop() { if (self._dirty) { self._dirty = false; self.render(); } requestAnimationFrame(loop); })();
  }
  SX.SkyMap = SkyMap;
  const P = SkyMap.prototype;

  P.k = function () { return this.W / this.view.fov; };           // pixels per degree
  P.dirty = function () { this._dirty = true; };

  P.resize = function () {
    const r = (this.c.parentElement || this.c).getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(40, Math.round(r.width)), h = Math.max(40, Math.round(r.height));
    this.W = w; this.H = h; this.dpr = dpr;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty(); if (this.on.view) this.on.view(this.view);
  };

  /* ---------- projection ---------- */
  P.project = function (ra, dec, out) {
    const v = this.view, d0 = v.dec * DEG, dr = (ra - v.ra) * DEG, d = dec * DEG;
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dr);
    if (cosc < -0.35) return null;
    const kk = 2 / (1 + cosc), S = this.k() * 180 / Math.PI;
    const x = kk * Math.cos(d) * Math.sin(dr), y = kk * (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dr));
    const o = out || {};
    o.x = this.W * this.cxf - x * S; o.y = this.H * this.cyf - y * S; return o;
  };
  P.unproject = function (sx, sy) {
    const v = this.view, d0 = v.dec * DEG, S = this.k() * 180 / Math.PI;
    const x = (this.W * this.cxf - sx) / S, y = (this.H * this.cyf - sy) / S, rho = Math.hypot(x, y);
    if (rho < 1e-9) return { ra: v.ra, dec: v.dec };
    const c = 2 * Math.atan(rho / 2), sc = Math.sin(c), cc = Math.cos(c);
    const dec = Math.asin(clamp(cc * Math.sin(d0) + y * sc * Math.cos(d0) / rho, -1, 1));
    let ra = v.ra * DEG + Math.atan2(x * sc, rho * Math.cos(d0) * cc - y * Math.sin(d0) * sc);
    ra = ((ra / DEG) % 360 + 360) % 360;
    return { ra: ra, dec: dec / DEG };
  };

  /* ---------- public control ---------- */
  P.setTargets = function (list) {
    const self = this;
    this.markers = list.map(function (t) {
      return { t: t, id: t.id, ra: t.coordinates.ra, dec: t.coordinates.dec, mag: t.apparentMagnitude == null ? 8 : t.apparentMagnitude,
        ti: R.coolIndex(t.temperatureKelvin), cls: t.classification, size: t.angularSizeDeg || 0.05, demo: t.demo || {} };
    });
    this.dirty(); return self;
  };
  P.setIR = function (p) { Object.assign(this.ir, p); this.dirty(); };
  P.setOpts = function (p) { Object.assign(this.opts, p); this.dirty(); };
  P.setTheme = function (p) { Object.assign(this.theme, p); this.dirty(); };
  P.setCenterFrac = function (x, y) { this.cxf = x; this.cyf = y; this.dirty(); };
  P.setVisit = function (i) { this.visit = i; this.dirty(); };
  P.select = function (target, silent) {
    this.selectedId = target ? target.id : null; this.dirty();
    if (!silent && this.on.select) this.on.select(target || null);
  };
  P.setMarker = function (ra, dec) { this.marker = ra == null ? null : { ra: ra, dec: dec }; this.dirty(); };
  P._clampFov = function (f) { return clamp(f, this.minFov, this.maxFov); };
  P._viewChanged = function () { this.dirty(); if (this.on.view) this.on.view(this.view); };
  P._stop = function () { if (this._anim) { cancelAnimationFrame(this._anim); this._anim = null; } };
  P.zoomBy = function (f) { this._stop(); this.view.fov = this._clampFov(this.view.fov / f); this._viewChanged(); };
  P.setView = function (ra, dec, fov) {
    this._stop();
    this.view.ra = ((ra % 360) + 360) % 360; this.view.dec = clamp(dec, -89, 89);
    if (fov != null) this.view.fov = this._clampFov(fov);
    this._viewChanged();
  };
  P.flyTo = function (ra, dec, fov, ms) {
    const self = this, v = this.view;
    if (this._anim) cancelAnimationFrame(this._anim);
    const tf = fov == null ? v.fov : this._clampFov(fov);
    if (SX.motionReduced() || ms === 0) { this.setView(ra, dec, tf); return; }
    const dra = ((ra - v.ra + 540) % 360) - 180, a = { ra: v.ra, dec: v.dec, fov: v.fov }, t0 = performance.now(), dur = ms || 900;
    const l0 = Math.log(a.fov), l1 = Math.log(tf);
    (function step(now) {
      const p = clamp((now - t0) / dur, 0, 1), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dip = Math.sin(p * Math.PI) * Math.min(0.9, Math.abs(dra) / 160 + Math.abs(dec - a.dec) / 160);
      self.view.ra = (((a.ra + dra * e) % 360) + 360) % 360;
      self.view.dec = clamp(lerp(a.dec, dec, e), -89, 89);
      self.view.fov = self._clampFov(Math.exp(lerp(l0, l1, e) + dip));
      self._viewChanged();
      self._anim = p < 1 ? requestAnimationFrame(step) : null;
    })(t0);
  };
  P.cycle = function (dir) {
    const list = this.markers.slice().sort(function (a, b) { return a.ra - b.ra; });
    if (!list.length) return;
    let i = list.findIndex(function (m) { return m.id === this.selectedId; }, this);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    this.select(list[i].t);
  };

  /* ---------- hit testing ---------- */
  P.objRadius = function (m) { return clamp(Math.max(m.size * this.k() * 1.2, 5), 5, 240); };
  P.hit = function (sx, sy) {
    let best = null, bd = 1e9; const p = {};
    const minR = window.matchMedia && window.matchMedia('(pointer:coarse)').matches ? 26 : 18;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      if (!this.project(m.ra, m.dec, p)) continue;
      const d = Math.hypot(p.x - sx, p.y - sy), rad = Math.max(minR, this.objRadius(m) + 6);
      if (d < rad && d < bd) { bd = d; best = m; }
    }
    return best;
  };

  /* ---------- input ---------- */
  P._bind = function () {
    const c = this.c, self = this;
    c.style.touchAction = 'none';
    if (!c.hasAttribute('tabindex')) c.tabIndex = 0;
    let moved = 0, downAt = null, pinch = null;
    c.addEventListener('pointerdown', function (e) {
      c.setPointerCapture(e.pointerId);
      self._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (self._ptrs.size === 1) { moved = 0; downAt = { x: e.clientX, y: e.clientY }; }
      if (self._ptrs.size === 2) { const a = Array.from(self._ptrs.values()); pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      if (self._anim) { cancelAnimationFrame(self._anim); self._anim = null; }
    });
    c.addEventListener('pointermove', function (e) {
      const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, prev = self._ptrs.get(e.pointerId);
      if (prev) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        self._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (self._ptrs.size === 1) {
          moved += Math.abs(dx) + Math.abs(dy);
          if (moved > 5) {
            const k = self.k(), cd = Math.max(0.25, Math.cos(self.view.dec * DEG));
            self.view.ra = (((self.view.ra + dx / (k * cd)) % 360) + 360) % 360;
            self.view.dec = clamp(self.view.dec + dy / k, -89, 89);
            c.style.cursor = 'grabbing'; self._viewChanged();
          }
        } else if (self._ptrs.size === 2 && pinch) {
          const a = Array.from(self._ptrs.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
          self.zoomBy(d / pinch); pinch = d; moved = 99;
        }
      } else {
        const h = self.hit(sx, sy), id = h ? h.id : null;
        if (id !== self.hoverId) { self.hoverId = id; c.style.cursor = h ? 'pointer' : 'grab'; self.dirty(); if (self.on.hover) self.on.hover(h ? h.t : null, e); }
        if (self.on.pointer) self.on.pointer(self.unproject(sx, sy));
      }
    });
    const up = function (e) {
      const was = self._ptrs.has(e.pointerId); self._ptrs.delete(e.pointerId);
      if (self._ptrs.size < 2) pinch = null;
      c.style.cursor = 'grab';
      if (was && moved <= 5 && downAt && self._ptrs.size === 0) {
        const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, h = self.hit(sx, sy);
        if (h) { self.selectedId = h.id; self.dirty(); if (self.on.select) self.on.select(h.t); }
        else if (self.on.empty) self.on.empty(self.unproject(sx, sy), { x: sx, y: sy });
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', function (e) { self._ptrs.delete(e.pointerId); pinch = null; });
    c.addEventListener('pointerleave', function () { if (self.hoverId) { self.hoverId = null; self.dirty(); if (self.on.hover) self.on.hover(null); } });
    c.addEventListener('wheel', function (e) { e.preventDefault(); self.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    c.addEventListener('keydown', function (e) {
      const step = 60 / self.k(); let used = true;
      const cd = Math.max(0.25, Math.cos(self.view.dec * DEG));
      switch (e.key) {
        case 'ArrowLeft': self.setView(self.view.ra + step / cd, self.view.dec); break;
        case 'ArrowRight': self.setView(self.view.ra - step / cd, self.view.dec); break;
        case 'ArrowUp': self.setView(self.view.ra, self.view.dec + step); break;
        case 'ArrowDown': self.setView(self.view.ra, self.view.dec - step); break;
        case '+': case '=': self.zoomBy(1.4); break;
        case '-': case '_': self.zoomBy(1 / 1.4); break;
        case 'n': case 'N': self.cycle(1); break;
        case 'p': case 'P': self.cycle(-1); break;
        case 'Escape': if (self.selectedId) { self.select(null); } else used = false; break;
        default: used = false;
      }
      if (used) e.preventDefault();
    });
    c.style.cursor = 'grab';
  };

  /* ---------- drawing ---------- */
  P.render = function () {
    const ctx = this.ctx, W = this.W, H = this.H, th = this.theme, ir = this.ir, k = this.k();
    const wl = ir.wl === 'rgb' ? 2.4 : ir.wl, t01 = (wl - 0.75) / 4.25, p = {};
    this.labelRects.length = 0;
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 1.6);
    g.addColorStop(0, th.bgInner); g.addColorStop(1, th.bgOuter);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    if (this.opts.dust && this.backdrop) {
      const gp = this.backdrop.getGalacticPlane(), tint = BAND_TINT[ir.wl === 'rgb' ? 'natural' : ir.palette] || BAND_TINT.natural;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath(); let pen = false, lx = 0, ly = 0;
        for (let i = 0; i < gp.length; i++) {
          const q = this.project(gp[i].ra, gp[i].dec, p);
          if (!q || p.x < -400 || p.x > W + 400 || p.y < -400 || p.y > H + 400) { pen = false; continue; }
          if (pen && Math.hypot(p.x - lx, p.y - ly) > 260) pen = false;
          if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          pen = true; lx = p.x; ly = p.y;
        }
        ctx.lineWidth = (pass ? 22 : 70) * Math.min(5, Math.max(0.6, k / 14));
        ctx.strokeStyle = 'rgba(' + tint + ',' + ((pass ? 0.11 : 0.07) * (0.7 + t01 * 1.2)) + ')';
        ctx.stroke();
      }
      ctx.restore();
      const dust = this.backdrop.getDustBlobs();
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i]; if (!this.project(d.ra, d.dec, p)) continue;
        const r = d.r * k * 0.45; if (r < 2 || p.x < -r || p.x > W + r || p.y < -r || p.y > H + r) continue;
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r), a = d.a * (0.06 + t01 * 0.17);
        gg.addColorStop(0, 'rgba(' + tint + ',' + a + ')'); gg.addColorStop(1, 'rgba(' + tint + ',0)');
        ctx.fillStyle = gg; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }

    if (this.opts.grid) this._grid(ctx, th, k);

    const scale = clamp(0.75 + Math.log2(Math.max(k, 1) / 14) * 0.28, 0.6, 2.8), st = this.stars;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (!this.project(s.ra, s.dec, p) || p.x < -6 || p.x > W + 6 || p.y < -6 || p.y > H + 6) continue;
      const f = R.fluxStar(s.t, wl) * (0.42 + 0.78 * Math.pow(10, -0.2 * (s.mag - 2))), c = R.colorFor(f, s.t, ir);
      if (c[3] < 0.035) continue;
      const rr = (0.55 + (7 - s.mag) * 0.34) * scale * (0.7 + c[3] * 0.5);
      ctx.fillStyle = 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + Math.min(1, 0.25 + c[3]).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, rr), 0, 6.2832); ctx.fill();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]; if (!this.project(m.ra, m.dec, p)) continue;
      const rr = this.objRadius(m); if (p.x < -rr || p.x > W + rr || p.y < -rr || p.y > H + rr) continue;
      const v = m.demo.variable, fa = v ? 1 + v.amp * Math.sin(2 * Math.PI * (this.visit / v.period) + v.phase) : 1;
      const fl = R.fluxObject(m.cls, m.ti, wl) * fa, amp = clamp(Math.pow(10, -0.12 * (m.mag - 1)), 0.4, 1.6);
      const c = R.colorFor(fl * amp * 2.1, m.ti, ir), pt = m.cls === 'star' || m.cls === 'brown-dwarf';
      const Rr = pt ? 7 + c[3] * 9 : clamp(rr * 1.5, 16, 300) * (0.6 + c[3] * 0.6);
      if (c[3] > 0.02) {
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Rr), col = (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0);
        gg.addColorStop(0, 'rgba(' + col + ',' + Math.min(pt ? 0.9 : 0.5, c[3] * (pt ? 1 : 0.7)) + ')');
        gg.addColorStop(pt ? 0.25 : 0.55, 'rgba(' + col + ',' + c[3] * (pt ? 0.3 : 0.16) + ')');
        gg.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = gg; ctx.fillRect(p.x - Rr, p.y - Rr, Rr * 2, Rr * 2);
        if (m.cls === 'galaxy' && rr > 16) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.5); ctx.scale(1, 0.38);
          const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, Rr);
          g2.addColorStop(0, 'rgba(' + col + ',' + c[3] * 0.6 + ')'); g2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, Rr, 0, 6.2832); ctx.fill(); ctx.restore();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    if (this.opts.footprint) this._footprint(ctx, th);

    const showAll = k > 9, labelOn = this.opts.labels;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]; if (!this.project(m.ra, m.dec, p)) continue;
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const sel = m.id === this.selectedId, hov = m.id === this.hoverId, r = Math.max(this.objRadius(m), 8) + (sel ? 6 : 3);
      if (sel) {
        ctx.strokeStyle = th.ring; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, 6.2832); ctx.stroke();
        const L = 8; ctx.beginPath();
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
          ctx.moveTo(p.x + q[0] * (r + 12), p.y + q[1] * (r + 12) - q[1] * L);
          ctx.lineTo(p.x + q[0] * (r + 12), p.y + q[1] * (r + 12));
          ctx.lineTo(p.x + q[0] * (r + 12) - q[0] * L, p.y + q[1] * (r + 12));
        });
        ctx.stroke();
      } else if (hov) { ctx.strokeStyle = th.accent; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.stroke(); }
      else if (this.opts.hints) { ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(this.objRadius(m), 8) + 3, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
      if (labelOn && (sel || hov || showAll || m.mag < 2)) this._label(ctx, this.opts.label(m.t), p.x, p.y + r + (sel ? 30 : 14), sel || hov, th);
    }
    if (this.marker && this.project(this.marker.ra, this.marker.dec, p)) {
      ctx.strokeStyle = th.marker; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(p.x - 15, p.y); ctx.lineTo(p.x - 5, p.y); ctx.moveTo(p.x + 5, p.y); ctx.lineTo(p.x + 15, p.y);
      ctx.moveTo(p.x, p.y - 15); ctx.lineTo(p.x, p.y - 5); ctx.moveTo(p.x, p.y + 5); ctx.lineTo(p.x, p.y + 15); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.2832); ctx.stroke();
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + th.vignette + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  };

  P._label = function (ctx, text, x, y, strong, th) {
    ctx.font = th.labelFont;
    const w = ctx.measureText(text).width + 6, rect = { x: x - w / 2, y: y - 12, w: w, h: 16 };
    if (!strong) for (let i = 0; i < this.labelRects.length; i++) {
      const q = this.labelRects[i];
      if (rect.x < q.x + q.w && rect.x + rect.w > q.x && rect.y < q.y + q.h && rect.y + rect.h > q.y) return;
    }
    this.labelRects.push(rect);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = strong ? '#fff' : th.label; ctx.fillText(text, x, y);
  };

  P._grid = function (ctx, th, k) {
    const W = this.W, H = this.H, fov = this.view.fov;
    const step = fov > 110 ? 30 : fov > 50 ? 15 : fov > 20 ? 5 : fov > 8 ? 2 : fov > 3 ? 1 : 0.5, p = {};
    ctx.lineWidth = 1; ctx.strokeStyle = th.grid; ctx.fillStyle = th.gridLabel; ctx.font = '10px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'left';
    const cdec = this.view.dec, cra = this.view.ra;
    const span = Math.min(180, Math.max(W, H) / k * 0.9), Rg = Math.min(180, span * 1.25), Sg = Math.min(90, span * 1.1), samp = Math.max(2.5, step / 3);
    for (let d = Math.ceil((cdec - Sg) / step) * step; d <= cdec + Sg; d += step) {
      if (d <= -90 || d >= 90) continue;
      ctx.beginPath(); let pen = false;
      for (let r = cra - Rg; r <= cra + Rg; r += samp) {
        if (!this.project(r, d, p) || p.x < -W || p.x > 2 * W || p.y < -H || p.y > 2 * H) { pen = false; continue; }
        if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true;
      }
      ctx.stroke();
      if (this.project(cra, d, p) && p.y > 14 && p.y < H - 14) ctx.fillText(d + '°', 8, p.y - 3);
    }
    for (let r = Math.floor((cra - Rg) / step) * step; r <= cra + Rg; r += step) {
      ctx.beginPath(); let pen = false;
      for (let d = Math.max(-89.9, cdec - Sg); d <= Math.min(89.9, cdec + Sg); d += samp) {
        if (!this.project(r, d, p) || p.x < -W || p.x > 2 * W || p.y < -H || p.y > 2 * H) { pen = false; continue; }
        if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true;
      }
      ctx.stroke();
      if (this.project(r, cdec, p) && p.x > 20 && p.x < W - 30) ctx.fillText((((r % 360) + 360) % 360 / 15).toFixed(step < 15 ? 1 : 0) + 'h', p.x + 3, H - 8);
    }
  };

  /* Illustrative instrument footprint around the view centre or the selected target. */
  P._footprint = function (ctx, th) {
    const sel = this.markers.find(function (m) { return m.id === this.selectedId; }, this);
    const ra0 = sel ? sel.ra : this.view.ra, dec0 = sel ? sel.dec : this.view.dec, p = {};
    const rot = (this.visit * 23 + 10) * DEG, hw = 5.65, hh = 1.75, cd = Math.max(0.2, Math.cos(dec0 * DEG));
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (q) {
      const x = q[0] * Math.cos(rot) - q[1] * Math.sin(rot), y = q[0] * Math.sin(rot) + q[1] * Math.cos(rot);
      return [ra0 - x / cd, dec0 + y];
    });
    ctx.save(); ctx.strokeStyle = th.footprint; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.beginPath();
    let ok = true;
    for (let i = 0; i < 4; i++) { if (!this.project(pts[i][0], pts[i][1], p)) { ok = false; break; } if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    if (ok) { ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(255,216,77,.07)'; ctx.fill(); }
    ctx.restore();
  };
})();
