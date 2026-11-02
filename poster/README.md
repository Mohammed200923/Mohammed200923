# SAIF 2026 scientific poster: Printed Chitosan–rGO Memristors

- `SAIF_Poster_CS-rGO_Memristors.pdf` is the finished 36 × 48 in poster. It is the official SAIF template with the Ibdaa 2027 project-form content added.
- `source/overlay.html` holds all the poster text and layout. Edit it, then rebuild:

```bash
cd poster/source
NODE_PATH=$(npm root -g) node build.js "$PWD/overlay.html" "$PWD/overlay.pdf"
python3 merge.py /path/to/SAIF_Scientific_Poster_Template_-_2026.pdf overlay.pdf ../SAIF_Poster_CS-rGO_Memristors.pdf
```

`build.js` also reports any section whose content overflows its box.
