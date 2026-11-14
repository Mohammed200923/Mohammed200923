/* "Ask the guide" powered by Microsoft Copilot Studio.
   The server (server.py, /copilot/token) hands out a Direct Line token for the team's Copilot Studio agent; this
   adapter talks to that agent over the Bot Framework Direct Line 3.0 REST API. Each question is sent with a short
   description of what the user is looking at (target, position, SkyShift's measurements), so answers are about
   this screen. If Copilot is not configured or does not answer, the built-in guide answers instead, labelled. */
import { loc } from '../core/i18n.js';

const TOKEN_URL = new URL('../../../copilot/token', import.meta.url).href;
const USER = { id: 'skyshift-user-' + Math.random().toString(36).slice(2, 10), name: 'Visitor' };
let session = null;   // { base, token, conversationId, watermark }
let available = null; // null = not checked yet

/** Is a Copilot Studio agent configured on this server? */
export async function copilotAvailable() {
  if (available !== null) return available;
  try { const r = await fetch(TOKEN_URL, { cache: 'no-store' }); available = r.ok; if (r.ok) session = await start(await r.json()); }
  catch { available = false; }
  return available;
}

async function start(t) {
  if (!t.token) throw new Error('no token');
  const r = await fetch(`${t.directLine}/conversations`, { method: 'POST', headers: { Authorization: `Bearer ${t.token}` } });
  if (!r.ok) throw new Error(`Direct Line ${r.status}`);
  const c = await r.json();
  return { base: t.directLine, token: c.token || t.token, conversationId: c.conversationId, watermark: null };
}

async function dl(path, opts = {}) {
  const r = await fetch(`${session.base}/conversations/${session.conversationId}${path}`, {
    ...opts, headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (r.status === 401 || r.status === 403) { session = null; throw new Error('expired'); }
  if (!r.ok) throw new Error(`Direct Line ${r.status}`);
  return r.json();
}

/** What the user is looking at, in a few lines the agent can use. */
function describeScreen(context) {
  const lines = ['[SkyShift context — what the user sees right now]'];
  const tg = context && context.target, pos = context && context.position;
  if (tg) lines.push(`Selected object: ${loc(tg.name)} (${loc(tg.typeLabel) || tg.classification}), RA ${tg.coordinates.ra.toFixed(4)}°, Dec ${tg.coordinates.dec.toFixed(4)}°.`);
  else if (pos) lines.push(`Selected position: RA ${pos.ra.toFixed(4)}°, Dec ${pos.dec.toFixed(4)}°.`);
  else lines.push('Nothing is selected; the user is looking at the whole sky.');
  const a = window.__skyshift; // the Analysis panel's state, when it has been opened
  if (a && a.target && a.seq && a.seq.length) {
    lines.push(`Analysis panel: ${a.target.name}, ${a.frames.length} SPHEREx exposures in ${a.seq.length} frames.`);
    (a.movers || []).slice(0, 5).forEach((m, i) => lines.push(`Moving object #${i + 1}: ${m.total.toFixed(2)} ± ${m.err.toFixed(2)} arcsec/yr, ${m.tier}${m.isTarget ? ', it is the selected target' : ''}${m.gaia && m.gaia.kind === 'gaia' ? ', matches Gaia DR3' : ''}${m.wise && m.wise.epochs ? `, confirmed in ${m.wise.epochs} WISE epochs` : ''}.`));
  }
  if (context && context.language === 'ar') lines.push('Answer in Arabic.');
  if (context && context.level === 'beginner') lines.push('The user chose beginner level: keep it simple.');
  return lines.join('\n');
}

/** Send one question and wait for the agent's reply (polling Direct Line). */
async function askCopilot(question, context) {
  if (!session) { const r = await fetch(TOKEN_URL, { cache: 'no-store' }); if (!r.ok) throw new Error('not configured'); session = await start(await r.json()); }
  const sent = await dl('/activities', { method: 'POST', body: JSON.stringify({ type: 'message', from: USER, locale: context && context.language === 'ar' ? 'ar-SA' : 'en-US', text: `${describeScreen(context)}\n\nQuestion: ${question}` }) });
  const myId = sent.id, deadline = Date.now() + 45000, texts = [], seen = new Set([myId]);
  let quietSince = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 900));
    const page = await dl(`/activities${session.watermark ? `?watermark=${encodeURIComponent(session.watermark)}` : ''}`);
    session.watermark = page.watermark || session.watermark;
    for (const act of page.activities || []) {
      if (seen.has(act.id)) continue;
      seen.add(act.id);
      if (act.from && act.from.id === USER.id) continue;
      if (act.type === 'message' && act.text) { texts.push(act.text); quietSince = Date.now(); }
    }
    // Agents may answer in several messages: wait until one poll passes with nothing new.
    if (texts.length && Date.now() - quietSince > 1500) break;
  }
  if (!texts.length) throw new Error('no answer');
  return texts.join('\n\n');
}

/** Adapter for the guide panel: Copilot first, the built-in guide if Copilot is unavailable. */
export function copilotAdapter(fallback) {
  return {
    async ask(req) {
      const question = req.question || '';
      if (await copilotAvailable()) {
        try {
          const text = await askCopilot(question, req.context);
          return { status: 'ok', provenance: 'copilot', text, blocks: [] };
        } catch (e) { console.warn('Copilot did not answer; using the built-in guide', e); }
      }
      const r = await fallback(req);
      return r;
    },
  };
}
