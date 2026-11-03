#!/usr/bin/env python3
"""Build madinah_notebook.ipynb (a Kaggle notebook) from solution.py."""
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "solution.py")).read()
src = src.split('\nif __name__ == "__main__":')[0]


def cell(kind, text):
    c = {"cell_type": kind, "metadata": {}, "source": text.splitlines(keepends=True)}
    if kind == "code":
        c.update(execution_count=None, outputs=[])
    return c


cells = [
    cell("markdown", "# Madinah crowd holes: one model per hole kind\n\n"
         "LightGBM per hole kind, trained on training recordings masked to look like the test days "
         "(30-minute blanks after each `now`, a hidden place, 5-20 minute drop-outs). "
         "Forecast and hidden-future features use only rows up to `now`. "
         "No internet needed. Writes `/kaggle/working/submission.csv`."),
    cell("code", src),
    cell("markdown", "## Optional: validate on the training days (about 3 minutes)\n"
         "Set `RUN_CV = True` to print the per-kind score ratios (lower is better, 1 = reference)."),
    cell("code", 'import warnings\nwarnings.filterwarnings("ignore")\n'
         'DATA = find_data_dir(None)\nrecs, units, holes = load(DATA)\nprint(DATA, units, len(holes))\n\n'
         'RUN_CV = False\nif RUN_CV:\n'
         '    hs = [sorted(g["u"].unique().tolist()) for _, g in holes[holes["kind"] == "hidden"].groupby("recording")]\n'
         '    run_cv(recs, len(units), n_sims=10, n_eval=4, seed=0, hsets=hs)'),
    cell("markdown", "## Train on all training days and write the submission"),
    cell("code", 'OUT = "/kaggle/working/submission.csv" if os.path.isdir("/kaggle/working") else "submission.csv"\n'
         'run_predict(recs, len(units), holes, DATA, OUT, n_sims=10, seed=0, n_seeds=3)\n'
         'pd.read_csv(OUT).head()'),
]
nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 5}
json.dump(nb, open(os.path.join(here, "madinah_notebook.ipynb"), "w"), indent=1)
print("wrote madinah_notebook.ipynb")
