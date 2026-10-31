// Test targets named in the challenge. Positions at `epoch` (decimal year), pm in mas/yr.
// Values are from SIMBAD / the discovery literature and are good to a few arcseconds —
// enough to centre a cutout; the tool propagates them to each frame's date.

export const TARGETS = [
  {
    key: 'barnard', name: "Barnard's Star", kind: 'Fastest-moving star in the sky (10.4″/yr)',
    ra: 269.452082, dec: 4.693365, epoch: 2000.0, pmra: -801.55, pmdec: 10362.39, sizeArcmin: 6,
  },
  {
    key: 'epsindib', name: 'Epsilon Indi B', kind: 'Pair of brown dwarfs orbiting a star',
    ra: 331.043833, dec: -56.782694, epoch: 2000.0, pmra: 3982, pmdec: -2466, sizeArcmin: 6,
  },
  {
    key: 'wise0855', name: 'WISE 0855−0714', kind: 'Coldest known brown dwarf, 8″/yr',
    ra: 133.795129, dec: -7.245147, epoch: 2010.5, pmra: -8123, pmdec: 680, sizeArcmin: 8,
  },
  {
    key: 'rwaur', name: 'RW Aurigae', kind: 'Variable young star',
    ra: 76.956408, dec: 30.401408, epoch: 2000.0, pmra: 3, pmdec: -25, sizeArcmin: 6,
  },
  {
    key: 'rdra', name: 'R Draconis', kind: 'Mira variable star',
    ra: 248.167417, dec: 66.755, epoch: 2000.0, pmra: -6, pmdec: 31, sizeArcmin: 6,
  },
];
