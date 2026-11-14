/* Integrated astronomy guide (frontend only). Talks to an adapter: window.SXI.assistant.ask(request) -> reply.
   Today the adapter is the template-based demo in data/assistant-demo.js.                                        */
import { $, h, icon, announce } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { t, loc } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { getContext } from './viewer.js';
import { errorState } from './common.js';

let sky, el, list, input, open = false, busy = false, last = null, history = [];

const SUGGEST = ['q.what', 'q.explain', 'q.history', 'q.changed', 'q.ir', 'q.compare', 'q.simpler', 'q.future'];

export function init(skyApi) {
  sky = skyApi;
  el = h('aside', { class: 'panel assistant', role: 'complementary', 'aria-label': t('as.title'), hidden: true });
  $('#panels').append(el); build();
  UI.register('assistant', { kind: 'dock', open: show, close: hide, isOpen: () => open });
  bus.on('lang', () => { build(); }); bus.on('assistant-mode', () => { build(); }); bus.on('target', () => open && ctxLine()); bus.on('visit', () => open && ctxLine());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && el.contains(document.activeElement)) hide(); });
}
function show(arg = {}) { open = true; el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); ctxLine(); bus.emit('panel'); setTimeout(() => (input.focus()), 50); if (arg.ask) send({ intent: arg.ask, question: t(arg.ask) }); }
function hide() { open = false; el.classList.remove('in'); setTimeout(() => { if (!open) el.hidden = true; }, 260); bus.emit('panel'); $('#sky').focus({ preventScroll: true }); }

function build() {
  const keep = history.slice(); el.textContent = '';
  list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite', 'aria-label': t('as.log') });
  input = h('input', { class: 'ask-in', type: 'text', placeholder: t('as.placeholder'), 'aria-label': t('as.placeholder'), autocomplete: 'off' });
  const form = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); const q = input.value.trim(); if (q) { input.value = ''; send({ question: q }); } } }, input, h('button', { class: 'btn accent small', type: 'submit', 'aria-label': t('as.send') }, icon('send', 'flip-rtl')));
  const chips = h('div', { class: 'sugg' }, SUGGEST.filter((k) => !(document.documentElement.dataset.level === 'beginner' && (k === 'q.future'))).map((k) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ intent: k, question: t(k) }), text: t(k) })));
  el.append(h('div', { class: 'ph' }, h('div', { class: 'ph-t' }, h('h2', { text: t('as.title') }), h('div', { class: 'chips' }, h('span', { class: 'chip ' + (aiOn() ? 'ok' : 'demo'), text: t(aiOn() ? 'as.ai_badge' : 'as.demo_badge') }))), h('button', { class: 'x', type: 'button', 'aria-label': t('common.close'), onclick: hide }, icon('close'))),
    h('div', { class: 'ctxline', id: 'ctxline' }), list, chips, form, h('p', { class: 'muted fine', text: t(aiOn() ? 'as.ai_disclaimer' : 'as.disclaimer') }));
  history = []; greet(); keep.forEach((m) => { if (!(m.reply && m.reply.greeting)) addMsg(m.role, m.reply || m.text, true); });
  ctxLine();
}
function greet() { addMsg('assistant', { text: t(aiOn() ? 'as.ai_greeting' : 'as.greeting'), provenance: aiOn() ? 'ai' : 'demo', blocks: [], greeting: true }); }
const aiOn = () => !!(window.SXI && window.SXI.aiOn);
function ctxLine() {
  const c = $('#ctxline'); if (!c) return; c.textContent = '';
  const v = getContext(), parts = [S.target ? loc(S.target.name) : S.pos ? t('sel.position') : t('crumb.sky')];
  if (v.open && v.a) parts.push(t('as.ctx.viewing', { d: (v.a.startTime || '').slice(0, 10) }));
  c.append(h('span', { class: 'eyebrow', text: t('as.ctx') }), h('span', { text: parts.join(' · ') }));
}

function addMsg(role, content, silent) {
  const m = h('div', { class: 'msg ' + role });
  if (role === 'user') { m.append(h('div', { class: 'bubble', text: content })); history.push({ role, text: content }); }
  else { m.append(renderReply(content)); history.push({ role, reply: content }); }
  list.append(m); list.scrollTop = list.scrollHeight; return m;
}

