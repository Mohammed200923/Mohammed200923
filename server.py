#!/usr/bin/env python3
"""SkyShift server.

Serves the app from ./app and an allow-listed proxy at /proxy?url=... so the browser can
reach archives that don't send CORS headers. Proxied answers are cached on disk, so a field
that anyone has loaded once comes back in seconds for the next visitor.

/proxy?url=...&fits=planes  SPHEREx cutout trimmed to the planes the app uses (IMAGE, FLAGS,
                            VARIANCE, ZODI): ~120 KB instead of ~4 MB, read only that far.
/proxy?url=...&fits=noepsf  Whole MEF minus the ~4 MB EPSF table (keeps WCS-WAVE).
/proxy?url=...&fits=psf-ee  From the EPSF table (one SPHEREx point-spread function per detector
                            region), each PSF's wavelength and the fraction of its light inside
                            the app's 2-pixel aperture, as JSON {"rows": [[cwave_um, fraction]]}.
/proxy?url=...&cols=a,b,c   MAST-style JSON ({fields, data}) cut down to those columns
                            (MAST's Gaia DR3 cone returns all 153 columns: ~6 MB per field).
                            For a VOTable answer, also &where=col:value;col:value keeps only
                            matching rows, and the result is returned as that same JSON shape
                            (an IRSA NEOWISE search is ~10 MB; the W2 image rows are ~50 KB).

    python3 server.py            # http://localhost:8000
    python3 server.py --port 9000
"""
import argparse
import hashlib
import http.server
import json
import math
import struct
import os
import tempfile
import threading
import xml.etree.ElementTree as ET
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
ALLOWED_HOSTS = {
    "irsa.ipac.caltech.edu",
    "vizier.cds.unistra.fr",
    "cds.unistra.fr",
    "simbad.cds.unistra.fr",
    # VizieR / Sesame mirrors (CDS redirects Sesame to these during outages)
    "vizier.idia.ac.za",
    "vizier.cfa.harvard.edu",
    # NASA JPL small-body identification and Horizons (known asteroids and comets)
    "ssd-api.jpl.nasa.gov",
    "ssd.jpl.nasa.gov",
    # NASA MAST (Gaia DR3, as linked by the challenge) and the Canadian Astronomy Data Centre
    "mast.stsci.edu",
    "ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca",
}
TIMEOUT = 180
CACHE_DIR = os.environ.get("SKYSHIFT_CACHE", os.path.join(tempfile.gettempdir(), "skyshift-cache"))
CACHE_MAX_BYTES = int(os.environ.get("SKYSHIFT_CACHE_MB", "2000")) * 1024 * 1024
# Archive searches can gain new rows as SPHEREx data arrives (weekly); everything else
# (image cutouts, time-specific ephemerides, catalogues) doesn't change.
SEARCH_TTL = 6 * 3600
BLOCK = 2880
_cache_lock = threading.Lock()


def is_search(url):
    path = urllib.parse.urlparse(url).path
    return path.endswith(("/SIA", "/TAP/sync", "/asu-tsv", "/argus/sync")) or "sesame" in path


# ---------- disk cache ----------

def cache_path(key):
    return os.path.join(CACHE_DIR, hashlib.sha256(key.encode()).hexdigest())


def cache_get(key, url):
    path = cache_path(key)
    try:
        st = os.stat(path)
    except FileNotFoundError:
        return None
    if is_search(url) and time.time() - st.st_mtime > SEARCH_TTL:
        return None
    with open(path + ".type") as f:
        ctype = f.read().strip()
    with open(path, "rb") as f:
        return f.read(), ctype


def cache_put(key, body, ctype):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = cache_path(key)
    tmp = f"{path}.{threading.get_ident()}.tmp"
    with open(tmp, "wb") as f:
        f.write(body)
    with open(path + ".type", "w") as f:
        f.write(ctype)
    os.replace(tmp, path)
    with _cache_lock:
        files = [os.path.join(CACHE_DIR, n) for n in os.listdir(CACHE_DIR) if not n.endswith((".type", ".tmp"))]
        sizes = {p: os.path.getsize(p) for p in files}
        total = sum(sizes.values())
        for p in sorted(files, key=os.path.getmtime):  # evict oldest first
            if total <= CACHE_MAX_BYTES:
                break
            total -= sizes[p]
            for q in (p, p + ".type"):
                try:
                    os.remove(q)
                except FileNotFoundError:
                    pass


# ---------- FITS trimming ----------

def read_exact(resp, n):
    out = bytearray()
    while len(out) < n:
        chunk = resp.read(n - len(out))
        if not chunk:
            break
        out += chunk
    return bytes(out)


def parse_header(header):
    cards = {}
    for i in range(0, len(header), 80):
        card = header[i:i + 80].decode("ascii", "replace")
        key = card[:8].strip()
        if key == "END":
            break
        if card[8:10] == "= ":
            value = card[10:].split("/")[0].strip().strip("'").strip()
            cards[key] = value
    return cards


