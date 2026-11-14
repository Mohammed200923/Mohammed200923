/* Minimal panel registry so modules can open each other without importing each other. */
const reg = {};
export const UI = {
  register(name, impl) { reg[name] = impl; },
  open(name, arg) {
    const p = reg[name]; if (!p) return;
    if (p.kind === 'overlay') Object.keys(reg).forEach((k) => { if (k !== name && reg[k].kind === 'overlay' && reg[k].isOpen() && k !== 'onboarding') reg[k].close(); });
    if (p.kind === 'dock') Object.keys(reg).forEach((k) => { if (k !== name && reg[k].kind === 'dock' && reg[k].isOpen()) reg[k].close(); });
    p.open(arg);
  },
  close(name) { reg[name] && reg[name].isOpen() && reg[name].close(); },
  toggle(name, arg) { const p = reg[name]; if (!p) return; p.isOpen() ? p.close() : UI.open(name, arg); },
  isOpen(name) { return !!(reg[name] && reg[name].isOpen()); },
  anyOverlayOpen() { return Object.keys(reg).some((k) => reg[k].kind === 'overlay' && reg[k].isOpen()); }
};
