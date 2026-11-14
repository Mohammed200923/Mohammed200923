#!/usr/bin/env python3
"""Build the 3D sky's real star catalogue.

    python3 scripts/build_stars.py HIP.tsv HYG.csv

HIP.tsv: Hipparcos, new reduction (van Leeuwen 2007, VizieR I/311/hip2), stars with Hp < 8.2:
  https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/311/hip2&-out=HIP&-out=RArad&-out=DErad&-out=Hpmag&-out=B-V&Hpmag=%3C8.2&-out.max=200000
HYG.csv: HYG database v4.1 (astronexus, CC BY-SA 4.0), used only for the IAU proper names keyed by HIP number:
  https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv

Writes app/spherex-immersive/data/stars.bin: uint32 N, then uint16 RA[N] (RA/360*65535), int16 Dec[N] (Dec/90*32767),
uint8 mag[N] ((Hp+2)*20), uint8 colour[N] ((B-V+0.5)*100); and data/star-names.json: [[name, ra, dec, mag], ...].
"""
import csv, json, os, struct, sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'spherex-immersive', 'data')
stars = {}
for line in open(sys.argv[1]):
    p = line.rstrip('\n').split('\t')
    if len(p) < 5 or not p[0].strip().isdigit():
        continue
    try:
        hip, ra, dec, mag = int(p[0]), float(p[1]), float(p[2]), float(p[3])
    except ValueError:
        continue
    bv = float(p[4]) if p[4].strip() else 0.6
    stars[hip] = (ra, dec, mag, bv)
order = sorted(stars, key=lambda h: stars[h][2])
n = len(order)
clamp = lambda x, a, b: max(a, min(b, x))
with open(os.path.join(root, 'stars.bin'), 'wb') as f:
    f.write(struct.pack('<I', n))
    f.write(struct.pack(f'<{n}H', *[round(stars[h][0] / 360 * 65535) % 65536 for h in order]))
    f.write(struct.pack(f'<{n}h', *[round(stars[h][1] / 90 * 32767) for h in order]))
    f.write(bytes(clamp(round((stars[h][2] + 2) * 20), 0, 255) for h in order))
    f.write(bytes(clamp(round((stars[h][3] + 0.5) * 100), 0, 255) for h in order))
names = []
for r in csv.DictReader(open(sys.argv[2])):
    if r['proper'] and r['hip'] and int(r['hip']) in stars:
        ra, dec, mag, _ = stars[int(r['hip'])]
        names.append([r['proper'], round(ra, 4), round(dec, 4), round(mag, 2)])
names.sort(key=lambda x: x[3])
json.dump(names, open(os.path.join(root, 'star-names.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print(f'{n} stars, {len(names)} names')
