/* EDITORIAL CONTENT (frontend-owned, NOT scientific data).
   The Star Stories below are checked against the listed sources (`sources`, shown under "More detail").
   The artwork and the interactive curves are illustrations and are labelled as such; the measured values
   (frames, motions) come from the data provider at run time.                     */

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
    targetId: 'barnard', status: 'verified', scene: 'motion',
    theme: { accent: '#ffb347', accent2: '#ff6a3d', bg: ['#1a0d07', '#3a1c0e'], tone: 'warm' },
    chapters: [
      { id: 'meet', title: L("Meet Barnard's Star", 'تعرّف على نجم بارنارد'), body: L('A small red dwarf just 6 light-years away: the closest single star to the Sun, and the fastest-moving star in our sky.', 'قزم أحمر صغير على بُعد 6 سنوات ضوئية فقط: أقرب نجم منفرد إلى الشمس، وأسرع النجوم حركةً في سمائنا.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('In 1916 the American astronomer E. E. Barnard compared photographs taken years apart and found this faint star had moved more than any star ever measured.', 'في عام 1916 قارن الفلكي الأمريكي إ. إ. بارنارد صورًا التُقطت بفارق سنوات، فوجد أن هذا النجم الخافت تحرّك أكثر من أي نجم قيس من قبل.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('About 16% of the Sun’s mass, with a surface near 3,200 K and around 10 billion years old. Too faint to see without a telescope, it shines brightly in infrared. In 2024–2025 astronomers found four small planets orbiting it.', 'كتلته نحو 16% من كتلة الشمس، وحرارة سطحه قرابة 3,200 كلفن، وعمره نحو 10 مليارات سنة. لا يُرى دون تلسكوب لكنه ساطع بالأشعة تحت الحمراء. وفي 2024–2025 اكتشف الفلكيون أربعة كواكب صغيرة تدور حوله.') },
      { id: 'interesting', title: L('Why it is special: proper motion', 'لماذا هو مميز: الحركة الذاتية'), body: L('It crosses 10.4 arcseconds of sky every year: the width of the full Moon in about 180 years. It is also coming closer, and around the year 11,800 it will pass within 3.8 light-years of us.', 'يقطع 10.4 ثانية قوسية من السماء كل عام: أي عرض البدر كاملًا في نحو 180 سنة. وهو يقترب منا أيضًا، وسيمرّ على بُعد 3.8 سنة ضوئية نحو عام 11,800.'), interactive: 'motion' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('SPHEREx revisits this spot every six months, and NASA’s WISE saw it from 2010 to 2024. SkyShift lines all these images up and measures the motion itself; below are the real frames and its result.', 'يعود سفيريكس لرصد هذه البقعة كل ستة أشهر، ورصدها تلسكوب وايز التابع لناسا من 2010 إلى 2024. يرصف سكاي شِفت كل هذه الصور ويقيس الحركة بنفسه؛ أدناه الإطارات الحقيقية ونتيجته.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Open Analysis and press play: the star slides upward between visits while the stars behind it stay still.', 'افتح التحليل واضغط تشغيل: ينزلق النجم إلى الأعلى بين الزيارات بينما تبقى النجوم خلفه ثابتة.'), interactive: 'go' }
    ],
    sources: ['Barnard (1916), Astronomical Journal 29, 181', 'Gaia DR3 (ESA, 2022): proper motion 10.39″/yr, distance 1.83 pc', 'González Hernández et al. (2024) and Basant et al. (2025): planets of Barnard’s Star', 'SIMBAD: https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Barnard%27s+star']
  },
  epsindib: {
    targetId: 'epsindib', status: 'verified', scene: 'motion',
    theme: { accent: '#ff9ec0', accent2: '#ffb347', bg: ['#12060c', '#2a0f1f'], tone: 'warm' },
    chapters: [
      { id: 'meet', title: L('Meet Epsilon Indi B', 'تعرّف على إبسيلون الهندي ب'), body: L('Not one object but two: a pair of brown dwarfs, 12 light-years away, orbiting the orange star Epsilon Indi far out in its system.', 'ليس جرمًا واحدًا بل اثنان: زوج من الأقزام البنية على بُعد 12 سنة ضوئية، يدوران حول النجم البرتقالي إبسيلون الهندي في أطراف نظامه.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('Found in 2003 by Ralf-Dieter Scholz and colleagues as a faint object sharing Epsilon Indi’s motion across the sky. The same year it was resolved into two brown dwarfs.', 'اكتشفه رالف-ديتر شولتز وزملاؤه عام 2003 جرمًا خافتًا يشارك إبسيلون الهندي حركته عبر السماء. وفي العام نفسه تبيّن أنه قزمان بنيّان.') },
      { id: 'traits', title: L('What they are like', 'ما طبيعتهما'), body: L('Each is a few tens of Jupiter masses: too small to fuse hydrogen like a star. They circle each other every 11 years, with temperatures of roughly 1,000–1,300 K, so they glow mostly in infrared.', 'كتلة كلٍّ منهما بضع عشرات من كتلة المشتري: أصغر من أن يدمج الهيدروجين كالنجوم. يدوران حول بعضهما كل 11 عامًا، بحرارة تقارب 1,000–1,300 كلفن، فيتوهجان غالبًا بالأشعة تحت الحمراء.') },
      { id: 'interesting', title: L('Why they are special: neighbours on the move', 'لماذا هما مميزان: جاران متحركان'), body: L('Being so close, they cross 4.7 arcseconds of sky a year. They are the nearest brown-dwarf pair whose age and distance are well known, which makes them a benchmark for every other brown dwarf.', 'لقربهما، يقطعان 4.7 ثانية قوسية من السماء كل عام. وهما أقرب زوج من الأقزام البنية معروف العمر والمسافة بدقة، ما يجعلهما مرجعًا لكل الأقزام البنية الأخرى.'), interactive: 'motion' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('SPHEREx and NASA’s WISE have both imaged the pair repeatedly. SkyShift finds them moving on its own; below are the real frames and its measurement.', 'صوّر سفيريكس وتلسكوب وايز التابع لناسا هذا الزوج مرارًا. يجدهما سكاي شِفت يتحركان بنفسه؛ أدناه الإطارات الحقيقية وقياسه.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Open Analysis, turn on the difference view, and watch them appear as a moving blue-and-orange pair.', 'افتح التحليل وفعّل عرض الفرق، وشاهدهما يظهران زوجًا أزرق وبرتقاليًا متحركًا.'), interactive: 'go' }
    ],
    sources: ['Scholz et al. (2003), Astronomy & Astrophysics 398, L29', 'McCaughrean et al. (2004), Astronomy & Astrophysics 413, 1029', 'Gaia DR3 (ESA, 2022): Epsilon Indi system distance 3.64 pc', 'SIMBAD: https://simbad.cds.unistra.fr/simbad/sim-id?Ident=eps+Ind+B']
  },
  wise0855: {
    targetId: 'wise0855', status: 'verified', scene: 'cold',
    theme: { accent: '#7fd8ff', accent2: '#8a7bff', bg: ['#04070f', '#0b1430'], tone: 'cold' },
    chapters: [
      { id: 'meet', title: L('Meet WISE 0855', 'تعرّف على وايز 0855'), body: L('The coldest brown dwarf known, only 7.4 light-years away: the fourth-closest system to the Sun. It is invisible to the eye and glows almost only in infrared.', 'أبرد قزم بني معروف، على بُعد 7.4 سنوات ضوئية فقط: رابع أقرب نظام إلى الشمس. لا يُرى بالعين ويتوهج تقريبًا بالأشعة تحت الحمراء وحدها.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('In 2014 Kevin Luhman found it in images from NASA’s WISE infrared telescope as a faint dot moving unusually fast, then confirmed it with NASA’s Spitzer.', 'في عام 2014 وجده كيفن لومان في صور تلسكوب وايز التابع لناسا نقطةً خافتة تتحرك بسرعة غير عادية، ثم أكّده بتلسكوب سبيتزر التابع لناسا.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('Roughly 3 to 10 times the mass of Jupiter, with a temperature of about 250–285 K: near the freezing point of water. NASA’s JWST has detected water vapour and methane in its atmosphere.', 'كتلته نحو 3 إلى 10 أضعاف كتلة المشتري، وحرارته قرابة 250–285 كلفن: قريبة من درجة تجمد الماء. رصد تلسكوب جيمس ويب التابع لناسا بخار الماء والميثان في غلافه الجوي.') },
      { id: 'interesting', title: L('Why it is special: cold and hidden', 'لماذا هو مميز: بارد ومخفي'), body: L('Something this cold gives off almost no short-wavelength light. Slide through the wavelengths: it only appears at the long end, which is why SPHEREx sees it only beyond about 4 µm.', 'جرم بهذه البرودة لا يكاد يُصدر ضوءًا بأطوال موجية قصيرة. مرّر المنزلق عبر الأطوال الموجية: لا يظهر إلا عند الطرف الطويل، ولهذا لا يراه سفيريكس إلا بعد نحو 4 ميكرومتر.'), interactive: 'cold' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('It moves 8.1 arcseconds a year. SkyShift finds it in SPHEREx’s longest-wavelength images and follows it back through WISE to 2010; below are the real frames and its measurement.', 'يتحرك 8.1 ثانية قوسية كل عام. يجده سكاي شِفت في أطول صور سفيريكس موجةً ويتتبعه عبر صور وايز حتى 2010؛ أدناه الإطارات الحقيقية وقياسه.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Open Analysis on WISE 0855: it uses only the 3.8–5 µm images, where this cold world shows up.', 'افتح التحليل على وايز 0855: يستخدم صور 3.8–5 ميكرومتر فقط، حيث يظهر هذا العالم البارد.'), interactive: 'go' }
    ],
    sources: ['Luhman (2014), Astrophysical Journal Letters 786, L18', 'Luhman & Esplin (2016), Astronomical Journal 152, 78: motion and distance', 'Luhman et al. (2024), JWST spectroscopy of WISE 0855−0714', 'SIMBAD: https://simbad.cds.unistra.fr/simbad/sim-id?Ident=WISE+J085510.83-071442.5']
  },
  rwaur: {
    targetId: 'rwaur', status: 'verified', scene: 'variable',
    theme: { accent: '#ff7a59', accent2: '#ffd84d', bg: ['#14070a', '#2d0f1c'], tone: 'drama' },
    chapters: [
      { id: 'meet', title: L('Meet RW Aurigae', 'تعرّف على آر دبليو الممسك'), body: L('A very young pair of stars, only a few million years old, in the Taurus–Auriga star-forming region. Its brightness never sits still.', 'زوج نجمي فتيّ جدًا، عمره بضعة ملايين من السنين فقط، في منطقة تشكّل النجوم الثور–الممسك. لا يثبت لمعانه أبدًا.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('It has been catalogued as a variable star for over a century and is one of the classic T Tauri stars: newborn stars still surrounded by the disc they formed from.', 'صُنّف نجمًا متغيرًا منذ أكثر من قرن، وهو من نجوم تي الثور الكلاسيكية: نجوم وليدة ما زال يحيط بها القرص الذي تكوّنت منه.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('The main star is still pulling in gas from its disc. A past close pass by its companion tore a long arm of gas and dust out of that disc.', 'ما زال النجم الرئيسي يسحب الغاز من قرصه. وقد مزّق مرورٌ قريب سابق لرفيقه ذراعًا طويلة من الغاز والغبار من ذلك القرص.') },
      { id: 'interesting', title: L('Why it is special: dramatic dimming', 'لماذا هو مميز: خفوت دراماتيكي'), body: L('Since 2010 it has repeatedly faded by up to about 3 magnitudes for months at a time, as clouds of dust cross in front of the star. The curve below shows the idea; the real one is in Analysis.', 'منذ 2010 خفت مرارًا بما يصل إلى نحو 3 أقدار لأشهر متتالية، حين تعبر سحب من الغبار أمام النجم. المنحنى أدناه يوضّح الفكرة؛ والمنحنى الحقيقي في التحليل.'), interactive: 'variable' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('Each SPHEREx visit measures its brightness in up to 102 infrared colours, where hot dust glows. Below are the real frames.', 'تقيس كل زيارة لسفيريكس لمعانه بما يصل إلى 102 لون تحت أحمر، حيث يتوهج الغبار الساخن. أدناه الإطارات الحقيقية.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Open Analysis, click the star, and read its brightness over time and its spectrum.', 'افتح التحليل، وانقر على النجم، واقرأ تغيّر لمعانه عبر الزمن وطيفه.'), interactive: 'go' }
    ],
    sources: ['Cabrit et al. (2006), Astronomy & Astrophysics 452, 897: tidal arm', 'Petrov et al. (2015), Monthly Notices RAS 454, 3976: deep dimming events', 'AAVSO VSX: https://www.aavso.org/vsx/index.php?view=search.top (RW Aur)', 'SIMBAD: https://simbad.cds.unistra.fr/simbad/sim-id?Ident=RW+Aur']
  },
  rdra: {
    targetId: 'rdra', status: 'verified', scene: 'longperiod',
    theme: { accent: '#ffd84d', accent2: '#7dff5a', bg: ['#0c0a02', '#241c05'], tone: 'slow' },
    chapters: [
      { id: 'meet', title: L('Meet R Draconis', 'تعرّف على آر التنين'), body: L('A red giant near the end of its life that swells and shrinks, brightening and fading over about eight months.', 'عملاق أحمر قرب نهاية حياته ينتفخ وينكمش، فيسطع ويخفت خلال نحو ثمانية أشهر.') },
      { id: 'discovery', title: L('Its discovery', 'اكتشافه'), body: L('It belongs to the Mira variables, named after Mira in Cetus, the first such star recognised, in the 1600s. Amateur astronomers have followed R Draconis for well over a century.', 'ينتمي إلى متغيرات الميرا، المسماة على نجم الميرا في قيطس، أول نجم من نوعها عُرف في القرن السابع عشر. ويتابع الفلكيون الهواة آر التنين منذ أكثر من قرن.') },
      { id: 'traits', title: L('What it is like', 'ما طبيعته'), body: L('A cool, bloated star on the asymptotic giant branch, shedding dust into space. Its visible brightness swings from about magnitude 6.7 to 13.2: several hundred times.', 'نجم بارد منتفخ على فرع العمالقة المقارب، يقذف الغبار إلى الفضاء. يتأرجح لمعانه المرئي بين القدر 6.7 تقريبًا و13.2: أي عدة مئات من المرات.') },
      { id: 'interesting', title: L('Why it is special: a long cycle', 'لماذا هو مميز: دورة طويلة'), body: L('One full cycle takes about 245 days. Speed up time to feel the rhythm. The smooth curve here is a simplified drawing; the measured points are in Analysis.', 'تستغرق الدورة الكاملة نحو 245 يومًا. سرّع الزمن لتشعر بالإيقاع. المنحنى الأملس هنا رسم مبسّط؛ والنقاط المقيسة في التحليل.'), interactive: 'longperiod' },
      { id: 'nasa', title: L('What NASA observes', 'ما الذي ترصده ناسا'), body: L('R Draconis sits near the north ecliptic pole, where SPHEREx looks almost every day, so it has more visits than any other challenge target. Below are the real frames.', 'يقع آر التنين قرب القطب الشمالي لدائرة البروج، حيث يرصد سفيريكس كل يوم تقريبًا، فله زيارات أكثر من أي هدف آخر في التحدي. أدناه الإطارات الحقيقية.'), interactive: 'obs' },
      { id: 'explore', title: L('Explore it yourself', 'استكشفه بنفسك'), body: L('Open Analysis, click the star, and watch its brightness rise and fall across the visits.', 'افتح التحليل، وانقر على النجم، وشاهد لمعانه يرتفع وينخفض عبر الزيارات.'), interactive: 'go' }
    ],
    sources: ['General Catalogue of Variable Stars (Samus et al.): R Dra, Mira type, period about 245.6 days, V 6.7–13.2', 'AAVSO VSX: https://www.aavso.org/vsx/index.php?view=search.top (R Dra)', 'SIMBAD: https://simbad.cds.unistra.fr/simbad/sim-id?Ident=R+Dra']
  }
};

/* Stories shown when the object has no dedicated story yet: a generic, honest template. */
export const GENERIC_THEME = { accent: '#38f2c2', accent2: '#ffd84d', bg: ['#040807', '#0b1614'], tone: 'neutral' };
