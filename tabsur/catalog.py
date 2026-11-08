"""Probe every clip in the footage library and write a contact sheet per clip
(one frame every few seconds) so shots can be chosen by eye.
usage: python3 catalog.py FOOTAGE_DIR OUT_DIR"""
import json, os, subprocess, sys
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
cat_path = os.path.join(out, 'catalog.json')
cat = json.load(open(cat_path)) if os.path.exists(cat_path) else {}
vids = []
for root, _, files in os.walk(src):
    for f in files:
        if f.lower().rsplit('.', 1)[-1] in ('mp4', 'mov', 'm4v') and not f.endswith('.part'):
            vids.append(os.path.relpath(os.path.join(root, f), src))
vids.sort()
for i, v in enumerate(vids):
    if v in cat:
        continue
    p = os.path.join(src, v)
    pr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                         'stream=width,height,r_frame_rate,codec_name,color_transfer:stream_side_data=rotation:format=duration',
                         '-of', 'json', p], capture_output=True, text=True)
    try:
        j = json.loads(pr.stdout)
        s = j['streams'][0]
        dur = float(j['format']['duration'])
    except Exception:
        print('skip (incomplete?)', v); continue
    rot = 0
    for sd in s.get('side_data_list', []) or []:
        rot = int(sd.get('rotation', 0))
    n = 12
    step = max(dur / n, 0.5)
    sheet = os.path.join(out, f'{len(cat):03d}.jpg')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-skip_frame', 'nokey', '-i', p, '-vf',
                    f"fps=1/{step},scale=320:-2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='%{{pts\\:hms}}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=4x3",
                    '-frames:v', '1', sheet])
    cat[v] = dict(idx=len(cat), sheet=os.path.basename(sheet), dur=round(dur, 2), w=s['width'], h=s['height'],
                  fps=s['r_frame_rate'], codec=s['codec_name'], transfer=s.get('color_transfer'), rot=rot)
    print(cat[v]['idx'], v, cat[v], flush=True)
    json.dump(cat, open(cat_path, 'w'), ensure_ascii=False, indent=1)