function renderReply(r) {
  const box = h('div', { class: 'bubble ai' + (r.status && r.status !== 'ok' ? ' ' + r.status : '') });
  if (r.status === 'unsupported') box.append(h('div', { class: 'chips' }, h('span', { class: 'chip warn', text: t('as.unsupported') })));
  box.append(h('p', { text: r.text }));
  (r.blocks || []).forEach((b) => {
    if (b.type === 'highlight') box.append(highlightBlock(b));
    else if (b.type === 'evidence') box.append(evidenceBlock(b));
    else if (b.type === 'confidence') box.append(confidenceBlock(b));
    else if (b.type === 'prediction') box.append(predictionBlock(b));
    else if (b.type === 'note') box.append(h('p', { class: 'muted fine', text: b.text }));
    else if (b.type === 'action') box.append(h('button', { class: 'btn small', type: 'button', onclick: () => runAction(b.action), text: b.label }));
  });
  if (r.provenance) box.append(h('span', { class: 'prov-tag', text: t('as.prov.' + r.provenance) }));
  return box;
}
function runAction(a) {
  if (a === 'timeline') UI.open('viewer', { mode: 'single' }); else if (a === 'diff') UI.open('viewer', { mode: 'diff' }); else if (a === 'compare') UI.open('viewer', { mode: 'slider' });
  else if (a === 'ir') bus.emit('ir-set', 100);
}
function highlightBlock(b) {
  const w = h('div', { class: 'blk' }, h('span', { class: 'eyebrow', text: t('as.highlights') }));
  if (!b.regions.length) { w.append(h('p', { class: 'muted', text: t('as.highlights.none') })); return w; }
  b.regions.forEach((rg) => w.append(h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('viewer', { mode: 'diff' }), title: t('as.show_in_image') }, icon('target'), h('span', { text: rg.label }))));
  return w;
}
function evidenceBlock(b) {
  const w = h('div', { class: 'blk' }, h('span', { class: 'eyebrow', text: t('as.evidence') })), row = h('div', { class: 'chips' });
  b.items.forEach((it) => row.append(h('button', { class: 'chip link', type: 'button', disabled: it.disabled, onclick: () => {
    if (it.kind === 'observation') { C.setVisit(it.ref); UI.open('viewer', { mode: 'single' }); } else if (it.kind === 'analysis') UI.open('viewer', { mode: 'diff' }); else if (it.kind === 'target') UI.open('info');
  }, text: it.label })));
  w.append(row); return w;
}
function confidenceBlock(b) {
  const w = h('div', { class: 'blk' }, h('span', { class: 'eyebrow', text: t('as.confidence') }));
  if (b.value == null) w.append(h('p', { class: 'muted', text: t('as.confidence.none') }));
  else w.append(h('div', { class: 'meter', role: 'img', 'aria-label': t('as.confidence') + ' ' + Math.round(b.value * 100) + '%' }, h('i', { style: `width:${Math.round(b.value * 100)}%` })), h('small', { class: 'muted', text: Math.round(b.value * 100) + '% · ' + t('as.confidence.demo') }));
  w.append(h('p', { class: 'muted fine', text: b.uncertainty })); return w;
}
function predictionBlock(b) {
  const row = (cls, title, body, tag) => h('div', { class: 'tier ' + cls }, h('div', { class: 'tier-h' }, h('strong', { text: title }), h('span', { class: 'chip', text: tag })), h('p', { text: body }));
  return h('div', { class: 'blk pred' }, h('span', { class: 'eyebrow', text: t('as.prediction') }),
    row('obs', t('as.tier.observed'), b.observed, t('as.tag.data')), row('model', t('as.tier.model'), b.extrapolated.text, b.extrapolated.validated ? t('as.tag.validated') : t('as.tag.unavailable')), row('spec', t('as.tier.spec'), b.speculative, t('as.tag.spec')));
}

async function send(req) {
  if (busy) return; busy = true;
  addMsg('user', req.question);
  const typing = h('div', { class: 'msg assistant' }, h('div', { class: 'bubble ai' }, h('div', { class: 'spinner' }), h('span', { class: 'sr', text: t('as.thinking') }))); list.append(typing); list.scrollTop = list.scrollHeight;
  const adapter = (window.SXI && window.SXI.assistant) || null;
  try {
    if (!adapter) throw new Error('no adapter');
    const reply = await adapter.ask(Object.assign({}, req, { previous: last, context: { target: S.target, position: S.pos, view: sky.getView(), viewer: getContext(), level: document.documentElement.dataset.level, language: document.documentElement.lang } }));
    typing.remove(); last = reply; addMsg('assistant', reply); announce(reply.text);
  } catch (e) {
    typing.remove();
    const m = h('div', { class: 'msg assistant' }, h('div', { class: 'bubble ai error' }, errorState({ code: 'unknown', message: t('as.error'), retryable: true }, () => { m.remove(); busy = false; send(req); })));
    list.append(m);
  } finally { busy = false; list.scrollTop = list.scrollHeight; }
}
