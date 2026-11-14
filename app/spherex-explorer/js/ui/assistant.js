/* Demonstration guide: PREDEFINED answers (English + Arabic) chosen by keyword matching.
   It is not an AI model and calls no external service. Replies can carry real UI actions
   (navigate, change theme/language/level, switch viewing mode, open search...) via SX.actions.      */
(function () {
  const SX = window.SX, U = SX.ui, app = SX.app, esc = SX.esc, $ = SX.$, t = function (k, p) { return SX.i18n.t(k, p); };
  const A = (SX.assistant = {});

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
      .replace(/[^a-z0-9\u00B5\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function hasKw(text, kw) {
    const k = norm(kw);
    if (!k) return false;
    if (/^[a-z0-9 ]{1,3}$/.test(k)) return new RegExp('(^| )' + k + '( |$)').test(text);
    return text.indexOf(k) >= 0;
  }

  /* Direct commands: verb + noun -> perform the UI action and confirm. */
  const VERB = /(^| )(switch|set|change|turn|use|enable|disable|make|go|open|show|take me|take|play|pause|stop|start|select|find|search for|look for|goto)( |$)|غير|حول|فعل|عطل|اجعل|افتح|اذهب|اظهر|اعرض|خذني|شغل|اوقف|ابحث عن|ابدا|اختر|روح/;
  const COMMANDS = [
    { kw: ['dark mode', 'dark theme', 'الوضع الداكن', 'مظهر داكن', 'داكن'], run: ['setTheme', 'dark'], say: 'bot.did.dark' },
    { kw: ['light mode', 'light theme', 'الوضع الفاتح', 'مظهر فاتح', 'فاتح'], run: ['setTheme', 'light'], say: 'bot.did.light' },
    { kw: ['system theme', 'follow system', 'theme system', 'مظهر النظام'], run: ['setTheme', 'system'], say: 'bot.did.system' },
    { kw: ['arabic', 'العربيه', 'عربي'], run: ['setLang', 'ar'], say: 'bot.did.ar' },
    { kw: ['english', 'الانجليزيه', 'انجليزي'], run: ['setLang', 'en'], say: 'bot.did.en' },
    { kw: ['larger text', 'bigger text', 'large text', 'text size', 'نص اكبر', 'حجم الخط', 'خط اكبر'], run: ['toggleLargeText'], say: 'bot.did.text' },
    { kw: ['contrast', 'التباين', 'تباين'], run: ['toggleContrast'], say: 'bot.did.contrast' },
    { kw: ['reduce motion', 'reduced motion', 'less motion', 'animation', 'تقليل الحركه', 'الحركه'], run: ['toggleMotion'], say: 'bot.did.motion' },
    { kw: ['beginner', 'مبتدئ'], run: ['setLevel', 'beginner'], say: 'bot.did.beginner' },
    { kw: ['intermediate', 'متوسط'], run: ['setLevel', 'intermediate'], say: 'bot.did.intermediate' },
    { kw: ['advanced', 'متقدم'], run: ['setLevel', 'advanced'], say: 'bot.did.advanced' },
    { kw: ['explorer', 'sky map', 'the map', 'المستكشف', 'الخريطه'], run: ['navigate', 'explorer'], say: 'bot.did.explorer' },
    { kw: ['observations', 'observation list', 'عمليات الرصد', 'الرصد'], run: ['navigate', 'observations'], say: 'bot.did.observations' },
    { kw: ['comparison', 'compare', 'المقارنه', 'مقارنه', 'قارن'], run: ['navigate', 'comparison'], say: 'bot.did.comparison' },
    { kw: ['settings', 'preferences', 'الاعدادات', 'اعدادات'], run: ['navigate', 'settings'], say: 'bot.did.settings' },
    { kw: ['help page', 'help', 'المساعده'], run: ['navigate', 'help'], say: 'bot.did.help' },
    { kw: ['dust view', 'dust clouds', 'dust', 'الغبار', 'سحب الغبار'], run: ['setMode', 'dust'], say: 'bot.did.dust' },
    { kw: ['cold view', 'coolest', 'cold objects', 'الاجرام الباردة', 'الباردة'], run: ['setMode', 'cold'], say: 'bot.did.cold' },
    { kw: ['warm glow', 'near infrared view', 'warm', 'الوهج الدافئ', 'دافئ'], run: ['setMode', 'warm'], say: 'bot.did.warm' },
    { kw: ['everyday sky', 'everyday', 'visible', 'السماء المعتاده', 'المرئي'], run: ['setMode', 'everyday'], say: 'bot.did.everyday' },
    { kw: ['all bands', 'composite', 'rgb', 'كل النطاقات', 'مركب'], run: ['setMode', 'composite'], say: 'bot.did.composite' },
    { kw: ['playback', 'timeline', 'the sequence', 'التشغيل', 'الجدول الزمني'], run: ['togglePlay'], say: 'bot.did.play', needsExplorer: true },
    { kw: ['search box', 'search bar', 'search', 'مربع البحث', 'البحث'], run: ['focusSearch'], say: 'bot.did.search' },
    { kw: ['coordinates', 'coordinate', 'ra dec', 'الاحداثيات', 'احداثيات'], run: ['openCoords'], say: 'bot.did.coords' }
  ];

  /* Informational intents. kw: keywords for both languages (normalised on load). */
  const INTENTS = [
    { id: 'greet', kw: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'مرحبا', 'اهلا', 'السلام عليكم', 'هلا'], actions: [['navigate', 'explorer', 'act.explorer']] },
    { id: 'start', kw: ['get started', 'getting started', 'how do i use', 'how to use', 'what can i do', 'tour', 'start here', 'help me', 'كيف استخدم', 'ماذا يمكنني', 'جوله', 'ابدا من', 'ساعدني'], actions: [['navigate', 'explorer', 'act.explorer'], ['navigate', 'help', 'act.help']] },
    { id: 'nav', kw: ['navigate', 'navigation', 'menu', 'sections', 'pages', 'where is', 'where do i', 'التنقل', 'القائمه', 'الاقسام', 'اين'], actions: [['navigate', 'explorer', 'act.explorer'], ['navigate', 'observations', 'act.observations'], ['navigate', 'comparison', 'act.comparison'], ['navigate', 'settings', 'act.settings']] },
    { id: 'search', kw: ['search', 'find an object', 'find a star', 'look for', 'look up', 'how do i find', 'بحث', 'ابحث', 'اجد', 'ايجاد'], actions: [['focusSearch', null, 'act.focusSearch']] },
    { id: 'coords', kw: ['coordinate', 'coordinates', 'right ascension', 'declination', 'latitude', 'longitude', 'ra', 'dec', 'ra dec', 'احداثيات', 'الاحداثيات', 'الصعود المستقيم', 'الميل'], actions: [['openCoords', null, 'act.openCoords']] },
    { id: 'infrared', kw: ['infrared', 'ir', 'near infrared', 'heat', 'invisible light', 'تحت الحمراء', 'الاشعه تحت الحمراء', 'الاشعة تحت الحمراء', 'الحراره'], actions: [['setMode', 'warm', 'act.modeWarm'], ['setMode', 'dust', 'act.modeDust']] },
    { id: 'wavelength', kw: ['wavelength', 'micron', 'micrometre', 'micrometer', 'band', 'bands', 'colour', 'color', 'palette', 'طول موجي', 'الطول الموجي', 'ميكرون', 'نطاق', 'نطاقات', 'الوان', 'لون'], actions: [['showView', null, 'act.showView']] },
    { id: 'fov', kw: ['field of view', 'fov', 'zoom', 'pan', 'drag', 'pinch', 'brightness', 'contrast', 'مجال الرؤيه', 'تكبير', 'تحريك', 'سحب', 'السطوع'], actions: [['showView', null, 'act.showView']] },
    { id: 'timeline', kw: ['timeline', 'visit', 'visits', 'playback', 'play', 'pause', 'speed', 'loop', 'الجدول الزمني', 'زياره', 'زيارات', 'تشغيل', 'ايقاف', 'سرعه'], actions: [['togglePlay', null, 'act.play'], ['navigate', 'observations', 'act.observations']] },
    { id: 'compare', kw: ['compare', 'comparison', 'before and after', 'before', 'after', 'difference', 'slider', 'blink', 'change over time', 'قارن', 'مقارنه', 'قبل', 'بعد', 'الفرق', 'فرق', 'التغيير'], actions: [['navigate', 'comparison', 'act.comparison']] },
    { id: 'observations', kw: ['observation', 'observations', 'images', 'quality', 'missing', 'available', 'availability', 'عمليات الرصد', 'الرصد', 'صور', 'جوده', 'متاح'], actions: [['navigate', 'observations', 'act.observations']] },
    { id: 'prefs', kw: ['theme', 'language', 'accessibility', 'accessible', 'preferences', 'settings', 'appearance', 'المظهر', 'اللغه', 'امكانيه الوصول', 'الاعدادات', 'تفضيلات'], actions: [['navigate', 'settings', 'act.settings'], ['setTheme', 'light', 'act.themeLight'], ['setTheme', 'dark', 'act.themeDark']] },
    { id: 'level', kw: ['experience level', 'simple', 'more controls', 'fewer controls', 'expert', 'levels', 'مستوى الخبره', 'تحكم اكثر', 'مستويات', 'بسيط'], actions: [['setLevel', 'beginner', 'act.beginner'], ['setLevel', 'intermediate', 'act.intermediate'], ['setLevel', 'advanced', 'act.advanced']] },
    { id: 'shortcuts', kw: ['shortcut', 'shortcuts', 'keyboard', 'keys', 'hotkey', 'اختصار', 'اختصارات', 'لوحه المفاتيح'], actions: [['navigate', 'help', 'act.help']] },
    { id: 'what', kw: ['what am i looking at', 'selected', 'this object', 'tell me about', 'about this', 'what is this', 'ما هذا', 'ماذا اشاهد', 'عن هذا', 'المحدد'], actions: [['navigate', 'observations', 'act.observations']] },
    { id: 'term.spherex', kw: ['spherex', 'what is spherex', 'سفيريكس', 'سفيرإكس'], actions: [] },
    { id: 'term.demo', kw: ['simulated', 'real data', 'real', 'nasa', 'demo', 'demonstration', 'fake', 'is this real', 'محاكاه', 'حقيقي', 'حقيقيه', 'ناسا', 'تجريبي', 'عرض تجريبي'], actions: [['navigate', 'help', 'act.help']] },
    { id: 'term.brown', kw: ['brown dwarf', 'wise 0855', 'planet x', 'failed star', 'قزم بني', 'نجم فاشل', 'الكوكب اكس'], actions: [['selectFeatured', 'wise0855', 'act.showWise']] },
    { id: 'term.nebula', kw: ['nebula', 'nebulae', 'سديم', 'السدم'], actions: [['selectFeatured', 'orion', 'act.showOrion']] },
    { id: 'term.galaxy', kw: ['galaxy', 'galaxies', 'مجره', 'المجرات'], actions: [['selectFeatured', 'm31', 'act.showM31']] },
    { id: 'term.ly', kw: ['light year', 'light years', 'light-year', 'سنه ضوئيه', 'سنوات ضوئيه'], actions: [] },
    { id: 'term.band', kw: ['what is a band', 'detector band', 'channels', 'قناه', 'قنوات'], actions: [['showView', null, 'act.showView']] }
  ];
  INTENTS.forEach(function (i) { i.nkw = i.kw.map(norm); });
  COMMANDS.forEach(function (c) { c.nkw = c.kw.map(norm); });

  /* ---------- reply engine ---------- */
  function actionsOf(list) { return (list || []).map(function (a) { return { name: a[0], arg: a[1], label: t(a[2]) }; }); }

  A.reply = async function (text) {
    const q = norm(text);
    if (!q) return { text: t('bot.fallback'), chips: chips() };

    /* 1) find a target by name: "find orion", "take me to vega", "ابحث عن الثريا" */
    const m = q.match(/(?:^| )(?:find|show me|show|go to|take me to|open|select|search for|look for|اذهب الى|ابحث عن|افتح|اظهر|اعرض|خذني الى|روح)\s+(.{2,})$/);
    if (m && !COMMANDS.some(function (c) { return c.nkw.some(function (k) { return k === m[1]; }); })) {
      const r = await SX.data.searchTargets(m[1]);
      if (r.status === 'ok') {
        const tg = r.data[0]; SX.actions.run('selectFeatured', tg.id); if (!app.get('featured').list.some(function (x) { return x.id === tg.id; })) SX.ctrl.selectTarget(tg);
        return { text: t('bot.found', { name: U.name(tg), type: U.typeLabel(tg) }), actions: actionsOf([['navigate', 'observations', 'act.observations'], ['navigate', 'comparison', 'act.comparison']]), chips: chips() };
      }
      if (r.status === 'error') return { text: t('bot.searchError'), actions: [], chips: chips() };
    }

    /* 2) imperative command with a known noun -> do it */
    if (VERB.test(q) || VERB.test(String(text).toLowerCase())) {
      let best = null, bl = 0;
      COMMANDS.forEach(function (c) { c.nkw.forEach(function (k) { if (hasKw(q, k) && k.length > bl) { best = c; bl = k.length; } }); });
      if (best) {
        if (best.needsExplorer) SX.shell.go('explorer', { focus: false });
        SX.actions.run(best.run[0], best.run[1]);
        return { text: t(best.say), actions: [], chips: chips(), did: true };
      }
    }

    /* 3) informational intent by keyword score */
    let bi = null, bs = 0;
    INTENTS.forEach(function (it) {
      let s = 0; it.nkw.forEach(function (k) { if (hasKw(q, k)) s += k.length + (k.indexOf(' ') > 0 ? 6 : 0); });
      if (s > bs) { bs = s; bi = it; }
    });
    if (!bi) return { text: t('bot.fallback'), chips: chips() };
    let body;
    if (bi.id === 'what') {
      const tg = app.get('target'), f = app.get('field');
      if (tg) body = t('bot.what.target', { name: U.name(tg), type: SX.i18n.text(tg.typeLabel) || U.typeLabel(tg), desc: SX.i18n.text(tg.description), why: SX.i18n.text(tg.whyInfrared) });
      else if (f) body = t('bot.what.field');
      else body = t('bot.what.none');
    } else body = t('bot.' + bi.id);
    return { text: body, actions: actionsOf(bi.actions), chips: chips() };
  };

  function chips() { return ['bot.chip.start', 'bot.chip.search', 'bot.chip.infrared', 'bot.chip.timeline', 'bot.chip.compare', 'bot.chip.prefs'].map(function (k) { return t(k); }); }

  /* ---------- panel UI ---------- */
  let opener = null;
  function addMsg(text, who, acts) {
    const box = $('#msgs'), d = document.createElement('div'); d.className = 'm' + (who === 'me' ? ' me' : '');
    const p = document.createElement('p'); p.textContent = text; d.appendChild(p);
    if (acts && acts.length) {
      const row = document.createElement('div'); row.className = 'm-acts';
      acts.forEach(function (a) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = a.label; b.onclick = function () { SX.actions.run(a.name, a.arg); if (window.matchMedia('(max-width: 699px)').matches && a.name !== 'togglePlay') close(); }; row.appendChild(b); });
      d.appendChild(row);
    }
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  function setChips(list) {
    const c = $('#cchips'); c.innerHTML = '';
    list.forEach(function (x) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = x; b.onclick = function () { ask(x); }; c.appendChild(b); });
  }
  async function ask(text) {
    addMsg(text, 'me');
    const think = document.createElement('div'); think.className = 'm typing'; think.setAttribute('aria-hidden', 'true'); think.textContent = '…'; $('#msgs').appendChild(think);
    const r = await A.reply(text);
    await new Promise(function (res) { setTimeout(res, SX.motionReduced() ? 0 : 280); });
    think.remove(); addMsg(r.text, 'bot', r.actions); setChips(r.chips || chips());
  }
  function open() {
    const chat = $('#chat'); opener = document.activeElement; chat.hidden = false; $('#railGuide').setAttribute('aria-expanded', 'true');
    if (!$('#msgs').children.length) { addMsg(t('bot.intro'), 'bot'); setChips(chips()); }
    $('#chatIn').focus();
  }
  function close() { $('#chat').hidden = true; $('#railGuide').setAttribute('aria-expanded', 'false'); if (opener && document.contains(opener) && opener.focus) opener.focus({ preventScroll: true }); }
  A.toggle = function () { $('#chat').hidden ? open() : close(); };

  A.init = function () {
    SX.actions.register('guide', A.toggle);
    $('#railGuide').onclick = A.toggle; $('#chatClose').onclick = close;
    $('#chatForm').onsubmit = function (e) { e.preventDefault(); const v = $('#chatIn').value.trim(); if (v) { $('#chatIn').value = ''; ask(v); } };
    $('#chat').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    SX.bus.on('lang', function () { if (!$('#chat').hidden) setChips(chips()); });
  };
})();
