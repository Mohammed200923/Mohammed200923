const pptxgen = require('pptxgenjs');
const React = require('react'); const RDS = require('react-dom/server'); const sharp = require('sharp');
const fi = require('react-icons/fi');
const { applyTheme } = require('/root/.claude/skills/synced/9a84c8c1-9d41-4e8b-a5ca-f4ddf196fb82_3c1b57a6-e2c0-4650-9388-208a8d0da096/pptx/scripts/apply_theme.js');
const IMG = __dirname + '/img/';

const THEME = { name: 'SkyShift', headFontFace: 'Arial', bodyFontFace: 'Calibri',
  colors: { dk1: '0A1A16', lt1: 'F4FFF9', dk2: '040807', lt2: 'EEF5F1', accent1: '38F2C2', accent2: 'FFD84D', accent3: '067A64', accent4: 'B07F00', accent5: '9EB7B0', accent6: '0F1E1B', hlink: '38F2C2', folHlink: '9EB7B0' } };
const HEX = { bg: '040807', card: '0F1E1B', line: '2A3B37', paper: 'EEF5F1', white: 'FFFFFF', muted: '9EB7B0', mist: 'DDEFE8', teal: '38F2C2', gold: 'FFD84D', green: '067A64', amber: 'B07F00', ink: '0A1A16', soft: '3F5B54' };

