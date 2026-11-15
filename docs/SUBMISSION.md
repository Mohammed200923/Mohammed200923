# Space Apps project page: text to paste

Team **Shihab** · Madinah · Challenge: **Planet X and SPHEREx**

---

## Project name

SkyShift

## High-level summary

SkyShift turns NASA’s newest space telescope, SPHEREx, into a time-lapse of the sky that anyone can use. Pick any star or spot in a 3D sky of real stars and press play: SkyShift fetches every SPHEREx photo of that spot live from NASA’s archive, adds NASA WISE and NEOWISE photos back to 2010, lines them all up, and plays them like a film, so anything that moves or changes brightness stands out. It then finds the moving objects by itself, measures their speed, and checks them against Gaia, CatWISE and NASA JPL’s list of known asteroids. Nearby cold worlds, such as brown dwarfs or a possible “Planet X”, reveal themselves this way. On the challenge’s targets, SkyShift found all three moving stars on its own, within 0.6–3% of their published speeds, with no false alarms around the two variable stars. It works in English and Arabic, needs no code, and includes guided Star Stories and an AI guide, so students and citizen scientists can search the sky too.

## Project demo

- Pitch deck (7 slides, with the live app inside slide 3): https://skyshift.earth/pitch.html
- Live app: https://skyshift.earth (hosted at https://mohammed200923-skyshift.hf.space)

## Final project link

https://github.com/Mohammed200923/Mohammed200923 (branch `claude/brave-planck-ixz21k`)

## Project details

**What it does**

- **3D sky:** 44,861 real stars from ESA’s Hipparcos catalogue. Search any object or click any spot. English and Arabic, beginner to advanced levels, larger text, high contrast and reduced-motion options.
- **Time-lapse:** every SPHEREx Level 2 image covering the spot (DR1 and QR3, Wide and Deep surveys), stacked per survey visit and lined up on one north-up grid, plus WISE (2010) and NEOWISE (2014–2024) images.
- **Moving-object search:** sources are detected in each visit, linked across visits and fitted with straight-line motion; each mover is then found again in the WISE images, which makes its speed about 9× more precise, and checked against Gaia DR3, CatWISE2020 and NASA JPL.
- **Measurements:** click any source for its brightness over time and its spectrum across SPHEREx’s 0.75–5 µm colours.
- **Sharing:** a link to any view, embed code, video and CSV download.
- **Star Stories:** short guided tours of the five challenge targets, with sourced facts, real frames and SkyShift’s own measurement.
- **AI guide:** Google Gemini answers questions using what is on screen and SkyShift’s measurements, labelled as AI.

**How it works**

1. Search NASA/IPAC IRSA (SIA v2) for every SPHEREx image of the position.
2. Download cut-outs; our server keeps only the image, flags, variance and zodiacal-light planes and caches them, so a field opens in seconds for the next visitor.
3. Subtract NASA’s zodiacal-light model, mask flagged pixels, read each pixel’s exact wavelength.
4. Reproject with the full TAN-SIP coordinate solution onto one grid and stack each visit, weighted by its noise.
5. Detect, link and fit movers (χ² test), refit them with WISE epochs back to 2010, and cross-match them with catalogues.

**Results on the challenge targets**

| Target | SkyShift | Published | WISE epochs |
|---|---|---|---|
| Barnard’s Star | 10.32 ± 0.10″/yr | 10.39″/yr (Gaia DR3) | 18 of 22 |
| Epsilon Indi B | 4.65 ± 0.09″/yr | 4.68″/yr (Gaia DR3) | 22 of 22 |
| WISE 0855−0714 | 8.39 ± 0.13″/yr | 8.15″/yr (Luhman & Esplin 2016) | 18 of 22 |
| RW Aur, R Dra | no false movers | — | brightness curves measured |

**Tools:** plain JavaScript (ES modules) in the browser, three.js for the 3D sky, Aladin Lite for sky context, a small Python server (archive proxy and cache), Playwright and Node tests (20 unit tests, end-to-end tests on live NASA data). Coordinates and wavelengths are validated against astropy. Hosted on a Hugging Face Space.

**Goals:** make NASA’s newest all-sky survey searchable by anyone, in Arabic and English, and turn it into a tool for finding the Sun’s nearest hidden neighbours. Next: search whole regions automatically, classify movers by their SPHEREx colours, and send candidates to Backyard Worlds and the Minor Planet Center.

## Use of AI and NASA data

**NASA data (central to the project):**

- NASA SPHEREx Level 2 spectral images (DR1, QR3; Wide and Deep) via NASA/IPAC IRSA: every frame of the time-lapse.
- NASA WISE: AllWISE Atlas and NEOWISE single-exposure W2 images via IRSA: the 15-year baseline.
- CatWISE2020 catalogue (IRSA): known WISE motions.
- NASA JPL Small-Body Identification and Horizons: known asteroids and comets in each image.
- Gaia DR3 (ESA) via NASA MAST: known stars and motions.
- Partner data: NEOSSat (Canadian Space Agency) via CADC; Hipparcos (ESA) via CDS VizieR for the 3D sky.

**AI:**

- The code and documentation were drafted with Anthropic’s Claude (Claude Code) and reviewed, tested and directed by the team.
- Inside the product, the “Ask the guide” panel uses Google Gemini, clearly labelled as AI. Its answers are never used as measurements: all numbers come from NASA and ESA data and SkyShift’s own pipeline.

## References

- NASA/IPAC Infrared Science Archive (IRSA): SPHEREx, AllWISE, NEOWISE, CatWISE2020. https://irsa.ipac.caltech.edu
- SPHEREx mission, NASA/JPL-Caltech. https://spherex.caltech.edu
- NASA JPL Solar System Dynamics: SB Identification and Horizons. https://ssd.jpl.nasa.gov
- Gaia DR3, ESA (Gaia Collaboration 2023), via NASA MAST. https://mast.stsci.edu
- Hipparcos new reduction (van Leeuwen 2007), via CDS VizieR I/311.
- HYG star database v4.1 (CC BY-SA 4.0): star names.
- NEOSSat, Canadian Space Agency, via CADC.
- Luhman (2014) ApJL 786, L18; Luhman & Esplin (2016) AJ 152, 78: WISE 0855−0714.
- Barnard (1916) AJ 29, 181; Scholz et al. (2003) A&A 398, L29: Epsilon Indi B.
- Open-source software: three.js (MIT), Aladin Lite (GPL-3.0, CDS), Playwright (Apache-2.0).
- SPHEREx Explorer interface by Ibrahim Alahmadi (team member).
- Google Gemini API (AI guide); Anthropic Claude (development assistant).
