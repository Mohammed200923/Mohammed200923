#!/usr/bin/env python3
"""Make the demo video on a slide start automatically, muted, and loop until the slide ends
(and give any shape that shares an id with another on its slide a unique one).

    python3 autoplay.py deck.pptx 3 "Demo video" 49333

pptxgenjs embeds the video but only as "play on click"; this adds PowerPoint's timing tree
(an after-previous "playFrom(0.0)" media call, and a media node that repeats indefinitely).
"""
import re, shutil, sys, tempfile, zipfile

deck, slide_no, shape_name, dur_ms = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
part = f'ppt/slides/slide{slide_no}.xml'


def dedupe_ids(x):
    """pptxgenjs can give two shapes on one slide the same id; give every repeat a fresh one."""
    ids = [int(i) for i in re.findall(r'<p:cNvPr id="(\d+)"', x)]
    nxt, seen = max(ids, default=0) + 1, set()
    def fix(m):
        nonlocal nxt
        i = int(m.group(1))
        if i in seen:
            i, nxt = nxt, nxt + 1
        seen.add(i)
        return f'<p:cNvPr id="{i}"'
    return re.sub(r'<p:cNvPr id="(\d+)"', fix, x)


fixed = {}
with zipfile.ZipFile(deck) as z:
    for n in z.namelist():
        if re.fullmatch(r'ppt/slides/slide\d+\.xml', n):
            fixed[n] = dedupe_ids(z.read(n).decode('utf-8'))
xml = fixed[part]
m = re.search(r'<p:cNvPr id="(\d+)" name="' + re.escape(shape_name) + '"', xml)
if not m:
    sys.exit(f'no shape named {shape_name!r} on slide {slide_no}')
spid = m.group(1)
if '<p:timing' in xml:
    sys.exit('slide already has a timing tree; not changing it')
timing = (
    '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
    '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
    '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
    '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
    '<p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
    f'<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6" dur="{dur_ms}" fill="hold"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:cmd>'
    '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
    '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
    f'<p:video><p:cMediaNode vol="0" mute="1"><p:cTn id="7" repeatCount="indefinite" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cMediaNode></p:video>'
    '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'
)
# p:timing goes after p:clrMapOvr / p:transition and before p:extLst
if '<p:extLst>' in xml.split('</p:cSld>', 1)[1]:
    head, tail = xml.rsplit('<p:extLst>', 1)
    xml = head + timing + '<p:extLst>' + tail
else:
    xml = xml.replace('</p:sld>', timing + '</p:sld>')
tmp = tempfile.mktemp(suffix='.pptx')
with zipfile.ZipFile(deck) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        fixed[part] = xml
        data = fixed[item.filename].encode('utf-8') if item.filename in fixed else zin.read(item.filename)
        zout.writestr(item, data)
shutil.move(tmp, deck)
print(f'slide {slide_no}: "{shape_name}" (id {spid}) now starts automatically, muted, and loops')
