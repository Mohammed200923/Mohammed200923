#!/usr/bin/env python3
"""Build dist/skyshift.html: the whole app (plus team briefing) in one self-contained file.

    python3 scripts/build_standalone.py      # needs Node (uses npx esbuild)

The file opens by double-click. It starts on simulated data. Live NASA SPHEREx mode needs
internet access, and may need `python3 server.py` if the archive blocks cross-origin requests.
"""
import os
import re
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "scripts", "standalone")


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


def main():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "bundle.js")
        subprocess.run(["npx", "-y", "esbuild@0.24.0", "app/js/main.js", "--bundle", "--format=esm",
                        "--minify-syntax", f"--outfile={out}"], cwd=ROOT, check=True)
        with open(out, encoding="utf-8") as f:
            bundle = f.read().replace("</script", "<\\/script")

    html = read("app", "index.html")
    css = read("app", "css", "style.css") + "\n" + read("scripts", "standalone", "extra.css")
    html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}</style>")
    html = html.replace('<script type="module" src="js/main.js"></script>', f'<script type="module">\n{bundle}</script>')
    html = html.replace('<input id="target" name="target"', '<input id="target" name="target" value="Barnard\'s Star"')
    old = '<option value="irsa">NASA SPHEREx (IRSA)</option>\n              <option value="sim">Simulated demo</option>'
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
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    dest = os.path.join(ROOT, "dist", "skyshift.html")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"wrote {dest} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
