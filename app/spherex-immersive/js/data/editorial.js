/* EDITORIAL CONTENT (frontend-owned, NOT scientific data).
   Everything here is a DRAFT written so the Star Stories layout can be built and tested.
   Each story has `status: 'draft'`; the UI shows a "Draft: awaiting team verification" banner.
   Numbers are deliberately absent: where a measurement is needed, the story shows an "awaiting verified data" slot,
   or (only when the data provider supplies it) the provider's value labelled with the provider's provenance.
   To publish real content: replace the text, set `status: 'verified'` and fill `sources`.                     */

export const EXTRA_TARGETS = [
  {
    id: 'rwaur', name: { en: 'RW Aurigae', ar: 'آر دبليو الممسك' }, aliases: ['RW Aur', 'RW Aurigae'], classification: 'star',
    typeLabel: { en: 'Young variable star (demo entry)', ar: 'نجم فتيّ متغيّر (مدخل تجريبي)' },
    coordinates: { ra: 76.957, dec: 30.401 }, constellation: 'Auriga',
    description: { en: 'A young star whose brightness is known to vary. Demonstration entry: position is approximate.', ar: 'نجم فتيّ يتغير لمعانه. مدخل تجريبي: الموضع تقريبي.' },
    whyInfrared: { en: 'Young stars are often wrapped in dust, which infrared can see through.', ar: 'تحيط الغبار بالنجوم الفتية غالبًا، والأشعة تحت الحمراء تخترقه.' },
    metadata: [], availability: 'available', observationCount: 6, isSimulated: true, demo: { variable: { amp: 0.35, period: 3.2, phase: 0.3 } }
  },
  {
    id: 'rdra', name: { en: 'R Draconis', ar: 'آر التنين' }, aliases: ['R Dra', 'R Draconis'], classification: 'star',
    typeLabel: { en: 'Long-period variable star (demo entry)', ar: 'نجم متغيّر طويل الدورة (مدخل تجريبي)' },
    coordinates: { ra: 248.17, dec: 66.76 }, constellation: 'Draco',
    description: { en: 'A giant star whose brightness changes slowly over many months. Demonstration entry: position is approximate.', ar: 'نجم عملاق يتغير لمعانه ببطء على مدى أشهر. مدخل تجريبي: الموضع تقريبي.' },
    whyInfrared: { en: 'Cool giants shine brightly in infrared, so their slow changes are easier to follow.', ar: 'تسطع العمالقة الباردة في الأشعة تحت الحمراء، فيسهل تتبّع تغيراتها البطيئة.' },
    metadata: [], availability: 'available', observationCount: 6, isSimulated: true, demo: { variable: { amp: 0.5, period: 6, phase: 0.1 } }
  }
];

const L = (en, ar) => ({ en, ar });

