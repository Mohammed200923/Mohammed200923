#!/usr/bin/env python3
"""SkyShift local server.

Serves the static app from ./app and exposes an allow-listed pass-through proxy
at /proxy?url=... so the browser can reach archives that do not send CORS headers.

    python3 server.py            # http://localhost:8000
    python3 server.py --port 9000
"""
import argparse
import http.server
import os
import shutil
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
}
TIMEOUT = 180


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy/health":
            return self._send_text(200, "ok")
        if parsed.path == "/proxy":
            return self._proxy(urllib.parse.parse_qs(parsed.query).get("url", [""])[0])
        return super().do_GET()

    def _send_text(self, status, text):
        body = text.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, target):
        url = urllib.parse.urlparse(target)
        if url.scheme != "https" or url.hostname not in ALLOWED_HOSTS:
            return self._send_text(403, "host not allowed")
        req = urllib.request.Request(target, headers={"User-Agent": "SkyShift/1.0 (NASA Space Apps)"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/octet-stream"))
                length = resp.headers.get("Content-Length")
                if length:
                    self.send_header("Content-Length", length)
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                shutil.copyfileobj(resp, self.wfile)
        except urllib.error.HTTPError as e:
            self._send_text(e.code, f"upstream error: {e.reason}")
        except (urllib.error.URLError, TimeoutError) as e:
            self._send_text(502, f"upstream unreachable: {e}")
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser stops reading once it has the image planes it needs
        except Exception as e:  # e.g. a malformed URL: answer instead of dropping the connection
            self._send_text(400, f"bad proxy request: {e}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    # Cloud hosts (Cloud Run, Azure Container Apps, ...) pass the port in $PORT.
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    args = ap.parse_args()
    server = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SkyShift running at http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