async function icon(Comp, color, px = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { size: px, color: '#' + color, strokeWidth: 1.8 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 in
  pres.title = 'SkyShift — NASA Space Apps 2026'; pres.author = 'Team Shihab'; pres.company = 'Team Shihab';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  const titlePh = (color) => ({ placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.78, w: 11.4, h: 0.85, fontSize: 32, bold: true, color, align: 'left', valign: 'top', margin: 0 }, text: 'Title' } });
  const num = (color) => ({ x: 12.45, y: 7.0, w: 0.5, h: 0.3, color, fontSize: 10, fontFace: 'Calibri' });
  pres.defineSlideMaster({ title: 'COVER_DARK', background: { color: HEX.bg }, objects: [] });
  pres.defineSlideMaster({ title: 'CONTENT_DARK', background: { color: HEX.bg }, objects: [titlePh(C.background1)], slideNumber: num(C.accent5) });
  pres.defineSlideMaster({ title: 'CONTENT_LIGHT', background: { color: HEX.paper }, objects: [titlePh(C.text1)], slideNumber: num(C.accent3) });

  const I = {
    globe: await icon(fi.FiGlobe, HEX.green), search: await icon(fi.FiSearch, HEX.green), code: await icon(fi.FiCode, HEX.green),
    cloud: await icon(fi.FiDownloadCloud, HEX.teal), tool: await icon(fi.FiTool, HEX.teal), layers: await icon(fi.FiLayers, HEX.teal), check: await icon(fi.FiCheckCircle, HEX.teal),
    star: await icon(fi.FiStar, HEX.gold), clock: await icon(fi.FiClock, HEX.teal), db: await icon(fi.FiDatabase, HEX.teal), target: await icon(fi.FiCrosshair, HEX.teal),
  };

  // shared helpers
  const eyebrow = (s, text, color) => s.addText(text.toUpperCase(), { x: 0.6, y: 0.42, w: 8, h: 0.3, fontSize: 12, bold: true, charSpacing: 3, color, margin: 0, isTextBox: true, objectName: 'Eyebrow' });
  const crit = (s, text, dark) => s.addText(text.toUpperCase(), { x: 9.4, y: 0.38, w: 3.33, h: 0.36, fontSize: 10, bold: true, charSpacing: 2, align: 'right', color: dark ? C.accent5 : C.accent3, margin: 0, isTextBox: true, objectName: 'Criterion' });
  const iconCircle = (s, data, x, y, d, fill, line) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: line, width: 1 }, objectName: 'Icon circle' });
    s.addImage({ data, x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56, altText: '' });
  };
  const card = (s, x, y, w, h, dark, name, extra = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12,
    fill: { color: dark ? HEX.card : HEX.white }, line: { color: dark ? HEX.line : 'D3E2DB', width: 1 },
    shadow: dark ? undefined : { type: 'outer', color: '0A2820', opacity: 0.08, blur: 8, offset: 2, angle: 90 }, objectName: name, ...extra });
  const title = (s, plain, accent) => s.addText(accent ? [{ text: plain }, { text: accent, options: { fontFace: 'Cambria', italic: true, bold: false, color: s._dark ? C.accent2 : C.accent3 } }] : plain, { placeholder: 'title' });

  // ---------- 1 · Title ----------
  pres.addSection({ title: 'Intro' });
  let s = pres.addSlide({ masterName: 'COVER_DARK', sectionTitle: 'Intro' });
  s.addImage({ path: IMG + 'globe.png', x: 7.25, y: 0.35, w: 5.6, h: 4.72, altText: 'Globe of the 450 brightest real stars, with the five challenge targets marked' });
  s.addText('NASA SPACE APPS 2026 · PLANET X AND SPHEREX', { x: 0.6, y: 1.55, w: 7, h: 0.35, fontSize: 13, bold: true, charSpacing: 3, color: C.accent1, margin: 0, isTextBox: true });
  s.addText('SkyShift', { x: 0.6, y: 1.95, w: 6.8, h: 1.45, fontSize: 88, bold: true, fontFace: 'Arial', color: C.background1, margin: 0, isTextBox: true, objectName: 'Project name' });
  s.addText('A time-lapse of the sky that spots what moves, using NASA’s newest space telescope.', { x: 0.6, y: 3.5, w: 6.5, h: 1.0, fontSize: 22, color: 'DDEFE8', margin: 0, valign: 'top', isTextBox: true });
  s.addText([{ text: 'Team Shihab · Madinah, Saudi Arabia   ' }, { text: 'skyshift.earth', options: { bold: true, color: C.accent2, hyperlink: { url: 'https://skyshift.earth' } } }], { x: 0.6, y: 4.65, w: 6.8, h: 0.4, fontSize: 16, color: C.accent5, margin: 0, isTextBox: true });
  card(s, 11.15, 5.25, 1.6, 1.9, false, 'QR card', { fill: { color: 'F2EFE6' }, line: { color: 'F2EFE6' } });
  s.addImage({ path: IMG + 'qr-skyshift.png', x: 11.3, y: 5.35, w: 1.3, h: 1.3, altText: 'QR code to https://skyshift.earth' });
  s.addText('Scan to try it', { x: 11.15, y: 6.68, w: 1.6, h: 0.35, fontSize: 12, bold: true, color: '0B1220', align: 'center', margin: 0, isTextBox: true });
  s.addNotes('0:00–0:10 (10 s). “Stars that stay still are far away. Anything that moves is close to us. SkyShift makes a time-lapse of any spot in the sky from NASA’s newest space telescope, SPHEREx, and points out what moved. Scan the code to follow along.”');

  // ---------- 2 · Problem ----------
  pres.addSection({ title: 'Problem and solution' });
  s = pres.addSlide({ masterName: 'CONTENT_LIGHT', sectionTitle: 'Problem and solution' }); s._dark = false;
  eyebrow(s, 'The problem', C.accent3); crit(s, 'Impact', false);
  title(s, 'Our nearest neighbours in space are ', 'still hidden');
  s.addImage({ path: IMG + 'stack.png', x: 0.45, y: 1.75, w: 8.6, h: 2.4, altText: 'Drawing: three photos of the same sky stacked in 3D; the stars stay still while one gold dot moves' });
  s.addText([{ text: 'The stars stay put. The gold dot moves between photos, so it must be close to us. ' }, { text: '(Drawing, not real data.)', options: { italic: true } }], { x: 9.35, y: 2.2, w: 3.4, h: 1.5, fontSize: 15, color: C.accent3, margin: 0, valign: 'middle', isTextBox: true });
  const facts = [[I.globe, 'SPHEREx photographs the whole sky', 'Every six months, in 102 colours of infrared light.'],
    [I.search, '2,494 photos of one tiny patch', 'Far too many to compare by eye.'],
    [I.code, 'Today it takes coding skills', 'So almost nobody outside research can search them.']];
  facts.forEach(([ic, t, d], i) => { const x = 0.6 + i * 4.1;
    card(s, x, 4.6, 3.9, 1.9, false, 'Fact card ' + (i + 1));
    iconCircle(s, ic, x + 0.25, 4.85, 0.62, 'E3F1EB', 'C9DED5');
    s.addText(t, { x: x + 1.05, y: 4.82, w: 2.65, h: 0.75, fontSize: 16, bold: true, fontFace: 'Arial', color: C.text1, margin: 0, valign: 'top', isTextBox: true });
    s.addText(d, { x: x + 1.05, y: 5.6, w: 2.65, h: 0.75, fontSize: 14, color: C.accent3, margin: 0, valign: 'top', isTextBox: true }); });
  s.addNotes('0:10–0:35 (25 s). “If you photograph the same patch of sky months apart, distant stars stay put. Something close to us, like a cold ‘failed star’ or a possible Planet X, shifts. NASA’s SPHEREx now photographs the whole sky every six months. But one spot alone already has 2,494 photos, and comparing them takes coding skills. So almost nobody can search them.”');

  // ---------- 3 · Solution ----------
  s = pres.addSlide({ masterName: 'CONTENT_DARK', sectionTitle: 'Problem and solution' }); s._dark = true;
  eyebrow(s, 'Our solution', C.accent1); crit(s, 'Creativity · live demo', true);
  title(s, 'Pick a place in the sky. ', 'Watch it move.');
  ['Pick a star or a spot', 'Press play', 'See what moved, measured for you'].forEach((t, i) => {
    const y = 1.85 + i * 0.6;
    s.addShape(pres.shapes.OVAL, { x: 0.6, y, w: 0.42, h: 0.42, fill: { color: HEX.gold }, line: { color: HEX.gold }, objectName: 'Step ' + (i + 1) });
    s.addText(String(i + 1), { x: 0.6, y, w: 0.42, h: 0.42, fontSize: 15, bold: true, color: '04100C', align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(t, { x: 1.2, y: y - 0.02, w: 3.6, h: 0.46, fontSize: 17, bold: true, color: C.background1, margin: 0, valign: 'middle', isTextBox: true }); });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 3.72, w: 4.0, h: 0.5, rectRadius: 0.25, fill: { color: HEX.teal }, line: { color: HEX.teal }, objectName: 'Live demo button' });
  s.addText('Live demo: skyshift.earth', { x: 0.6, y: 3.72, w: 4.0, h: 0.5, fontSize: 15, bold: true, color: '04100C', align: 'center', valign: 'middle', margin: 0, isTextBox: true, hyperlink: { url: 'https://skyshift.earth/?q=Barnard%27s%20Star' } });
  s.addImage({ path: IMG + 'story.png', x: 0.6, y: 4.45, w: 4.0, h: 2.25, altText: 'Star Story for Barnard’s Star: real NASA frames and SkyShift’s measured motion' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.45, w: 4.0, h: 2.25, rectRadius: 0.05, fill: { type: 'none' }, line: { color: HEX.gold, width: 1.5 }, objectName: 'Story frame' });
  s.addText('Star Story: real frames and SkyShift’s own measurement', { x: 0.6, y: 6.75, w: 4.0, h: 0.3, fontSize: 12, color: C.accent5, margin: 0, isTextBox: true });
  s.addImage({ path: IMG + 'analysis-crop.png', x: 4.95, y: 1.75, w: 7.8, h: 3.89, altText: 'SkyShift analysis panel: Barnard’s Star in real SPHEREx data, with its path and the moving-object list' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.95, y: 1.75, w: 7.8, h: 3.89, rectRadius: 0.05, fill: { type: 'none' }, line: { color: HEX.line, width: 1 }, objectName: 'Screenshot frame' });
  s.addText('Real NASA SPHEREx data · Barnard’s Star, found and measured by SkyShift (10.3″ a year, matches Gaia)', { x: 4.95, y: 5.75, w: 7.8, h: 0.3, fontSize: 12, color: C.accent5, margin: 0, isTextBox: true });
  s.addNotes('0:35–1:35 (60 s, includes the live demo). “SkyShift does it in three steps: pick a spot, press play, see what moved.” Click “Live demo” (or have skyshift.earth already open with Barnard’s Star in Analysis). 1) Tick “Smooth pixels”, press play: “These are real NASA photos of Barnard’s Star. Watch it slide while the other stars stay still.” (20 s) 2) Point at the Moving objects list: “SkyShift found it by itself: about 10.3 arcseconds a year.” (10 s) 3) If time: the 3D sky or WISE 0855: “It works on any spot in the sky.” (10 s). If the internet fails, talk over this slide’s screenshot.');

  // ---------- 4 · How it works ----------
  pres.addSection({ title: 'How it works and data' });
  s = pres.addSlide({ masterName: 'CONTENT_DARK', sectionTitle: 'How it works and data' }); s._dark = true;
  eyebrow(s, 'How it works', C.accent1); crit(s, 'Validity', true);
  title(s, 'Four steps, done automatically in seconds');
  const steps = [[I.cloud, 'Fetch the photos', 'Every SPHEREx photo of that spot, from NASA’s archive.'], [I.tool, 'Clean them up', 'Remove the glow of space dust and faulty pixels.'],
    [I.layers, 'Line them up', 'Every photo matched so still stars sit exactly on top.'], [I.check, 'Find and check', 'Spot what moves; confirm it in NASA photos back to 2010.']];
  steps.forEach(([ic, t, d], i) => { const x = 0.6 + (i % 2) * 3.8, y = 1.75 + Math.floor(i / 2) * 1.85;
    card(s, x, y, 3.6, 1.65, true, 'Step ' + (i + 1), i === 3 ? { line: { color: HEX.teal, width: 1.5 } } : {});
    iconCircle(s, ic, x + 0.22, y + 0.22, 0.55, '0B1614', '2F4A44');
    s.addText('STEP ' + (i + 1), { x: x + 0.92, y: y + 0.2, w: 2.5, h: 0.25, fontSize: 11, bold: true, charSpacing: 2, color: C.accent5, margin: 0, isTextBox: true });
    s.addText(t, { x: x + 0.92, y: y + 0.45, w: 2.55, h: 0.38, fontSize: 18, bold: true, fontFace: 'Arial', color: C.background1, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.22, y: y + 0.92, w: 3.2, h: 0.62, fontSize: 14, color: C.accent5, margin: 0, valign: 'top', isTextBox: true }); });
  card(s, 0.6, 5.55, 7.4, 1.05, true, 'Trust note');
  s.addText([{ text: 'Can we trust it? ', options: { bold: true, color: C.accent2 } }, { text: 'Our maths matches the software professional astronomers use, checked by 20 automated tests.' }], { x: 0.85, y: 5.6, w: 6.95, h: 0.95, fontSize: 15, color: 'DDEFE8', margin: 0, valign: 'middle', isTextBox: true });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.4, y: 1.75, w: 1.75, h: 0.34, rectRadius: 0.17, fill: { color: HEX.teal }, line: { color: HEX.teal }, objectName: 'Real data tag' });
  s.addText('REAL NASA DATA', { x: 8.4, y: 1.75, w: 1.75, h: 0.34, fontSize: 10, bold: true, charSpacing: 2, color: '04100C', align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  [['f2010.png', '2010 · NASA WISE'], ['f2026.png', '2026 · NASA SPHEREx']].forEach(([f, cap], i) => { const x = 8.4 + i * 2.25;
    s.addImage({ path: IMG + f, x, y: 2.3, w: 2.1, h: 2.1, altText: `Barnard’s Star in ${cap}` });
    s.addText(cap, { x, y: 4.45, w: 2.1, h: 0.3, fontSize: 13, bold: true, color: i ? C.accent2 : C.accent1, margin: 0, isTextBox: true }); });
  s.addText('Barnard’s Star, lined up by SkyShift: in 16 years it moved almost 3 arcminutes, from the bottom of the frame towards the centre, while the other stars stayed still.', { x: 8.4, y: 4.9, w: 4.35, h: 1.6, fontSize: 14, color: 'DDEFE8', margin: 0, valign: 'top', isTextBox: true });
  s.addNotes('1:35–1:55 (20 s). “Behind the scenes there are four automatic steps. It fetches every NASA photo of the spot, cleans them up, and lines them up exactly. Then it finds what moves and double-checks it in older NASA photos back to 2010. This is Barnard’s Star in 2010 and in 2026. Our maths matches the software professional astronomers use.”');

  // ---------- 5 · NASA data ----------
  s = pres.addSlide({ masterName: 'CONTENT_DARK', sectionTitle: 'How it works and data' }); s._dark = true;
  eyebrow(s, 'NASA data', C.accent1); crit(s, 'Relevance', true);
  title(s, 'Built on NASA data from start to finish');
  const data = [[I.star, 'SPHEREx photos', 'NASA · the heart of SkyShift', 'The newest all-sky infrared photos: every frame of the time-lapse.'],
    [I.clock, 'WISE and NEOWISE photos', 'NASA · 2010 to 2024', 'Older photos that add 15 years of history, for far more precise speeds.'],
    [I.db, 'Star catalogues', 'CatWISE (NASA) · Gaia (ESA, via NASA)', 'Is this moving object already known, or something new?'],
    [I.target, 'Known asteroids and comets', 'NASA JPL', 'Which ones pass through each photo, so they are not mistaken for new finds.']];
  data.forEach(([ic, t, w, d], i) => { const x = 0.6 + (i % 2) * 6.15, y = 1.75 + Math.floor(i / 2) * 1.6;
    card(s, x, y, 5.98, 1.45, true, 'Data card ' + (i + 1), i === 0 ? { line: { color: HEX.gold, width: 1.5 } } : {});
    iconCircle(s, ic, x + 0.22, y + 0.25, 0.6, '0B1614', '2F4A44');
    s.addText(t, { x: x + 1.0, y: y + 0.15, w: 4.8, h: 0.36, fontSize: 18, bold: true, fontFace: 'Arial', color: C.background1, margin: 0, isTextBox: true });
    s.addText(w, { x: x + 1.0, y: y + 0.5, w: 4.8, h: 0.3, fontSize: 14, bold: true, color: C.accent2, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 1.0, y: y + 0.8, w: 4.8, h: 0.55, fontSize: 14, color: C.accent5, margin: 0, valign: 'top', isTextBox: true }); });
  card(s, 0.6, 5.05, 12.13, 1.75, true, 'Timeline');
  s.addText('Barnard’s Star: every NASA photo SkyShift uses, 2010 → 2026', { x: 0.85, y: 5.15, w: 9, h: 0.35, fontSize: 14, bold: true, color: 'DDEFE8', margin: 0, isTextBox: true });
  const X0 = 0.95, X1 = 12.35, xOf = (y) => X0 + ((y - 2009.5) / (2027 - 2009.5)) * (X1 - X0);
  s.addShape(pres.shapes.LINE, { x: X0, y: 5.85, w: X1 - X0, h: 0, line: { color: '3F5550', width: 1.5 }, objectName: 'Timeline axis' });
  for (let y = 2010; y <= 2026; y += 2) s.addText(String(y), { x: xOf(y) - 0.3, y: 6.0, w: 0.6, h: 0.25, fontSize: 11, color: C.accent5, align: 'center', margin: 0, isTextBox: true });
  const obs = [[2010.45, 1]]; for (let y = 2014; y <= 2024; y += 0.5) obs.push([y, 1]); [2025.65, 2025.75, 2026.21, 2026.34, 2026.64, 2026.73].forEach((y) => obs.push([y, 2]));
  obs.forEach(([y, k]) => s.addShape(pres.shapes.OVAL, { x: xOf(y) - 0.07, y: 5.78, w: 0.14, h: 0.14, fill: { color: k === 2 ? HEX.gold : HEX.teal }, line: { color: k === 2 ? HEX.gold : HEX.teal, width: 0.5 }, objectName: 'Observation' }));
  s.addText([{ text: '●  ', options: { color: C.accent1 } }, { text: 'WISE / NEOWISE (2010–2024)      ' }, { text: '●  ', options: { color: C.accent2 } }, { text: 'SPHEREx (2025–2026)' }], { x: 0.85, y: 6.35, w: 6, h: 0.3, fontSize: 12, color: C.accent5, margin: 0, isTextBox: true });
  s.addText('Partner data on top: NEOSSat (CSA), Hipparcos (ESA). All fetched live.', { x: 6.9, y: 6.35, w: 5.6, h: 0.3, fontSize: 12, color: C.accent5, align: 'right', margin: 0, isTextBox: true });
  s.addNotes('1:55–2:10 (15 s). “It’s NASA data from start to finish. SPHEREx is the heart, WISE adds fifteen years of history, and catalogues tell us whether something is already known. Everything is fetched live, so new releases appear automatically.”');

  // ---------- 6 · Results ----------
  pres.addSection({ title: 'Results and impact' });
  s = pres.addSlide({ masterName: 'CONTENT_LIGHT', sectionTitle: 'Results and impact' }); s._dark = false;
  eyebrow(s, 'Does it work? We tested the challenge’s targets', C.accent3); crit(s, 'Validity · presentation', false);
  title(s, 'It found the moving stars by itself, ', 'and got them right');
  card(s, 0.6, 1.75, 7.75, 4.95, false, 'Chart card');
  s.addChart(pres.charts.BAR, [{ name: 'SkyShift’s measurement', labels: ['Barnard’s Star', 'Epsilon Indi B', 'WISE 0855'], values: [10.32, 4.65, 8.39] },
    { name: 'Official value', labels: ['Barnard’s Star', 'Epsilon Indi B', 'WISE 0855'], values: [10.39, 4.68, 8.15] }], {
    x: 0.75, y: 1.85, w: 7.45, h: 4.2, barDir: 'bar', barGrouping: 'clustered', barGapWidthPct: 60,
    chartColors: ['067A64', 'D9A21B'], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00', dataLabelFontSize: 12, dataLabelColor: '0A1A16', dataLabelFontFace: '+mn-lt',
    showTitle: true, title: 'Speed across the sky (arcseconds per year)', titleFontSize: 14, titleColor: '0A1A16', titleFontFace: '+mn-lt',
    showLegend: true, legendPos: 'b', legendFontSize: 12, legendFontFace: '+mn-lt', legendColor: '3F5B54',
    catAxisLabelColor: '0A1A16', catAxisLabelFontSize: 13, catAxisLabelFontFace: '+mn-lt', catAxisOrientation: 'maxMin',
    valAxisLabelColor: '3F5B54', valAxisLabelFontSize: 11, valAxisLabelFontFace: '+mn-lt', valAxisMinVal: 0, valAxisMaxVal: 12, valAxisMajorUnit: 3,
    valGridLine: { color: 'DCE8E2', size: 0.75 }, catGridLine: { style: 'none' }, altText: 'Bar chart: SkyShift’s measured speeds against the official values for three moving targets' });
  s.addText('One arcsecond is the size of a coin seen from 5 km away. Barnard’s Star 0.7% apart, Epsilon Indi B 0.6%, WISE 0855 3%.', { x: 0.85, y: 6.1, w: 7.3, h: 0.5, fontSize: 12, color: C.accent3, margin: 0, isTextBox: true });
  [['3 of 3', 'moving stars found by SkyShift itself'], ['≤ 3%', 'difference from the official values'], ['0', 'false alarms around the two stars that don’t move']].forEach(([n, c], i) => { const y = 1.75 + i * 1.7;
    card(s, 8.6, y, 4.13, 1.55, false, 'Stat ' + (i + 1));
    s.addText(n, { x: 8.85, y: y + 0.15, w: 3.7, h: 0.75, fontSize: 40, bold: true, fontFace: 'Arial', color: C.accent3, margin: 0, isTextBox: true });
    s.addText(c, { x: 8.85, y: y + 0.92, w: 3.7, h: 0.5, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true }); });
  s.addNotes('2:10–2:35 (25 s). “Does it work? On the challenge’s targets, SkyShift found all three moving stars by itself, within 3% of the official values, and it raised no false alarms around the two stars that don’t move.” If asked: Barnard’s Star 10.32 vs 10.39 (Gaia DR3); Epsilon Indi B 4.65 vs 4.68 (Gaia DR3); WISE 0855 8.39 vs 8.15 (Luhman & Esplin 2016), arcseconds per year.');

  // ---------- 7 · Impact ----------
  s = pres.addSlide({ masterName: 'CONTENT_DARK', sectionTitle: 'Results and impact' }); s._dark = true;
  eyebrow(s, 'Impact and next steps', C.accent1); crit(s, 'Impact', true);
  title(s, 'Anyone can search the sky now. ', 'No code needed.');
  [['100%', 'of the sky can be searched'], ['< 1 min', 'to a first look at any spot'], ['0', 'lines of code needed'], ['Any', 'language for the AI guide']].forEach(([n, c], i) => { const x = 0.6 + i * 3.08;
    card(s, x, 1.65, 2.9, 1.0, true, 'KPI ' + (i + 1));
    s.addText(n, { x: x + 0.2, y: 1.7, w: 2.6, h: 0.55, fontSize: 30, bold: true, fontFace: 'Arial', color: C.accent2, margin: 0, isTextBox: true });
    s.addText(c, { x: x + 0.2, y: 2.24, w: 2.6, h: 0.32, fontSize: 13, color: C.accent5, margin: 0, isTextBox: true }); });
  [['x-arabic.png', 'Students and the public', 'Real NASA data, questions in your own language, Star Stories.'], ['f2026.png', 'Citizen scientists', 'Hunt for hidden worlds; share a link to any find.'], ['x-guide.png', 'Teachers and scientists', 'AI guide and beginner mode; a quick look for research.']].forEach(([f, t, d], i) => { const x = 0.6 + i * 4.11;
    card(s, x, 2.85, 3.9, 1.4, true, 'Audience ' + (i + 1));
    s.addImage({ path: IMG + f, x: x + 0.06, y: 2.91, w: 1.28, h: 1.28, sizing: { type: 'cover', w: 1.28, h: 1.28 }, altText: t });
    s.addText(t, { x: x + 1.5, y: 2.95, w: 2.3, h: 0.32, fontSize: 14, bold: true, color: C.accent1, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 1.5, y: 3.3, w: 2.3, h: 0.88, fontSize: 13, color: 'DDEFE8', margin: 0, valign: 'top', isTextBox: true }); });
  card(s, 0.6, 4.45, 12.13, 0.95, true, 'Star Stories');
  s.addImage({ path: IMG + 'story.png', x: 0.66, y: 4.51, w: 1.48, h: 0.83, altText: 'A Star Story' });
  s.addText([{ text: 'Star Stories  ', options: { bold: true, color: C.accent2, fontSize: 15 } }, { text: 'Short guided tours of each challenge target: sourced facts in English and Arabic, real NASA frames, and SkyShift’s own measurement.' }], { x: 2.35, y: 4.5, w: 6.7, h: 0.85, fontSize: 13, color: 'DDEFE8', margin: 0, valign: 'middle', isTextBox: true });
  s.addText('Barnard’s Star · Epsilon Indi B · WISE 0855 · RW Aur · R Dra', { x: 9.2, y: 4.5, w: 3.4, h: 0.85, fontSize: 12, bold: true, color: C.accent5, align: 'right', valign: 'middle', margin: 0, isTextBox: true });
  [['NOW · LIVE', 'Search any spot, free and open source'], ['NEXT', 'Search whole regions; tell movers apart by colour'], ['LATER', 'Send new finds to Backyard Worlds and the Minor Planet Center']].forEach(([k, t], i) => { const x = 0.6 + i * 2.55;
    card(s, x, 5.65, 2.3, 1.3, true, 'Roadmap ' + (i + 1), i === 0 ? { line: { color: HEX.teal, width: 1.5 } } : {});
    s.addText(k, { x: x + 0.15, y: 5.73, w: 2.0, h: 0.25, fontSize: 11, bold: true, charSpacing: 2, color: i === 0 ? C.accent1 : C.accent5, margin: 0, isTextBox: true });
    s.addText(t, { x: x + 0.15, y: 6.0, w: 2.05, h: 0.9, fontSize: 12, bold: true, color: C.background1, margin: 0, valign: 'top', isTextBox: true });
    if (i < 2) s.addShape(pres.shapes.LINE, { x: x + 2.3, y: 6.3, w: 0.25, h: 0, line: { color: HEX.gold, width: 1.5, dashType: 'dash' }, objectName: 'Roadmap link' }); });
  s.addText([{ text: 'TEAM SHIHAB · MADINAH', options: { bold: true, color: C.accent1, fontSize: 11, charSpacing: 2, breakLine: true } }, { text: 'Mohammed Albadrani · Frontend Engineer', options: { breakLine: true } }, { text: 'Ibrahim Alahmadi · UI Designer', options: { breakLine: true } }, { text: 'Adel Abdulfalaraj · Quality Assurance' }], { x: 8.4, y: 5.65, w: 3.2, h: 1.3, fontSize: 12, color: 'DDEFE8', margin: 0, valign: 'middle', paraSpaceAfter: 2, isTextBox: true });
  card(s, 11.55, 5.5, 1.2, 1.55, false, 'QR card', { fill: { color: 'F2EFE6' }, line: { color: 'F2EFE6' } });
  s.addImage({ path: IMG + 'qr-skyshift.png', x: 11.63, y: 5.57, w: 1.04, h: 1.04, altText: 'QR code to https://skyshift.earth' });
  s.addText('Try it now', { x: 11.55, y: 6.66, w: 1.2, h: 0.3, fontSize: 11, bold: true, color: '0B1220', align: 'center', margin: 0, isTextBox: true });
  s.addNotes('2:35–3:00 (25 s). “So anyone can now search the whole sky in under a minute, with no code, with an AI guide that answers in any language. Students explore real NASA data. Citizen scientists hunt for hidden worlds and share what they find. Teachers get an AI guide and a beginner mode, and Star Stories give a guided tour of each target. Next, we’ll search large areas automatically, then send new finds to scientists. Scan the code and try it yourself. Thank you.”');

  const out = __dirname + '/SkyShift-pitch.pptx';
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log('wrote', out);
})();
