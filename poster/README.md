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
