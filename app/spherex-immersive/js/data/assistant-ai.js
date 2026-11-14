/* "Ask the guide" powered by Google Gemini, through the SkyShift server (server.py /guide/ask; the API key stays on
   the server). Each question is sent with a short description of what the user is looking at (target, position,
   SkyShift's measurements) and the last few turns, so answers are about this screen. If the AI guide is not set up
   or does not answer, the built-in template guide answers instead, labelled as such. */
import { loc } from '../core/i18n.js';

const BASE = new URL('../../../', import.meta.url).href;
let available = null;
const turns = []; // last questions and answers, for follow-ups

/** Is the AI guide configured on this server? */
export async function aiAvailable() {
  if (available !== null) return available;
  try { const r = await fetch(BASE + 'guide/status', { cache: 'no-store' }); available = r.ok && (await r.json()).ai === true; }
  catch { available = false; }
  return available;
}

/** What the user is looking at, in a few lines the model can use. */
export function describeScreen(context) {
  const lines = ['[SkyShift context: what the user sees right now]'];
  const tg = context && context.target, pos = context && context.position;
  if (tg) lines.push(`Selected object: ${loc(tg.name)} (${loc(tg.typeLabel) || tg.classification}), RA ${tg.coordinates.ra.toFixed(4)}°, Dec ${tg.coordinates.dec.toFixed(4)}°.`);
  else if (pos) lines.push(`Selected position: RA ${pos.ra.toFixed(4)}°, Dec ${pos.dec.toFixed(4)}°.`);
  else lines.push('Nothing is selected; the user is looking at the whole sky.');
  const v = context && context.viewer;
  if (v && v.open && v.a) lines.push(`Observation viewer open: ${v.mode} mode, observation of ${v.a.startTime.slice(0, 10)}${v.b && v.mode !== 'single' ? ` compared with ${v.b.startTime.slice(0, 10)}` : ''}.`);
  const a = window.__skyshift; // the Analysis panel's state, once it has been opened
  if (a && a.target && a.seq && a.seq.length) {
    lines.push(`Analysis panel: ${a.target.name}, ${a.frames.length} SPHEREx exposures in ${a.seq.length} frames.`);
    (a.movers || []).slice(0, 5).forEach((m, i) => lines.push(`Moving object #${i + 1} found by SkyShift: ${m.total.toFixed(2)} ± ${m.err.toFixed(2)} arcsec/yr (${m.tier})${m.isTarget ? ', it is the selected target' : ''}${m.gaia && m.gaia.kind === 'gaia' ? ', matches Gaia DR3' : ''}${m.wise && m.wise.epochs ? `, confirmed in ${m.wise.epochs} WISE epochs back to 2010` : ''}.`));
  }
  if (context && context.language === 'ar') lines.push('Answer in Arabic.');
  if (context && context.level === 'beginner') lines.push('The user chose beginner level: keep it simple.');
  return lines.join('\n');
}

async function askAi(question, context) {
  const r = await fetch(BASE + 'guide/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context: describeScreen(context), history: turns.slice(-6) }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.text) throw new Error(out.error || `HTTP ${r.status}`);
  turns.push({ role: 'user', text: question }, { role: 'assistant', text: out.text });
  return out.text;
}

/** Adapter for the guide panel: Gemini first, the built-in guide if Gemini is unavailable. */
export function aiAdapter(fallback) {
  return {
    async ask(req) {
      if (await aiAvailable()) {
        try { return { status: 'ok', provenance: 'ai', text: await askAi(req.question || '', req.context), blocks: [] }; }
        catch (e) { console.warn('The AI guide did not answer; using the built-in guide', e); }
      }
      return fallback(req);
    },
  };
}
