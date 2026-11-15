#!/usr/bin/env python3
"""Build self-contained copies of the pitch deck (every image built in as a data: URI).

    python3 scripts/build_pitch.py

Source: app/pitch/pitch.src.html (+ images in app/pitch/). Writes:
- app/pitch.html            served by the site; its live demo uses the same site
- dist/skyshift-pitch.html  for a laptop; its live demo uses the public deployment
"""
import base64, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MIME = {'webp': 'image/webp', 'svg': 'image/svg+xml', 'png': 'image/png', 'jpg': 'image/jpeg', 'mp4': 'video/mp4'}


def data(rel):
    ext = rel.rsplit('.', 1)[1]
    with open(os.path.join(ROOT, 'app', rel), 'rb') as f:
        return f'data:{MIME[ext]};base64,' + base64.b64encode(f.read()).decode()


def build(public_demo):
    s = open(os.path.join(ROOT, 'app', 'pitch', 'pitch.src.html')).read()
    s = re.sub(r'(src|poster)="(pitch/[^"]+)"', lambda m: f'{m.group(1)}="{data(m.group(2))}"', s)
    flips = [data(f'pitch/flip/f{i}.webp') for i in range(7)]
    s = s.replace('const FLIP = [', 'const FLIPSRC = ' + str(flips).replace("'", '"') + ';\nconst FLIP = [', 1)
    s = s.replace('im.src = `pitch/flip/f${i}.webp`;', 'im.src = FLIPSRC[i];')
    s = s.replace("document.getElementById('flipimg').src = `pitch/flip/f${i}.webp`;", "document.getElementById('flipimg').src = FLIPSRC[i];")
    if public_demo:
        s = re.sub(r"const BASE = [^\n]+;", "const BASE = 'https://mohammed200923-skyshift.hf.space/';", s, count=1)
    left = re.findall(r'pitch/[\w./${}-]+\.(?:webp|svg|png|jpg|mp4)', re.sub(r'data:[^"]+', '', s))
    assert not left, left
    return s


for path, public in (('app/pitch.html', False), ('dist/skyshift-pitch.html', True)):
    out = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        f.write(build(public))
    print(f'wrote {path} ({os.path.getsize(out) // 1024} KB)')
