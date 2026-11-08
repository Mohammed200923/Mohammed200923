// Render the film's bilingual captions and cards as 1920x1080 PNGs with
// Chromium, so Arabic is shaped and joined correctly.
// usage: node captions.js FONTS_DIR OUT_DIR
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [fontsDir, outDir] = process.argv.slice(2);
const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const font = (name, file, weight) =>
  `@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${fs.readFileSync(path.resolve(fontsDir, file)).toString('base64')});font-weight:${weight}}`;

const css = `
${font('Plex', 'IBMPlexSansArabic-Light.ttf', 300)}
${font('Plex', 'IBMPlexSansArabic-Medium.ttf', 500)}
${font('Plex', 'IBMPlexSansArabic-Bold.ttf', 700)}
${font('Amiri', 'Amiri-Regular.ttf', 400)}
@font-face{font-family:'PlexLatin';src:url(data:font/ttf;base64,${fs.readFileSync(path.resolve(fontsDir, 'IBMPlexSans-VF.ttf')).toString('base64')});font-weight:100 700;unicode-range:U+0000-024F,U+2000-206F}
${font('Amiri', 'Amiri-Bold.ttf', 700)}
html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:118px}
.scrim{position:absolute;left:0;right:0;bottom:0;height:420px;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0))}
.ar{position:relative;font-family:'PlexLatin','Plex';font-weight:500;font-size:60px;color:#fff;direction:rtl;
    text-shadow:0 2px 18px rgba(0,0,0,.55);letter-spacing:0}
.en{position:relative;margin-top:14px;font-family:'PlexLatin','Plex';font-weight:300;font-size:27px;color:rgba(255,255,255,.88);
    letter-spacing:.06em;text-shadow:0 1px 10px rgba(0,0,0,.6)}
.rule{position:relative;width:64px;height:2px;background:#E8C27A;margin:18px 0 0;opacity:.9}
/* title card */
.title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
       background:radial-gradient(ellipse at center,rgba(4,40,44,.35),rgba(2,22,26,.82))}
.t-ar{font-family:'Amiri';font-weight:700;font-size:190px;color:#fff;direction:rtl;line-height:1.1;text-shadow:0 4px 30px rgba(0,0,0,.4)}
.t-en{font-family:'PlexLatin','Plex';font-weight:300;font-size:40px;letter-spacing:.5em;color:#E8C27A;margin-top:34px;padding-left:.5em}
.t-sub{font-family:'PlexLatin','Plex';font-weight:300;font-size:28px;color:rgba(255,255,255,.85);margin-top:46px;direction:rtl}
.t-sub2{font-family:'PlexLatin','Plex';font-weight:300;font-size:22px;color:rgba(255,255,255,.7);margin-top:10px;letter-spacing:.08em}
/* credits */
.credits{position:absolute;inset:0;background:#06181b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.row{display:flex;flex-direction:column;align-items:center}
.k{font-family:'PlexLatin','Plex';font-weight:500;font-size:30px;color:#E8C27A;direction:rtl}
.v{font-family:'PlexLatin','Plex';font-weight:300;font-size:30px;color:#fff;direction:rtl;margin-top:6px;text-align:center;max-width:1500px;line-height:1.6}
.ve{font-family:'PlexLatin','Plex';font-weight:300;font-size:21px;color:rgba(255,255,255,.65);margin-top:6px;letter-spacing:.04em;text-align:center;max-width:1500px}
`;

function captionHtml(c) {
  return `<div class="scrim"></div><div class="wrap"><div class="ar">${c.ar}</div><div class="en">${c.en}</div><div class="rule"></div></div>`;
}
function titleHtml(t) {
  return `<div class="title"><div class="t-ar">${t.ar}</div><div class="t-en">${t.en}</div>
  <div class="t-sub">${t.sub_ar}</div><div class="t-sub2">${t.sub_en}</div></div>`;
}
function creditsHtml(rows) {
  return `<div class="credits">${rows.map(r => `<div class="row"><div class="k">${r.k}</div><div class="v">${r.ar}</div><div class="ve">${r.en}</div></div>`).join('')}</div>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const jobs = [
    ...script.captions.map(c => [c.id, captionHtml(c)]),
    ['title', titleHtml(script.title)],
    ['credits', creditsHtml(script.credits)],
  ];
  for (const [id, body] of jobs) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, `${id}.png`), omitBackground: true });
    console.log('rendered', id);
  }
  await browser.close();
})();
