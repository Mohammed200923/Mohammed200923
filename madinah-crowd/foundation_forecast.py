"""Forecast holes with pre-trained time-series foundation models (Amazon Chronos-2 / Chronos-Bolt).
Each forecast uses only released rows at or before its `now` (the context is cut at now)."""
import numpy as np, pandas as pd, torch
from chronos import BaseChronosPipeline


def run(recs, holes, model="amazon/chronos-2", multivariate=True):
    pipe = BaseChronosPipeline.from_pretrained(model, device_map="cpu", torch_dtype=torch.float32)
    out = {}
    fc = holes[holes["kind"].isin(["forecast"])]
    for (rn, now_mod), g in fc.groupby(["recording", "now_minute_of_day"]):
        r = recs[rn]
        now = int(now_mod) - r.first
        ctx = r.Y[:now + 1]                                   # rows at or before now only
        cams = sorted(g["u"].unique())
        if multivariate:
            avail = [v for v in range(ctx.shape[1]) if np.isfinite(ctx[:, v]).sum() >= 3]
            arr = torch.tensor(ctx[:, avail].T, dtype=torch.float32)       # variates x time
            q, m = pipe.predict_quantiles([arr], prediction_length=15, quantile_levels=[0.5])
            med = np.asarray(m[0])                                           # variates x 15
            pred = {v: med[i] for i, v in enumerate(avail)}
        else:
            pred = {}
            for v in cams:
                x = ctx[:, v]
                first = np.argmax(np.isfinite(x)) if np.isfinite(x).any() else len(x)
                x = x[first:]
                if np.isfinite(x).sum() < 3:
                    continue
                q, m = pipe.predict_quantiles(torch.tensor(x, dtype=torch.float32)[None], prediction_length=15,
                                              quantile_levels=[0.5])
                pred[v] = np.asarray(m)[0]
        for row in g.itertuples():
            p = pred.get(row.u)
            if p is not None:
                out[row.id] = float(max(0.0, p[int(row.horizon) - 1]))
    return pd.Series(out, dtype=float)
