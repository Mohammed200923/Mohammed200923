# على مَهَل · At Ease — Tabsur Camp (remote track) entry

A 2:49 film for **معسكر تبصّر · Tabsur Camp** (9–12 Nov 2026), built only from the camp's
raw-footage library. Theme: **2 · جودة الحياة · Quality of Life**. The guide asks that the work
start from the person, not the facility.

## The story

| Time | Section | Caption |
|---|---|---|
| 0:00 | City at first light, interchanges | كانت الشوارعُ تُقاسُ بعددِ السيّارات… · *Streets used to be measured by the cars they carried…* |
| 0:17 | **Rush**: top-down traffic, double speed, a cut every 2 beats | |
| 0:30 | **Turn**: bike lanes, walkways, shade (slow motion) | …واليومَ، تُقاسُ بعددِ الخُطُوات. · *…today, by the steps they welcome.* |
| | | رصيفٌ يتّسعُ لك، وظِلٌّ يُرافقُك. · *A pavement with room for you, and shade along the way.* |
| 1:05 | **Heart of the city**: geometric paving, people crossing and walking | وفي قلبِ المدينة… صار الطريقُ ساحةً للِقاء. |
| 1:44 | **Green**: parks between the buildings | مساحاتٌ خضراءُ تتنفّسُ بين الحجر. |
| 1:56 | **Night**: the lit square, families walking | وحين يهدأ النهار… تبقى المدينةُ مُضاءةً لأهلها وزوّارها. |
| 2:22 | **Close**: the promenade toward the Prophet's Mosque minarets | جودةُ الحياة… أن تمشيَ في مدينتك على مَهَل. |
| 2:33 | Title card, credits and AI disclosure | |

Judging fit: a clear arc from car to person (idea and story, 30 pts). Every shot comes from the
library and is tied to one theme (connection to Madinah, 25). The opening contrasts the city
before and after, and the score is original (creativity, 20). The film is 1080p, colour-matched
and cut on the beat (production, 15). It closes on one line the viewer can keep (impact, 10).

## Specs (checked against the guide, page 11)
- MP4, H.264 High, 1920×1080, 30 fps, AAC 320 kbps stereo, −15 LUFS
- 169.4 s (allowed 60–180 s)
- Music: original, synthesised in `music.py` (maqam Hijaz, oud-like plucks, frame drum), so there are no third-party rights
- AI disclosure is in the end credits, as rule 6 on page 12 requires

## Rebuild
```bash
python3 catalog.py FOOTAGE_DIR WORK/sheets       # probe clips + contact sheets
NODE_PATH=$(npm root -g) node captions.cjs FONTS_DIR WORK/cards
python3 build.py FOOTAGE_DIR WORK out/film.mp4
```
`FONTS_DIR` needs IBM Plex Sans Arabic (Light, Medium, Bold), IBM Plex Sans (variable) and Amiri
from Google Fonts. Edit the shots in `EDL` in `build.py`, and the wording in `script.json`.
