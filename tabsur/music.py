"""Original score for the Tabsur Camp film, synthesised from scratch (no samples,
no third-party recordings), so the participant owns every note.

Maqam Hijaz on D: a low drone, slow string-like pads, a plucked (Karplus-Strong)
melody that sounds close to an oud, and a soft frame-drum pulse in the middle act.

usage: python3 music.py OUT.wav DURATION_SECONDS [act1 act2 act3 outro]
       The optional marks are section starts in seconds.
"""
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)

# D Hijaz: D Eb F# G A Bb C
HIJAZ = [0, 1, 4, 5, 7, 8, 10]
D3 = 146.83


def hz(degree, octave=0):
    o, d = divmod(degree, 7)
    return D3 * 2 ** ((HIJAZ[d] + 12 * (o + octave)) / 12)


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = min(int(a * SR), n), min(int(r * SR), n)
    if na:
        e[:na] = np.linspace(0, 1, na) ** 2
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def pad_voice(f, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.12, 0.0, 0.11):  # detuned saw-ish stack, low-passed by few partials
        ff = f * 2 ** (det / 12)
        for k in range(1, 7):
            out += np.sin(2 * np.pi * ff * k * t + rng.uniform(0, 6.28)) / (k ** 1.6)
    vib = 1 + 0.15 * np.sin(2 * np.pi * 0.2 * t)
    return amp * out * env_adsr(n, dur * 0.4, dur * 0.45) * vib / 6


def pluck(f, dur, amp, bright=0.5):
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    # soften the excitation -> warmer, oud-like
    buf = np.convolve(buf, np.ones(3) / 3, mode="same")
    out = np.empty(n)
    decay = 0.996 + 0.0035 * bright
    idx = 0
    prev = 0.0
    for i in range(n):
        v = buf[idx]
        nv = decay * 0.5 * (v + prev)
        prev = v
        buf[idx] = nv
        out[i] = v
        idx = (idx + 1) % p
    # body resonance
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 110 * t) * np.exp(-t * 18) * 0.15
    return amp * (out + body) * env_adsr(n, 0.002, 0.08)


def drum(dur, amp, low=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if low:  # doum
        f = 70 * np.exp(-t * 8) + 48
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    else:  # tak
        s = rng.normal(0, 1, n) * np.exp(-t * 45)
        s = np.convolve(s, np.ones(4) / 4, mode="same")
    return amp * s


def place(track, sig, t0):
    i = int(t0 * SR)
    if i >= len(track):
        return
    j = min(len(track), i + len(sig))
    track[i:j] += sig[: j - i]


def reverb(x, seconds=3.2, wet=0.35):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.normal(0, 1, n) * np.exp(-t * 6.9 / seconds)
    ir[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return (1 - wet) * x + wet * y


def build(total, marks):
    a1, a2, a3, outro = marks
    n = int(total * SR)
    pad, mel, perc, drone = (np.zeros(n) for _ in range(4))
    t = np.arange(n) / SR

    # drone on D2 + A2, swelling with the acts
    dr = np.sin(2 * np.pi * D3 / 2 * t) + 0.5 * np.sin(2 * np.pi * D3 * 0.75 * t)
    dr_env = np.interp(t, [0, 4, a2, a3, outro, total - 3, total], [0, .5, .6, .8, .6, .3, 0])
    drone += 0.18 * dr * dr_env

    # pad progression (degrees in Hijaz), each chord 8 s
    chords = [(0, 2, 4), (6 - 7, 1, 4), (3, 5, 0 + 7), (4, 6, 1 + 7), (0, 2, 4), (5 - 7, 0, 2), (4, 6, 1 + 7), (0, 4, 7)]
    ct = 0.0
    k = 0
    while ct < total - 2:
        dur = min(9.0, total - ct)
        amp = 0.09 if ct < a1 else 0.12 if ct < a3 else 0.14 if ct < outro else 0.1
        for d in chords[k % len(chords)]:
            place(pad, pad_voice(hz(d, -1), dur, amp), ct)
        ct += 8.0
        k += 1

    # melody: phrases of the maqam, sparse in the intro, fuller later
    beat = 60 / 76
    phrases = [
        [(4, 1), (5, .5), (4, .5), (2, 1), (1, 1), (0, 2)],
        [(0, .5), (1, .5), (2, 1), (3, .5), (4, 1.5), (4, 2)],
        [(7, 1), (6, .5), (5, .5), (4, 1), (5, .5), (4, .5), (2, 2)],
        [(2, .5), (3, .5), (4, .5), (5, .5), (4, 1), (2, 1), (1, .5), (0, 1.5)],
    ]
    ct = 2.5
    pi = 0
    while ct < total - 6:
        density = 0.55 if ct < a1 else 0.8 if ct < a2 else 1.0 if ct < outro else 0.5
        ph = phrases[pi % len(phrases)]
        octv = 1 if a2 <= ct < outro and pi % 2 else 0
        for d, ln in ph:
            if rng.random() < density:
                f = hz(d, octv)
                place(mel, pluck(f, ln * beat * 2.2, 0.32), ct)
                if ln >= 1 and a1 <= ct < outro:  # tremolo double, an oud gesture
                    place(mel, pluck(f, ln * beat, 0.12), ct + beat * 0.25)
            ct += ln * beat
        ct += beat * (3 if ct < a1 else 2)
        pi += 1

    # frame drum in acts 2-3: doum . tak tak doum . tak .
    ct = a2
    pattern = [(0, True, .5), (1.5, False, .18), (2, False, .2), (2.5, True, .35), (3.5, False, .18)]
    while ct < outro - 1:
        ramp = min(1, (ct - a2) / 6)
        for off, low, a in pattern:
            place(perc, drum(0.6, a * ramp, low), ct + off * beat)
        ct += 4 * beat

    mix = reverb(pad + drone, 4.0, 0.45) + reverb(mel, 2.6, 0.3) + reverb(perc, 1.2, 0.15)
    # master fades
    fade = np.interp(t, [0, 1.5, total - 4, total], [0, 1, 1, 0])
    mix *= fade
    mix = np.tanh(mix * 1.2)
    mix /= np.max(np.abs(mix)) + 1e-9
    mix *= 0.89
    # gentle stereo width: short delay on one side
    d = int(0.012 * SR)
    left = mix
    right = np.concatenate([np.zeros(d), mix[:-d]]) * 0.95 + 0.05 * mix
    return np.stack([left, right], axis=1)


def main():
    out = sys.argv[1]
    total = float(sys.argv[2])
    marks = [float(x) for x in sys.argv[3:7]] if len(sys.argv) >= 7 else [total * .1, total * .35, total * .65, total * .88]
    st = build(total, marks)
    pcm = (st * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
