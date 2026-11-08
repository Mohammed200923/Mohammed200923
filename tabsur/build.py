"""Assemble the Tabsur Camp film "على مَهَل / At Ease" from the raw-footage library.

usage: python3 build.py FOOTAGE_DIR WORK_DIR OUT.mp4

FOOTAGE_DIR  the Drive folder as downloaded (same relative paths)
WORK_DIR     holds sheets/catalog.json (from catalog.py), cards/*.png (from
             captions.cjs); intermediate shots and the score are written here.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BPM = 76
BEAT = 60 / BPM
FPS = 30
W, H = 1920, 1080

# Clips by library path (stable even if the catalogue is rebuilt).
C = {
    "central_street": "المركزية/الحسن رضي الله عنه/فيديو/DJI_20260303090735_0124_D.MP4",
    "central_eye": "المركزية/الحسن رضي الله عنه/فيديو/DJI_20260303091058_0130_D.MP4",
    "central_top": "المركزية/الحسن رضي الله عنه/فيديو/DJI_20260303091145_0132_D.MP4",
    "geo_top": "المركزية/الحسين رضي الله عنه/فيديو/DJI_20260303080816_0070_D.MP4",
    "promenade": "المركزية/الشيخ عبد العزيز/فيديو/DJI_20260303082510_0083_D.MP4",
    "boulevard": "المركزية/الشيخ عبد العزيز/فيديو/DJI_20260303082659_0090_D.MP4",
    "minarets": "المركزية/الشيخ عبد العزيز/فيديو/DJI_20260303082939_0097_D.MP4",
    "wide_street": "المركزية/الشيخ عبد العزيز/فيديو/DJI_20260303084508_0104_D.MP4",
    "plaza_walk": "المركزية/ساحات الفعاليات/ساحة 3/فيديو/DJI_20260303094330_0210_D.MP4",
    "star_plaza": "المركزية/ساحات الفعاليات/ساحة 3/فيديو/‏مستند من ساره المطيري.mp4",
    "park_road": "المركزية/ساحات الفعاليات/ساحة رقم 1/فيديو/DJI_20260303074112_0003_D.MP4",
    "park_trees": "المركزية/ساحات الفعاليات/ساحة رقم 1/فيديو/DJI_20260303074700_0019_D.MP4",
    "park_tri": "المركزية/ساحات الفعاليات/ساحة رقم 1/فيديو/DJI_20260303074838_0024_D.MP4",
    "park_top": "المركزية/ساحات الفعاليات/ساحة رقم 1/فيديو/DJI_20260303075019_0029_D.MP4",
    "night_plaza_top": "المركزية/ساحات الفعاليات/ساحة2/فيديو/DJI_20250715033638_0106_D (1).MP4",
    "interchange_top": "تقاطع سلطانه/فيديو/542d00e8-3dd0-4131-a8e0-a8672e8050ba.mp4",
    "interchange": "تقاطع سلطانه/فيديو/9b9f523f-6164-4bae-a88d-8cec6523aae0.mp4",
    "quba": "جادة قباء/فيديو/جادة قباء .mov",
    "city_dawn": "حي العريض شارع الامير مقرن بن عبدالعزيز 22-06-2026م/DJI_20260622065309_0072_D.MP4",
    "avenue_top": "حي العريض شارع الامير مقرن بن عبدالعزيز 22-06-2026م/DJI_20260622065601_0073_D.MP4",
    "khalid_top": "خالد بن الوليد/فيديو/DJI_20260127210042_0384_D.MP4",
    "khalid_diag": "خالد بن الوليد/فيديو/DJI_20260127210437_0398_D.MP4",
    "khalid_top2": "خالد بن الوليد/فيديو/DJI_20260208205104_0577_D.MP4",
    "khalid_film": "خالد بن الوليد/فيديو/طريق خالد بن الوليد .mov",
    "night_square": "ساحة المغيسلة/فيديوهات/2 (2).mp4",
    "night_aerial": "ساحة المغيسلة/فيديوهات/6 (1).mp4",
    "saeed_film": "سعيد بن العاص/فيديو/سعيد بن العاص .mov",
    "sultan_top": "طريق الأمير سلطان/فيديو/DJI_20260216143900_0760_D.MP4",
    "salam_walk": "طريق السلام/فيديوهات/DJI_20260214190248_0541_D.MP4",
    "salam_top": "طريق السلام/فيديوهات/DJI_20260214190645_0552_D.MP4",
    "flyover": "طريق السلام/فيديوهات/dji_fly_20260201_115814_0228_1773183319495_video.mp4",
    "quba_road": "طريق قباء/فيديوهات/طريق قباء  2.MOV",
    "ali_top": "علي بن ابي طالب/فيديو/DJI_20260210144830_0975_D.MP4",
    "ali_film": "علي بن ابي طالب/فيديو/طريق علي بن ابي طالب.mov",
}

DAY = "eq=contrast=1.06:saturation=1.12:gamma=0.98,colorbalance=rh=0.03:bh=-0.03:rs=0.01:bs=-0.01"
NIGHT = "eq=contrast=1.04:saturation=1.08"

# (clip, source in-point s, length in beats, speed = source s per output s, grade, section)
EDL = [
    # A. Opening: the city from above, at first light
    ("city_dawn", 1.0, 10, 0.5, DAY, "A"),
    ("flyover", 3.0, 6, 0.6, DAY, "A"),
    ("interchange", 20.0, 6, 1.0, DAY, "A"),
    # B. Rush: a city built for cars (double speed, two beats a cut)
    ("khalid_top", 2.0, 2, 2.0, DAY, "B"),
    ("khalid_top2", 1.0, 2, 2.0, DAY, "B"),
    ("ali_top", 4.0, 2, 2.0, DAY, "B"),
    ("sultan_top", 0.5, 2, 2.0, DAY, "B"),
    ("avenue_top", 20.0, 2, 2.0, DAY, "B"),
    ("salam_top", 1.0, 2, 2.0, DAY, "B"),
    ("interchange_top", 16.0, 2, 2.0, DAY, "B"),
    ("khalid_diag", 2.0, 2, 2.0, DAY, "B"),
    # C. Act 1: the pavement, the shade
    ("khalid_film", 4.0, 8, 0.5, DAY, "C"),
    ("salam_walk", 2.0, 8, 1.0, DAY, "C"),
    ("saeed_film", 18.0, 6, 0.5, DAY, "C"),
    ("quba_road", 6.5, 6, 0.5, DAY, "C"),
    ("ali_film", 17.5, 6, 0.5, DAY, "C"),
    ("quba", 44.0, 6, 0.5, DAY, "C"),
    ("quba", 48.6, 6, 0.5, DAY, "C"),
    # D. Act 2: the heart of the city
    ("geo_top", 4.0, 8, 0.5, DAY, "D"),
    ("central_street", 6.0, 6, 0.5, DAY, "D"),
    ("central_eye", 3.5, 8, 0.5, DAY, "D"),
    ("promenade", 20.0, 8, 0.5, DAY, "D"),
    ("central_top", 6.0, 4, 0.5, DAY, "D"),
    ("wide_street", 10.0, 4, 0.5, DAY, "D"),
    ("plaza_walk", 8.0, 6, 0.5, DAY, "D"),
    ("star_plaza", 2.0, 4, 0.5, DAY, "D"),
    # E. green
    ("park_trees", 1.0, 6, 0.5, DAY, "E"),
    ("park_top", 6.0, 4, 0.5, DAY, "E"),
    ("park_tri", 4.0, 4, 0.5, DAY, "E"),
    ("park_road", 5.0, 4, 0.5, DAY, "E"),
    # F. Act 3: night
    ("night_square", 8.0, 10, 0.5, NIGHT, "F"),
    ("night_aerial", 3.0, 8, 0.5, NIGHT, "F"),
    ("night_plaza_top", 0.5, 6, 0.5, NIGHT, "F"),
    ("night_square", 17.0, 8, 0.5, NIGHT, "F"),
    # G. Outro
    ("minarets", 0.0, 12, 0.5, DAY, "G"),
    ("boulevard", 1.0, 12, 0.5, DAY, "G"),
]
CREDITS_SECONDS = 7.0

# (caption id, shot index it starts on, offset into that shot s, duration s)
CAPTIONS = [
    ("c1", 0, 1.6, 7.6),
    ("c2", 11, 0.8, 5.0),
    ("c3", 13, 0.6, 6.0),
    ("c4", 19, 0.6, 6.4),
    ("c5", 26, 0.6, 5.2),
    ("c6", 30, 1.0, 7.0),
    ("c7", 34, 1.0, 7.0),
]
TITLE_SHOT, TITLE_OFFSET = 35, 1.2


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit(f"failed: {' '.join(cmd[:6])}...")


def main():
    footage, work, out = sys.argv[1:4]
    cat = json.load(open(os.path.join(work, "sheets", "catalog.json")))
    shots_dir = os.path.join(work, "shots")
    os.makedirs(shots_dir, exist_ok=True)

    starts, t = [], 0.0
    files = []
    for i, (clip, tin, beats, speed, grade, _sec) in enumerate(EDL):
        rel = C[clip]
        meta = cat[rel]
        dur = beats * BEAT
        src_len = dur * speed
        if tin + src_len > meta["dur"] - 0.05:
            raise SystemExit(f"shot {i} {clip}: needs {tin}+{src_len:.2f}s, clip is {meta['dur']}s")
        frames = round(dur * FPS)
        dst = os.path.join(shots_dir, f"{i:02d}.mp4")
        vf = (f"setpts=(PTS-STARTPTS)/{speed},fps={FPS},"
              f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},"
              f"{grade},format=yuv420p")
        key = json.dumps([rel, tin, beats, speed, grade])
        stamp = dst + ".key"
        if not (os.path.exists(dst) and os.path.exists(stamp) and open(stamp).read() == key):
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{tin:.3f}", "-t", f"{src_len + 0.2:.3f}",
                 "-i", os.path.join(footage, rel), "-an", "-vf", vf, "-frames:v", str(frames),
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-r", str(FPS), dst])
            open(stamp, "w").write(key)
            print(f"shot {i:02d} {clip:16s} {dur:5.2f}s", flush=True)
        starts.append(t)
        t += frames / FPS
        files.append(dst)

    # credits card as the last shot
    cred = os.path.join(shots_dir, "credits.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", str(CREDITS_SECONDS),
         "-i", os.path.join(work, "cards", "credits.png"),
         "-vf", f"format=yuv420p,fade=in:st=0:d=0.8,fade=out:st={CREDITS_SECONDS - 1.2}:d=1.2",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-r", str(FPS), cred])
    credits_start = t
    files.append(cred)
    total = t + CREDITS_SECONDS

    lst = os.path.join(work, "shots.txt")
    with open(lst, "w") as f:
        for p in files:
            f.write(f"file '{os.path.abspath(p)}'\n")
    body = os.path.join(work, "body.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", body])

    # score, with its acts aligned to the edit
    sec_start = {}
    for i, s in enumerate(EDL):
        sec_start.setdefault(s[5], starts[i])
    marks = [sec_start["C"], sec_start["D"], sec_start["F"], sec_start["G"]]
    score = os.path.join(work, "score.wav")
    run([sys.executable, os.path.join(HERE, "music.py"), score, f"{total:.3f}"] + [f"{m:.3f}" for m in marks])

    # captions + title over the body, then mix
    inputs = ["-i", body, "-i", score]
    fc = []
    last = "0:v"
    n = 2
    overlays = [(cid, starts[si] + off, d) for cid, si, off, d in CAPTIONS]
    title_t = starts[TITLE_SHOT] + TITLE_OFFSET
    title_d = credits_start - title_t
    overlays.append(("title", title_t, title_d))
    for cid, st, d in overlays:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", os.path.join(work, "cards", f"{cid}.png")]
        fi = 0.7 if cid != "title" else 1.4
        fc.append(f"[{n}:v]format=rgba,fade=in:st=0:d={fi}:alpha=1,fade=out:st={d - 0.7:.3f}:d=0.7:alpha=1,"
                  f"setpts=PTS-STARTPTS+{st:.3f}/TB[o{n}]")
        fc.append(f"[{last}][o{n}]overlay=0:0:eof_action=pass:enable='between(t,{st:.3f},{st + d:.3f})'[v{n}]")
        last = f"v{n}"
        n += 1
    fc.append(f"[{last}]fade=in:st=0:d=1.2,format=yuv420p[vout]")
    fc.append(f"[1:a]atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc),
         "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
         "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", "-t", f"{total:.3f}", out])
    print(f"wrote {out}: {total:.2f}s, acts at {[round(m, 1) for m in marks]}")


if __name__ == "__main__":
    main()