def trim_fits(resp, mode):
    """Copy a MEF HDU by HDU: drop EPSF; in 'planes' mode stop once IMAGE..ZODI are in."""
    first = read_exact(resp, BLOCK)
    if first[:2] == b"\x1f\x8b" or not first.startswith(b"SIMPLE"):
        return first + resp.read()  # not a plain FITS file: pass through untouched
    out, seen, block = bytearray(), set(), first
    while block:
        header = bytearray(block)
        while not _has_end(header):
            nxt = read_exact(resp, BLOCK)
            if not nxt:
                return bytes(out)
            header += nxt
        cards = parse_header(bytes(header))
        naxis = int(cards.get("NAXIS", 0))
        count = 1 if naxis else 0
        for k in range(1, naxis + 1):
            count *= int(cards.get(f"NAXIS{k}", 0))
        nbytes = abs(int(cards.get("BITPIX", 8))) // 8 * int(cards.get("GCOUNT", 1)) * (int(cards.get("PCOUNT", 0)) + count)
        padded = -(-nbytes // BLOCK) * BLOCK
        name = cards.get("EXTNAME", "PRIMARY" if not out else "").upper()
        data = read_exact(resp, padded)
        if name != "EPSF":
            out += header + data
        seen.add(name)
        if mode == "planes" and {"IMAGE", "FLAGS", "VARIANCE", "ZODI"} <= seen:
            break
        block = read_exact(resp, BLOCK)
    return bytes(out)


def psf_encircled(resp, radius_px=2.0):
    """Read a SPHEREx MEF up to its EPSF table; for each PSF, the light fraction within radius."""
    while True:
        header = bytearray(read_exact(resp, BLOCK))
        if not header:
            raise ValueError("no EPSF table in this file")
        while not _has_end(header):
            nxt = read_exact(resp, BLOCK)
            if not nxt:
                raise ValueError("truncated FITS header")
            header += nxt
        cards = parse_header(bytes(header))
        naxis = int(cards.get("NAXIS", 0))
        count = 1 if naxis else 0
        for k in range(1, naxis + 1):
            count *= int(cards.get(f"NAXIS{k}", 0))
        nbytes = abs(int(cards.get("BITPIX", 8))) // 8 * int(cards.get("GCOUNT", 1)) * (int(cards.get("PCOUNT", 0)) + count)
        data = read_exact(resp, -(-nbytes // BLOCK) * BLOCK)
        if cards.get("EXTNAME", "").upper() == "EPSF":
            break
    width, rows = int(cards["NAXIS1"]), int(cards["NAXIS2"])
    over = int(cards.get("OVSMPX", 5))
    # Column layout from the header: offsets of CWAVE and the EPSF image within a row.
    sizes = {"J": 4, "E": 4, "D": 8, "I": 2, "K": 8, "B": 1}
    offset, cols = 0, {}
    for k in range(1, int(cards["TFIELDS"]) + 1):
        form = cards[f"TFORM{k}"].strip()
        rep_count = int(form[:-1] or 1)
        cols[cards[f"TTYPE{k}"].strip().upper()] = (offset, form[-1], rep_count)
        offset += rep_count * sizes[form[-1]]
    cw_off, _, _ = cols["CWAVE"]
    ps_off, ps_type, ps_n = cols["EPSF"]
    side = int(round(math.sqrt(ps_n)))
    c = (side - 1) / 2
    inside = [j * side + i for j in range(side) for i in range(side) if math.hypot(i - c, j - c) <= radius_px * over]
    fmt = ">" + str(ps_n) + ("d" if ps_type == "D" else "f")
    out = []
    for r in range(rows):
        row = data[r * width:(r + 1) * width]
        cwave = struct.unpack_from(">f", row, cw_off)[0]
        psf = struct.unpack_from(fmt, row, ps_off)
        total = sum(psf)
        if total > 0:
            out.append([round(cwave, 4), round(sum(psf[i] for i in inside) / total, 4)])
    return json.dumps({"radius_px": radius_px, "rows": out}, separators=(",", ":")).encode()


def _has_end(header):
    for i in range(0, len(header), 80):
        if header[i:i + 8] == b"END     ":
            return True
    return False


def select_columns(body, cols):
    """Reduce a MAST JSON answer ({fields: [...], data: [{...}]}) to the named columns."""
    doc = json.loads(body)
    keep = set(cols)
    doc["fields"] = [f for f in doc.get("fields", []) if f.get("name") in keep]
    doc["data"] = [{k: row.get(k) for k in cols} for row in doc.get("data", [])]
    return json.dumps(doc, separators=(",", ":")).encode()


def votable_to_json(body, cols, where=""):
    """Rows of a TABLEDATA VOTable, filtered by where='col:value;...' and cut to cols."""
    conditions = [c.split(":", 1) for c in where.split(";") if ":" in c]
    root = ET.fromstring(body)
    strip = lambda tag: tag.rsplit("}", 1)[-1]
    fields, rows = [], []
    for el in root.iter():
        if strip(el.tag) == "FIELD":
            fields.append(el.get("name"))
        elif strip(el.tag) == "TR":
            cells = [(td.text or "").strip() for td in el if strip(td.tag) == "TD"]
            row = dict(zip(fields, cells))
            if all(row.get(k) == v for k, v in conditions):
                rows.append({k: row.get(k) for k in cols})
    doc = {"fields": [{"name": c} for c in cols], "data": rows}
    return json.dumps(doc, separators=(",", ":")).encode()


# ---------- HTTP ----------

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass  # keep hosted logs readable

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy/health":
            return self._send(200, b"ok", "text/plain; charset=utf-8")
        if parsed.path == "/copilot/token":
            return self._copilot_token()
        if parsed.path == "/proxy":
            q = urllib.parse.parse_qs(parsed.query)
            return self._proxy(q.get("url", [""])[0], q.get("fits", [""])[0], q.get("cols", [""])[0], q.get("where", [""])[0])
        return super().do_GET()

    def _copilot_token(self):
        """Microsoft Copilot Studio: fetch a Direct Line token for the "Ask the guide" panel.

        Configure with the agent's token endpoint (Copilot Studio > Channels > Mobile app / Web app, agent set to
        "No authentication"): SKYSHIFT_COPILOT_TOKEN_URL. Optional: SKYSHIFT_COPILOT_DIRECTLINE for a regional
        Direct Line base URL. Without configuration this answers 404 and the page uses its built-in guide.
        """
        token_url = os.environ.get("SKYSHIFT_COPILOT_TOKEN_URL", "").strip()
        if not token_url:
            return self._send(404, b'{"configured":false}', "application/json")
        host = urllib.parse.urlparse(token_url).hostname or ""
        if not (host.endswith(".api.powerplatform.com") or host.endswith(".powerva.microsoft.com")):
            return self._send(500, b'{"error":"SKYSHIFT_COPILOT_TOKEN_URL is not a Copilot Studio token endpoint"}', "application/json")
        try:
            req = urllib.request.Request(token_url, headers={"User-Agent": "SkyShift"})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.loads(r.read().decode("utf-8"))
            out = {
                "token": data.get("token"),
                "conversationId": data.get("conversationId"),
                "directLine": os.environ.get("SKYSHIFT_COPILOT_DIRECTLINE", "https://directline.botframework.com/v3/directline").rstrip("/"),
            }
            self.send_response(200)
            body = json.dumps(out).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            self._send(502, json.dumps({"error": f"Copilot Studio token request failed: {e}"}).encode(), "application/json")

    def _send(self, status, body, ctype, cached=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if cached is not None:
            self.send_header("X-SkyShift-Cache", "hit" if cached else "miss")
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, target, fits_mode, cols="", where=""):
        url = urllib.parse.urlparse(target)
        if url.scheme != "https" or url.hostname not in ALLOWED_HOSTS:
            return self._send(403, b"host not allowed", "text/plain")
        if fits_mode not in ("", "planes", "noepsf", "psf-ee"):
            return self._send(400, b"unknown fits mode", "text/plain")
        key = f"{fits_mode}|{cols}|{where}|{target}"
        try:
            hit = cache_get(key, target)
            if hit:
                return self._send(200, hit[0], hit[1], cached=True)
            body, ctype = self._fetch(target, fits_mode)
            if cols and (body.lstrip().startswith(b"<") or "xml" in ctype):
                body, ctype = votable_to_json(body, cols.split(","), where), "application/json"
            elif cols:
                body = select_columns(body, cols.split(","))
            cache_put(key, body, ctype)
            self._send(200, body, ctype, cached=False)
        except urllib.error.HTTPError as e:
            self._send(e.code, f"upstream error: {e.reason}".encode(), "text/plain")
        except (urllib.error.URLError, TimeoutError) as e:
            self._send(502, f"upstream unreachable: {e}".encode(), "text/plain")
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser went away
        except Exception as e:  # e.g. a malformed URL: answer instead of dropping the connection
            try:
                self._send(400, f"bad proxy request: {e}".encode(), "text/plain")
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _fetch(self, target, fits_mode):
        req = urllib.request.Request(target, headers={"User-Agent": "SkyShift/1.0 (NASA Space Apps)"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                    ctype = resp.headers.get("Content-Type", "application/octet-stream")
                    if fits_mode == "psf-ee":
                        return psf_encircled(resp), "application/json"
                    body = trim_fits(resp, fits_mode) if fits_mode else resp.read()
                    return body, ctype
            except urllib.error.HTTPError as e:
                # Busy archive (IRSA answers 503 under load): back off and retry.
                if e.code in (429, 502, 503, 504) and attempt < 3:
                    time.sleep(1.5 * 2 ** attempt)
                    continue
                raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    # Cloud hosts (Cloud Run, Azure Container Apps, Hugging Face, ...) pass the port in $PORT.
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    args = ap.parse_args()
    server = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SkyShift running at http://{args.host}:{args.port}/ (cache: {CACHE_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
