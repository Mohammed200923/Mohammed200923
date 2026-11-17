# SAIF 2026 scientific poster: Printed Chitosan–rGO Memristors

- `SAIF_Poster_CS-rGO_Memristors.pdf` is the finished 36 × 48 in poster. It is the official SAIF template with the Ibdaa 2027 project-form content added.
- `source/overlay.html` holds all the poster text and layout. Edit it, then rebuild:

```bash
cd poster/source
NODE_PATH=$(npm root -g) node build.cjs "$PWD/overlay.html" "$PWD/overlay.pdf"
python3 clean_template.py /path/to/SAIF_Scientific_Poster_Template_-_2026.pdf template_clean.pdf
python3 merge.py template_clean.pdf overlay.pdf ../SAIF_Poster_CS-rGO_Memristors.pdf
```

`build.cjs` lays out the six section cards automatically and reports any section whose content overflows. `clean_template.py` removes the template's placeholder text (for example "Text here") so it doesn't stay hidden under the new layout. Figures in `figc/` are the originals with their blank margins trimmed.

## Corrected simulation figures (Figs. 6–8)

`source/sim/` re-runs the models from the parameters in the project form (Table 2). It applies two corrections from the external review:

- **Strukov loop area**: measured on one lobe instead of the whole figure-eight, where the two lobes cancel. The step is T/4000, and the results don't change with a 10× finer step.
- **Parameter map**: sampled on a 0.1 wt% grid. On the old 2 wt% grid, the ratio's apparent peak at 20 wt% was an artifact of where the sweep stopped.

```bash
cd poster/source/sim
python3 make_figs.py out   # writes fig6.png, fig7.png, fig8.png
```

Port the same two fixes into `cs-rgo-memristor-sim` too, so the numbers behind the QR code match the poster.
