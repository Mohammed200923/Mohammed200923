/* DEMONSTRATION assistant adapter. There is no AI model here. Answers are templates filled from what the data layer returns,
   so the interface can be built and tested. Replace by setting `window.SXI.assistant = { ask(request) -> Promise<reply> }`
   (see FRONTEND_INTEGRATION.md for the request/reply shapes). Every reply carries provenance: 'demo'.                  */
import { t, loc, lang } from '../core/i18n.js';
import { S } from '../core/state.js';
import * as C from '../core/controller.js';

const SXd = () => window.SX.data;
const KEYWORDS = [
  ['q.future', /future|predict|will move|next year|مستقبل|توقع|سيتحرك/i],
  ['q.changed', /chang|differen|between|subtract|تغير|تغيّر|فرق|بين/i],
  ['q.history', /history|observation|visit|when|dates|سجل|رصد|زيارات|تاريخ/i],
  ['q.compare', /compar|how do i|قارن|مقارنة|كيف/i],
  ['q.ir', /infrared|wavelength|ir\b|تحت الحمراء|طول موجي/i],
  ['q.simpler', /simpl|easier|explain.*(more|again)|بسّط|أبسط|ابسط|اشرح.*ببساطة/i],
  ['q.explain', /explain|tell me|about|what is|اشرح|حدثني|ما هو/i],
  ['q.what', /what am i|looking at|what('s| is) this|ماذا|ما الذي أنظر|ما هذا/i]
];
export function classify(q) { const hit = KEYWORDS.find(([, re]) => re.test(q)); return hit ? hit[0] : null; }

const reply = (o) => Object.assign({ status: 'ok', provenance: 'demo', blocks: [] }, o);
const nothing = () => reply({ status: 'unsupported', text: t('as.no_selection') });

export async function ask(req) {
  const id = req.intent || classify(req.question || '');
  const tg = S.target, tgName = tg ? loc(tg.name) : t('sel.position');
  if (!id) return reply({ status: 'unsupported', text: t('as.unknown'), blocks: [] });
  if (['q.what', 'q.explain', 'q.simpler', 'q.history', 'q.changed', 'q.future'].includes(id) && !S.pos) return nothing();

  if (id === 'q.what' || id === 'q.explain') {
    const lines = tg ? [loc(tg.description)] : [t('as.pos_only')];
    if (id === 'q.explain' && tg && tg.whyInfrared) lines.push(loc(tg.whyInfrared));
    return reply({ id, text: (tg ? t('as.what', { name: tgName, type: loc(tg.typeLabel) || t('cls.' + tg.classification) }) + ' ' : '') + lines.join(' '), simple: tg ? loc(tg.description) : t('as.pos_only'),
      blocks: [{ type: 'evidence', items: [tg ? { kind: 'target', label: tgName + ' · ' + t('as.ev.catalog'), ref: tg.id } : { kind: 'position', label: tgName }] }, tg && tg.isSimulated ? { type: 'note', text: t('as.demo_data') } : null].filter(Boolean) });
  }
  if (id === 'q.simpler') { const l = req.previous && req.previous.simple; return reply({ id, text: t('as.simpler_prefix') + ' ' + (l || (tg ? loc(tg.description) : t('as.pos_only'))) }); }
  if (id === 'q.history') {
    if (S.obsStatus === 'loading') return reply({ status: 'error', text: t('as.loading') });
    const obs = S.obs;
    if (!obs.length) return reply({ id, text: t('as.no_obs'), blocks: [{ type: 'note', text: t('tl.empty.body') }] });
    const o = obs.filter((x) => x.status === 'observed');
    return reply({ id, text: t('as.history', { n: o.length, p: obs.length - o.length }), blocks: [{ type: 'evidence', items: obs.map((x, i) => ({ kind: 'observation', label: (x.startTime || '').slice(0, 10) + ' · ' + t('status.' + x.status), ref: i, disabled: x.status !== 'observed' })) }, { type: 'action', action: 'timeline', label: t('tl.open_viewer') }] });
  }
  if (id === 'q.changed') {
    const list = C.observed(); if (list.length < 2) return reply({ id, status: 'unsupported', text: t('as.need2') });
    const a = list[0].o, b = list[list.length - 1].o, band = typeof S.band === 'number' ? S.band : 4;
    const r = await SXd().getComparisonResult(a.id, b.id, { bandId: band });
    if (r.status !== 'ok') return reply({ id, status: r.error && r.error.code === 'unsupported' ? 'unsupported' : 'error', text: r.error ? r.error.message : t('err.unknown') });
    const d = r.data, sig = t('sig.' + d.summary.significance);
    return reply({ id, text: t('as.changed', { a: a.startTime.slice(0, 10), b: b.startTime.slice(0, 10), sig, frac: (d.summary.changedPixelFraction * 100).toFixed(2) }) + (d.notes ? ' ' + loc(d.notes) : ''), simple: t('as.changed_simple', { sig }),
      blocks: [
        { type: 'highlight', regions: d.candidates.map((c) => ({ label: (loc(c.label) || t('viewer.candidate')) + ' · ' + t('change.' + c.changeType), pixel: c.pixel, observationA: a.id, observationB: b.id })) },
        { type: 'confidence', value: d.candidates.length ? Math.max(...d.candidates.map((c) => c.confidence)) : null, uncertainty: t('as.uncertainty'), quality: d.quality },
        { type: 'evidence', items: [{ kind: 'observation', label: a.startTime.slice(0, 10), ref: list[0].i }, { kind: 'observation', label: b.startTime.slice(0, 10), ref: list[list.length - 1].i }, { kind: 'analysis', label: t('as.ev.diff'), ref: 'diff' }] },
        { type: 'action', action: 'diff', label: t('viewer.mode.diff') }, d.isSimulated ? { type: 'note', text: t('as.demo_data') } : null
      ].filter(Boolean) });
  }
  if (id === 'q.ir') return reply({ id, text: (tg && tg.whyInfrared ? loc(tg.whyInfrared) + ' ' : '') + t('as.ir'), simple: t('as.ir_simple'), blocks: [{ type: 'action', action: 'ir', label: t('ir.toggle') }] });
  if (id === 'q.compare') return reply({ id, text: t('as.compare'), simple: t('as.compare'), blocks: [{ type: 'action', action: 'compare', label: t('viewer.mode.slider') }] });
  if (id === 'q.future') {
    return reply({ id, status: 'unsupported', text: t('as.future'), blocks: [{ type: 'prediction', observed: S.obsStatus === 'ok' ? t('as.future.observed', { n: C.observed().length }) : t('as.future.observed0'), extrapolated: { validated: false, text: t('as.future.model') }, speculative: t('as.future.spec') }] });
  }
  return reply({ status: 'unsupported', text: t('as.unknown') });
}
void lang;
