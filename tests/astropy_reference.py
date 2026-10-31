"""Generate astropy reference values for the JavaScript WCS test.

    pip install astropy numpy
    python3 tests/astropy_reference.py
"""
import json
import os

from astropy.io import fits
from astropy.wcs import WCS

HEADER = {
    "CTYPE1": "RA---TAN-SIP", "CTYPE2": "DEC--TAN-SIP",
    "CRVAL1": 269.4520, "CRVAL2": 4.7300, "CRPIX1": 40.5, "CRPIX2": 41.2,
    "CD1_1": -0.0012, "CD1_2": 0.00085, "CD2_1": 0.0009, "CD2_2": 0.00118,
    "A_ORDER": 3, "B_ORDER": 3,
    "A_2_0": 2.1e-5, "A_0_2": -1.2e-5, "A_1_1": 3.3e-6, "A_3_0": 1.0e-7,
    "B_1_1": 1.5e-5, "B_0_2": 4.0e-6, "B_2_0": -2.2e-6, "B_0_3": -8.0e-8,
}

hdr = fits.Header()
for k, v in HEADER.items():
    hdr[k] = v
w = WCS(hdr)
points = []
for x, y in [(0, 0), (80, 0), (0, 80), (80, 80), (39.5, 40.2), (12.3, 66.6)]:
    ra, dec = w.all_pix2world([[x, y]], 0)[0]
    points.append({"x": x, "y": y, "ra": float(ra), "dec": float(dec)})

out = os.path.join(os.path.dirname(__file__), "astropy_reference.json")
with open(out, "w") as f:
    json.dump({"header": HEADER, "points": points}, f, indent=1)
print(f"wrote {out}")
