#!/usr/bin/env python3
"""Build single-file versions of the app (needs Node; uses npx esbuild).

    python3 scripts/build_standalone.py

- dist/skyshift.html: the app plus the team briefing. Opens by double-click and starts on
  simulated data; live NASA SPHEREx mode needs `python3 server.py` (IRSA blocks direct requests).
- dist/huggingface/: the two files a Hugging Face Docker Space needs (README.md, Dockerfile).
  The Dockerfile downloads the full project from GitHub at build time, because the Space's
  web uploader drops folders.
"""
import shutil
import os
import re
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "scripts", "standalone")


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


def bundled_app():
    """app/index.html with its stylesheet and all JavaScript modules inlined."""
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "bundle.js")
        subprocess.run(["npx", "-y", "esbuild@0.24.0", "app/js/main.js", "--bundle", "--format=esm",
                        "--minify-syntax", f"--outfile={out}"], cwd=ROOT, check=True)
        with open(out, encoding="utf-8") as f:
            bundle = f.read().replace("</script", "<\\/script")

    html = read("app", "analysis.html")
    css = read("app", "css", "style.css") + "\n" + read("scripts", "standalone", "extra.css")
    html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}</style>")
    return html.replace('<script type="module" src="js/main.js"></script>', f'<script type="module">\n{bundle}</script>')


def write(rel, text):
    dest = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {rel} ({len(text) // 1024} KB)")


def build_huggingface():
    shutil.rmtree(os.path.join(ROOT, "dist", "huggingface"), ignore_errors=True)
    write("dist/huggingface/README.md", read("deploy", "huggingface", "README.md"))
    write("dist/huggingface/Dockerfile", read("deploy", "huggingface", "Dockerfile"))


def main():
    app_html = bundled_app()
    build_huggingface()
    html = app_html
    html = html.replace('<input id="target" name="target"', '<input id="target" name="target" value="Barnard\'s Star"')
    old = '<option value="irsa">NASA SPHEREx (IRSA)</option>\n              <option value="sim" hidden>Simulated (offline tests)</option>'
    assert old in html
    html = html.replace(old, '<option value="sim" selected>Simulated demo</option>\n'
                             '              <option value="irsa">NASA SPHEREx (IRSA, needs internet)</option>')
    banner = """
  <div class="preview-banner" role="note">
    <strong>Starts on simulated data.</strong>
    The opening movie uses generated SPHEREx-like images (stars, a fast brown dwarf, a variable star and an asteroid).
    To try real NASA data, choose <em>Data source → NASA SPHEREx (IRSA)</em> while online; if the archive blocks the request,
    run <code>python3 server.py</code> from the repository instead. The team briefing is <a href="#briefing">below the app</a>.
  </div>
"""
    html = html.replace('<main class="layout">', banner + '\n  <main class="layout">', 1)
    html = html.replace('<footer class="foot">', read("scripts", "standalone", "briefing.html") + '\n  <footer class="foot">', 1)
    html = re.sub(r"<title>.*?</title>", "<title>SkyShift</title>", html, count=1)
    write("dist/skyshift.html", html)


if __name__ == "__main__":
    main()
