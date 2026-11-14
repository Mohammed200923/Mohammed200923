/* Procedural sky BACKDROP for the map: random stars, the galactic plane and dust blobs.
   This is decoration, independent of the data provider. Replace it with a real sky-survey layer by
   giving SX.config.backdrop an object with the same three methods (see FRONTEND_INTEGRATION.md):
     getStars()         -> [{ ra, dec, mag, t }]        t: 0 = hot/blue ... 1 = cool/red (illustrative)
     getGalacticPlane() -> [{ ra, dec }]                 polyline drawn as the Milky Way band
     getDustBlobs()     -> [{ ra, dec, r, a }]           soft dust patches (r in degrees, a = 0..1)          */
(function () {
  const SX = window.SX, DEG = SX.DEG;
  let STARS = null, GPLANE = null, DUST = null;

  SX.proceduralBackdrop = {
    isSimulated: true,
    getStars: function () {
      if (STARS) return STARS;
      const rnd = SX.rng(20250501), raP = 192.86 * DEG, decP = 27.13 * DEG, arr = [];
      while (arr.length < 15000) {
        const ra = rnd() * 360, dec = Math.asin(2 * rnd() - 1) / DEG;
        const sinb = Math.sin(dec * DEG) * Math.sin(decP) + Math.cos(dec * DEG) * Math.cos(decP) * Math.cos(ra * DEG - raP);
        const b = Math.asin(sinb) / DEG;
        if (rnd() > 0.18 + 0.82 * Math.exp(-Math.abs(b) / 14)) continue;
        arr.push({ ra: ra, dec: dec, mag: 2 + Math.pow(rnd(), 0.55) * 5, t: Math.pow(rnd(), 1.1) });
      }
      return (STARS = arr);
    },
    getGalacticPlane: function () {
      if (GPLANE) return GPLANE;
      const pts = [], raG = 192.86 * DEG, decG = 27.13 * DEG, th = 122.93 * DEG;
      for (let l = 0; l <= 360; l += 3) {
        const L = l * DEG, dec = Math.asin(Math.cos(decG) * Math.cos(th - L));
        const y = Math.sin(th - L), x = -Math.sin(decG) * Math.cos(th - L), ra = raG + Math.atan2(y, x);
        pts.push({ ra: ((ra / DEG) % 360 + 360) % 360, dec: dec / DEG });
      }
      return (GPLANE = pts);
    },
    getDustBlobs: function () {
      if (DUST) return DUST;
      const g = SX.proceduralBackdrop.getGalacticPlane(), rnd = SX.rng(777), out = [];
      for (let i = 0; i < 46; i++) {
        const p = g[Math.floor(rnd() * g.length)];
        out.push({ ra: p.ra + (rnd() - 0.5) * 14, dec: p.dec + (rnd() - 0.5) * 12, r: 3 + rnd() * 7, a: 0.25 + rnd() * 0.6 });
      }
      return (DUST = out);
    }
  };
})();
