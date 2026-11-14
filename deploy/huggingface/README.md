---
title: SkyShift
emoji: 🔭
colorFrom: indigo
colorTo: yellow
sdk: docker
app_port: 8080
pinned: false
short_description: SPHEREx sky time-lapse to spot moving objects
---

# SkyShift

Type sky coordinates or an object name and get an aligned time-lapse of NASA SPHEREx images, to spot moving and variable objects. Built for NASA Space Apps 2026, challenge "Planet X and SPHEREx".

Three views on the same live data: a 3D sky and an Explorer (interfaces by Ibrahim) and the SkyShift analysis engine.

Data: NASA SPHEREx, AllWISE, NEOWISE and CatWISE2020 via NASA/IPAC IRSA; Gaia DR3 via NASA MAST; JPL Small-Body Identification and Horizons; CSA NEOSSat via CADC; Aladin Lite (CDS).

This Space builds from the GitHub repository: the Dockerfile downloads it at build time.