export const STORIES = {
  barnard: {
    targetId: 'barnard', status: 'draft', scene: 'motion',
    theme: { accent: '#ffb347', accent2: '#ff6a3d', bg: ['#1a0d07', '#3a1c0e'], tone: 'warm' },
    chapters: [
      { id: 'meet', title: L("Meet Barnard's Star", 'تعرّف على نجم بارنارد'), body: L('A small, faint red star in our cosmic neighbourhood, famous for how quickly it crosses the sky.', 'نجم أحمر صغير خافت في جوارنا الكوني، اشتهر بسرعة عبوره للسماء.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('It was noticed because it shifts against the background stars faster than almost any other. Discovery details: awaiting verified content.', 'لوحظ لأنه ينزاح أمام النجوم الخلفية أسرع من أي نجم تقريبًا. تفاصيل الاكتشاف: بانتظار محتوى موثّق.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('A cool, dim red dwarf. It is too faint to see without a telescope, but it glows well in infrared.', 'قزم أحمر بارد خافت. لا يُرى دون تلسكوب، لكنه يتوهج جيدًا في الأشعة تحت الحمراء.') },
      { id: 'interesting', title: L('Why it is special: proper motion', 'لماذا هو مميز: الحركة الذاتية'), body: L('Stars look fixed, but they slowly drift. This drift against the background is called proper motion, and Barnard’s Star shows it clearly. Drag the slider to watch the idea.', 'تبدو النجوم ثابتة لكنها تنجرف ببطء. هذا الانجراف أمام الخلفية يسمى الحركة الذاتية، ونجم بارنارد يُظهره بوضوح. حرّك المنزلق لترى الفكرة.'), interactive: 'motion' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('Repeated infrared visits months apart let you compare where the star sits. Below: the observation frames available through the app.', 'تتيح الزيارات المتكررة بالأشعة تحت الحمراء مقارنة موضع النجم. أدناه: الإطارات المتاحة عبر التطبيق.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Return to the sky, open the observations and try the comparison view to look for the shift.', 'عُد إلى السماء، وافتح الرصدات وجرّب المقارنة للبحث عن الانزياح.'), interactive: 'go' }
    ]
  },
  wise0855: {
    targetId: 'wise0855', status: 'draft', scene: 'cold',
    theme: { accent: '#7fd8ff', accent2: '#8a7bff', bg: ['#04070f', '#0b1430'], tone: 'cold' },
    chapters: [
      { id: 'meet', title: L('Meet WISE 0855', 'تعرّف على وايز 0855'), body: L('An extremely cold object, somewhere between a planet and a star, glowing almost only in infrared.', 'جرم شديد البرودة، بين الكوكب والنجم، يتوهج تقريبًا بالأشعة تحت الحمراء فقط.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('It was found by searching infrared survey images for faint, fast-moving dots. Discovery details: awaiting verified content.', 'عُثر عليه بالبحث في صور مسح بالأشعة تحت الحمراء عن نقاط خافتة سريعة الحركة. تفاصيل الاكتشاف: بانتظار محتوى موثّق.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('A brown dwarf: too small to shine like a star. It is so cool that visible light barely escapes it.', 'قزم بني: أصغر من أن يسطع كنجم. هو بارد لدرجة أن الضوء المرئي بالكاد يخرج منه.') },
      { id: 'interesting', title: L('Why it is special: cold and hidden', 'لماذا هو مميز: بارد ومخفي'), body: L('Slide through the wavelengths: the colder the object, the more it hides until you reach the longest infrared.', 'مرّر المنزلق عبر الأطوال الموجية: كلما كان الجرم أبرد اختفى أكثر حتى تصل إلى أطول الأشعة تحت الحمراء.'), interactive: 'cold' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('SPHEREx looks at many infrared colours, which is exactly what helps find such cold objects. Below: frames available in the app.', 'يرصد سفيريكس ألوانًا كثيرة من الأشعة تحت الحمراء، وهذا ما يساعد على إيجاد أجرام باردة كهذه. أدناه: الإطارات المتاحة.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Switch to the longest infrared band and compare visits.', 'انتقل إلى أطول نطاق تحت أحمر وقارن بين الزيارات.'), interactive: 'go' }
    ]
  },
  rwaur: {
    targetId: 'rwaur', status: 'draft', scene: 'variable',
    theme: { accent: '#ff7a59', accent2: '#ffd84d', bg: ['#14070a', '#2d0f1c'], tone: 'drama' },
    chapters: [
      { id: 'meet', title: L('Meet RW Aurigae', 'تعرّف على آر دبليو الممسك'), body: L('A young star that does not shine steadily: its brightness changes, sometimes sharply.', 'نجم فتيّ لا يسطع بثبات: يتغير لمعانه، وأحيانًا بحدّة.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('Its changing light was tracked over time. Discovery details: awaiting verified content.', 'جرى تتبّع تغيّر ضوئه عبر الزمن. تفاصيل الاكتشاف: بانتظار محتوى موثّق.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('Young stars can be surrounded by gas and dust left over from their birth. Specific measurements: awaiting verified data.', 'قد تحيط بالنجوم الفتية غازات وغبار متبقٍّ من ولادتها. القياسات المحددة: بانتظار بيانات موثّقة.') },
      { id: 'interesting', title: L('Why it is special: dramatic dimming', 'لماذا هو مميز: خفوت دراماتيكي'), body: L('Watch an illustrative light curve: steady, then sudden dips. This is an artist’s idea, not RW Aurigae’s real data.', 'شاهد منحنى ضوء توضيحيًا: ثبات ثم هبوطات مفاجئة. هذا تصوّر فني وليس بيانات RW Aur الحقيقية.'), interactive: 'variable' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('Repeated visits let you ask: did it get brighter or fainter? Below: frames available in the app.', 'تتيح الزيارات المتكررة السؤال: هل ازداد لمعانه أم خفت؟ أدناه: الإطارات المتاحة.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Step through the visits and compare brightness.', 'تنقّل بين الزيارات وقارن اللمعان.'), interactive: 'go' }
    ]
  },
  rdra: {
    targetId: 'rdra', status: 'draft', scene: 'longperiod',
    theme: { accent: '#ffd84d', accent2: '#7dff5a', bg: ['#0c0a02', '#241c05'], tone: 'slow' },
    chapters: [
      { id: 'meet', title: L('Meet R Draconis', 'تعرّف على آر التنين'), body: L('A giant star that slowly swells and fades over many months, like a very slow heartbeat.', 'نجم عملاق ينتفخ ويخفت ببطء على مدى أشهر، كنبض بطيء جدًا.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('Its slow cycle was found by watching it again and again. Discovery details: awaiting verified content.', 'اكتُشفت دورته البطيئة بمراقبته مرارًا. تفاصيل الاكتشاف: بانتظار محتوى موثّق.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('Cool giant stars shine strongly in infrared. Specific measurements: awaiting verified data.', 'تسطع النجوم العملاقة الباردة بقوة في الأشعة تحت الحمراء. القياسات المحددة: بانتظار بيانات موثّقة.') },
      { id: 'interesting', title: L('Why it is special: a long cycle', 'لماذا هو مميز: دورة طويلة'), body: L('Speed up time to feel a slow cycle. Illustration only: the period shown is not R Draconis’s measured value.', 'سرّع الزمن لتشعر بدورة بطيئة. توضيح فقط: الدورة المعروضة ليست القيمة المقيسة لـ R Dra.'), interactive: 'longperiod' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('A few visits sample only part of a long cycle. Below: frames available in the app.', 'تلتقط بضع زيارات جزءًا فقط من دورة طويلة. أدناه: الإطارات المتاحة.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Open the observations and see how the star looks at each visit.', 'افتح الرصدات وانظر كيف يبدو النجم في كل زيارة.'), interactive: 'go' }
    ]
  }
};

/* Stories shown when the object has no dedicated story yet: a generic, honest template. */
export const GENERIC_THEME = { accent: '#38f2c2', accent2: '#ffd84d', bg: ['#040807', '#0b1614'], tone: 'neutral' };
