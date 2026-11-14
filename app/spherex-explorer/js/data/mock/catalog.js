/* MOCK DATA: demonstration catalog. Positions are approximate and the text is written for interface
   demonstration only. Nothing here comes from NASA, SPHEREx or IRSA.
   Only the mock provider reads this file. The UI never imports it.                                */
(function () {
  const SX = window.SX;
  const M = (SX.mock = SX.mock || {});

  M.BANDS = SX.DEFAULT_BANDS.map(function (b) { return Object.assign({}, b); });

  /* Compact records. Fields:
     id, en/ar name, aka (search aliases incl. Arabic), cls, te/ta (specific type label), ra, dec (deg), mag, tK, size (deg),
     con (constellation), ly (distance), spec (spectral type, language-neutral), d* description, w* "why infrared",
     vis (number of scheduled visits; 0 = no coverage), sim (mock-only rendering hints)                       */
  const R = [
    { id: 'orion', en: 'Orion Nebula', ar: 'سديم الجبار', aka: ['M42', 'NGC 1976', 'Orion', 'الجبار'], cls: 'nebula', te: 'Star-forming nebula', ta: 'سديم تكوّن نجوم', ra: 83.82, dec: -5.39, mag: 3.6, tK: 10000, size: 1.0, con: 'Orion', ly: 1350, vis: 6,
      de: 'A glowing cloud where new stars are being born.', da: 'سحابة متوهجة تولد فيها نجوم جديدة.',
      we: 'Dust hides the youngest stars in visible light. Infrared passes through, so the nursery inside becomes visible.', wa: 'يحجب الغبار النجوم الفتية في الضوء المرئي، أما الأشعة تحت الحمراء فتخترقه فتكشف حضانة النجوم في الداخل.' },
    { id: 'betelgeuse', en: 'Betelgeuse', ar: 'منكب الجوزاء', aka: ['alpha Ori', 'Betelgeuse'], cls: 'star', te: 'Red supergiant', ta: 'عملاق فائق أحمر', ra: 88.79, dec: 7.41, mag: 0.6, tK: 3600, size: 0.02, con: 'Orion', ly: 550, spec: 'M1–2 Ia–ab', vis: 6, sim: { variable: { amp: 0.28, period: 4.2, phase: 0.6 } },
      de: 'A huge, cool, red star that slowly pulses in brightness.', da: 'نجم أحمر عملاق بارد يتغير لمعانه ببطء.',
      we: 'Cool stars radiate most strongly in infrared, so it grows brighter as you move to longer wavelengths.', wa: 'تُشع النجوم الباردة أقوى ما تكون في الأشعة تحت الحمراء، لذا يزداد لمعانه كلما اتجهنا إلى أطوال موجية أطول.' },
    { id: 'sirius', en: 'Sirius', ar: 'الشعرى اليمانية', aka: ['alpha CMa', 'dog star', 'الشعرى'], cls: 'star', te: 'Bright blue-white star', ta: 'نجم أبيض مزرق ساطع', ra: 101.29, dec: -16.72, mag: -0.5, tK: 9900, size: 0.02, con: 'Canis Major', ly: 8.6, spec: 'A1V', vis: 6,
      de: 'The brightest star in our night sky and a close neighbor.', da: 'ألمع نجم في سمائنا الليلية وجار قريب منا.',
      we: 'A hot star: very bright in short wavelengths and fading toward the longest infrared bands.', wa: 'نجم حار: شديد اللمعان في الأطوال القصيرة ويخفت باتجاه نطاقات الأشعة تحت الحمراء الأطول.' },
    { id: 'vega', en: 'Vega', ar: 'النسر الواقع', aka: ['alpha Lyr'], cls: 'star', te: 'Star with a dust disk', ta: 'نجم محاط بقرص غبار', ra: 279.23, dec: 38.78, mag: 0.1, tK: 9600, size: 0.02, con: 'Lyra', ly: 25, spec: 'A0V', vis: 6,
      de: 'A bright star surrounded by a faint ring of leftover dust.', da: 'نجم ساطع تحيط به حلقة خافتة من غبار متبقٍّ.',
      we: 'That dust is cool, so it only shows up as extra glow at longer infrared wavelengths.', wa: 'هذا الغبار بارد، فلا يظهر إلا كوهج إضافي عند أطوال موجية تحت حمراء أطول.' },
    { id: 'm31', en: 'Andromeda Galaxy', ar: 'مجرة المرأة المسلسلة', aka: ['M31', 'NGC 224', 'Andromeda', 'أندروميدا'], cls: 'galaxy', te: 'Spiral galaxy', ta: 'مجرة حلزونية', ra: 10.68, dec: 41.27, mag: 3.4, tK: 5000, size: 3.0, con: 'Andromeda', ly: 2500000, vis: 6,
      de: 'Our nearest big galactic neighbor, home to about a trillion stars.', da: 'أقرب مجرة كبيرة جارة لنا، وتضم نحو تريليون نجم.',
      we: 'Infrared shows the older stars that form its smooth core and the warm dust tracing its spiral arms.', wa: 'تكشف الأشعة تحت الحمراء النجوم الأقدم التي تشكل قلبها الناعم، والغبار الدافئ الذي يرسم أذرعها الحلزونية.' },
    { id: 'crab', en: 'Crab Nebula', ar: 'سديم السرطان', aka: ['M1', 'NGC 1952', 'Crab'], cls: 'nebula', te: 'Supernova remnant', ta: 'بقايا مستعر أعظم', ra: 83.63, dec: 22.01, mag: 7.5, tK: 12000, size: 0.15, con: 'Taurus', ly: 6500, vis: 6, sim: { variable: { amp: 0.06, period: 3, phase: 0.1 } },
      de: 'The glowing wreckage of a star that exploded nearly a thousand years ago.', da: 'حطام متوهج لنجم انفجر قبل نحو ألف عام.',
      we: 'Infrared reveals dust grains forged in the explosion, plus filaments of heated gas.', wa: 'تكشف الأشعة تحت الحمراء حبيبات الغبار التي تكوّنت في الانفجار وخيوط الغاز المسخّن.' },
    { id: 'barnard', en: "Barnard's Star", ar: 'نجم بارنارد', aka: ['barnards', 'barnard', 'GJ 699'], cls: 'star', te: 'Fast-moving red dwarf', ta: 'قزم أحمر سريع الحركة', ra: 269.45, dec: 4.69, mag: 9.5, tK: 3200, size: 0.01, con: 'Ophiuchus', ly: 6, spec: 'M4V', vis: 6, sim: { mover: { px: 6 } },
      de: 'A faint red dwarf that races across the sky faster than any other star.', da: 'قزم أحمر خافت يعبر السماء أسرع من أي نجم آخر.',
      we: 'Comparing visits months apart shows it shifting against the background stars. Try the Comparison view.', wa: 'مقارنة الزيارات المتباعدة بأشهر تُظهر انزياحه أمام النجوم الخلفية. جرّب شاشة المقارنة.' },
    { id: 'wise0855', en: 'WISE 0855−0714', ar: 'وايز 0855−0714', aka: ['wise 0855', 'wise0855', 'planet x', 'brown dwarf', 'القزم البني'], cls: 'brown-dwarf', te: 'Coldest brown dwarf', ta: 'أبرد قزم بني', ra: 133.8, dec: -7.25, mag: 12.0, tK: 285, size: 0.005, con: 'Hydra', ly: 7.4, spec: 'Y (est.)', vis: 6, sim: { mover: { px: 5 } },
      de: 'A failed star about as cold as a winter day, glowing only in infrared.', da: 'نجم فاشل بارد كيوم شتوي، لا يتوهج إلا في الأشعة تحت الحمراء.',
      we: 'It is almost invisible in short wavelengths. It appears only in the longest infrared bands, and it drifts between visits.', wa: 'يكاد يختفي في الأطوال القصيرة، ويظهر فقط عند أطول النطاقات تحت الحمراء، ويتحرك بين الزيارات.' },
    { id: 'sgra', en: 'Galactic Center', ar: 'مركز المجرة', aka: ['Sgr A*', 'Sgr A', 'galactic centre', 'milky way center'], cls: 'region', te: 'Dusty galactic core', ta: 'نواة مجرية مغبرّة', ra: 266.42, dec: -29.0, mag: 4.8, tK: 4000, size: 2.0, con: 'Sagittarius', ly: 26000, vis: 6,
      de: 'The crowded center of our own Milky Way, hidden behind thick dust.', da: 'قلب مجرتنا درب التبانة المزدحم، المحجوب خلف غبار كثيف.',
      we: 'In visible light, dark dust lanes block the view. Infrared cuts through, revealing countless stars.', wa: 'في الضوء المرئي تحجب حارات الغبار المظلمة الرؤية، أما الأشعة تحت الحمراء فتخترقها وتكشف عددًا لا يحصى من النجوم.' },
    { id: 'pleiades', en: 'Pleiades', ar: 'الثريا', aka: ['M45', 'seven sisters'], cls: 'cluster', te: 'Young star cluster', ta: 'عنقود نجمي فتي', ra: 56.75, dec: 24.12, mag: 1.6, tK: 12000, size: 2.0, con: 'Taurus', ly: 445, vis: 6,
      de: 'A tight family of hot blue stars, born together about 100 million years ago.', da: 'عائلة متراصة من النجوم الزرقاء الحارة وُلدت معًا قبل نحو 100 مليون سنة.',
      we: 'Its hot stars fade in the long bands, a good example of how color changes with wavelength.', wa: 'تخفت نجومها الحارة في النطاقات الطويلة، وهو مثال جيد على تغيّر اللون مع الطول الموجي.' },
    { id: 'ring', en: 'Ring Nebula', ar: 'سديم الحلقة', aka: ['M57', 'NGC 6720'], cls: 'nebula', te: 'Planetary nebula', ta: 'سديم كوكبي', ra: 283.4, dec: 33.03, mag: 8.8, tK: 100000, size: 0.08, con: 'Lyra', ly: 2300, vis: 6,
      de: 'A shell of gas shed by a dying Sun-like star.', da: 'غلاف من الغاز لفظه نجم يحتضر يشبه شمسنا.',
      we: 'Molecular hydrogen in its outer shell glows in the infrared, and the ring looks larger there.', wa: 'يتوهج الهيدروجين الجزيئي في غلافه الخارجي بالأشعة تحت الحمراء، فتبدو الحلقة أكبر.' },
    { id: 'eagle', en: 'Eagle Nebula', ar: 'سديم النسر', aka: ['M16', 'NGC 6611', 'pillars of creation', 'Eagle'], cls: 'nebula', te: 'Nebula with dust pillars', ta: 'سديم بأعمدة غبار', ra: 274.7, dec: -13.81, mag: 6.0, tK: 9000, size: 0.5, con: 'Serpens', ly: 7000, vis: 6,
      de: 'Home of the famous “Pillars of Creation”: towers of gas and dust.', da: 'موطن «أعمدة الخلق» الشهيرة: أبراج من الغاز والغبار.',
      we: 'Infrared shows stars still forming inside the pillars that look solid in visible light.', wa: 'تُظهر الأشعة تحت الحمراء نجومًا لا تزال تتشكل داخل الأعمدة التي تبدو صلبة في الضوء المرئي.' },
    { id: 'rhoph', en: 'Rho Ophiuchi Cloud', ar: 'سحابة رو الحوّاء', aka: ['rho oph', 'ophiuchus cloud'], cls: 'region', te: 'Dark cloud complex', ta: 'مجمّع سحب معتمة', ra: 246.8, dec: -24.6, mag: 5.0, tK: 3000, size: 2.0, con: 'Ophiuchus', ly: 390, vis: 6,
      de: 'A cold, dark cloud full of stars that have only just begun to shine.', da: 'سحابة باردة معتمة مليئة بنجوم بدأت لتوّها بالتوهج.',
      we: 'Its dust is so dense that visible light cannot escape, but infrared lights up the hidden stars.', wa: 'غبارها كثيف لدرجة أن الضوء المرئي لا يفلت منه، لكن الأشعة تحت الحمراء تضيء النجوم المختبئة.' },
    { id: 'lmc', en: 'Large Magellanic Cloud', ar: 'سحابة ماجلان الكبرى', aka: ['LMC', 'magellanic'], cls: 'galaxy', te: 'Dwarf galaxy', ta: 'مجرة قزمة', ra: 80.89, dec: -69.76, mag: 0.9, tK: 5500, size: 8.0, con: 'Dorado', ly: 160000, vis: 3, partial: true,
      de: 'A small galaxy orbiting the Milky Way, visible from the southern hemisphere.', da: 'مجرة صغيرة تدور حول درب التبانة وتُرى من نصف الكرة الجنوبي.',
      we: 'It contains big star-forming regions whose warm dust glows brightly in the infrared.', wa: 'تضم مناطق تشكّل نجوم ضخمة يتوهج غبارها الدافئ بشدة في الأشعة تحت الحمراء.' },
    { id: 'fomalhaut', en: 'Fomalhaut', ar: 'فم الحوت', aka: ['alpha PsA'], cls: 'star', te: 'Star with a debris ring', ta: 'نجم بحلقة حطام', ra: 344.41, dec: -29.62, mag: 1.2, tK: 8600, size: 0.02, con: 'Piscis Austrinus', ly: 25, spec: 'A3V', vis: 6,
      de: 'A bright star circled by a wide belt of icy rubble.', da: 'نجم ساطع يحيط به حزام واسع من حطام جليدي.',
      we: 'The belt is cold, so it shines mostly at longer infrared wavelengths.', wa: 'الحزام بارد، لذا يلمع غالبًا عند الأطوال الموجية تحت الحمراء الأطول.' },
    { id: 'antares', en: 'Antares', ar: 'قلب العقرب', aka: ['alpha Sco'], cls: 'star', te: 'Red supergiant', ta: 'عملاق فائق أحمر', ra: 247.35, dec: -26.43, mag: 1.0, tK: 3500, size: 0.02, con: 'Scorpius', ly: 550, spec: 'M1.5 Iab', vis: 6, sim: { variable: { amp: 0.12, period: 5.5, phase: 2.1 } },
      de: 'The glowing red heart of the Scorpion, a swollen giant star.', da: 'القلب الأحمر المتوهج للعقرب، نجم عملاق منتفخ.',
      we: 'Like Betelgeuse, it outshines hot stars at longer infrared wavelengths.', wa: 'مثل منكب الجوزاء، يتفوق على النجوم الحارة عند الأطوال تحت الحمراء الأطول.' },
    { id: 'polaris', en: 'Polaris', ar: 'النجم القطبي', aka: ['north star', 'alpha UMi', 'pole star', 'الجدي'], cls: 'star', te: 'Pulsating supergiant', ta: 'عملاق فائق نابض', ra: 37.95, dec: 89.26, mag: 2.0, tK: 6000, size: 0.02, con: 'Ursa Minor', ly: 430, spec: 'F7 Ib', vis: 0, sim: { variable: { amp: 0.1, period: 2, phase: 0 } },
      de: 'The North Star: it barely moves, so it helps you find north.', da: 'النجم القطبي: بالكاد يتحرك، ولهذا يساعدك على إيجاد الشمال.',
      we: 'Its slight pulsing is a nice demo of how brightness can change between visits.', wa: 'نبضه الخفيف مثال جيد على تغيّر اللمعان بين الزيارات.' },
    { id: 'proxima', en: 'Proxima Centauri', ar: 'قنطورس الأقرب', aka: ['proxima', 'alpha cen c'], cls: 'star', te: 'Nearest-neighbor red dwarf', ta: 'قزم أحمر هو الجار الأقرب', ra: 217.43, dec: -62.68, mag: 11.0, tK: 3050, size: 0.01, con: 'Centaurus', ly: 4.2, spec: 'M5.5 Ve', vis: 4, partial: true, sim: { mover: { px: 3 }, variable: { amp: 0.08, period: 1.5, phase: 1 } },
      de: 'The closest star to the Sun. Small, cool, and surprisingly flare-prone.', da: 'أقرب نجم إلى الشمس. صغير وبارد وكثير التوهجات.',
      we: 'A cool dwarf: faint in visible light but relatively bright in the infrared.', wa: 'قزم بارد: خافت في الضوء المرئي لكنه ساطع نسبيًا في الأشعة تحت الحمراء.' },
    { id: 'carina', en: 'Carina Nebula', ar: 'سديم كارينا', aka: ['NGC 3372', 'Carina'], cls: 'nebula', te: 'Giant star-forming nebula', ta: 'سديم عملاق لتكوّن النجوم', ra: 161.0, dec: -59.7, mag: 1.0, tK: 11000, size: 2.0, con: 'Carina', ly: 8500, vis: 6,
      de: 'One of the largest and brightest nebulae, full of enormous young stars.', da: 'من أكبر السدم وأسطعها، يعج بنجوم فتية هائلة.',
      we: 'Massive stars carve out cavities in the dust, and infrared captures both the stars and the sculpted walls.', wa: 'تحفر النجوم الضخمة تجاويف في الغبار، وتلتقط الأشعة تحت الحمراء النجوم والجدران المنحوتة معًا.' },
    { id: 'm33', en: 'Triangulum Galaxy', ar: 'مجرة المثلث', aka: ['M33', 'Triangulum'], cls: 'galaxy', te: 'Spiral galaxy', ta: 'مجرة حلزونية', ra: 23.46, dec: 30.66, mag: 5.7, tK: 5000, size: 1.1, con: 'Triangulum', ly: 2700000, vis: 6,
      de: 'A loosely wound spiral galaxy that belongs to our local group.', da: 'مجرة حلزونية فضفاضة اللفّ تنتمي إلى مجموعتنا المحلية.',
      we: 'Warm dust threads trace active star-forming regions along its arms.', wa: 'تتتبع خيوط الغبار الدافئ مناطق تشكل النجوم النشطة على طول أذرعها.' },
    { id: 'm104', en: 'Sombrero Galaxy', ar: 'مجرة السمبريرو', aka: ['M104', 'NGC 4594', 'Sombrero'], cls: 'galaxy', te: 'Dusty spiral galaxy', ta: 'مجرة حلزونية مغبرّة', ra: 190.0, dec: -11.62, mag: 8.0, tK: 4500, size: 0.15, con: 'Virgo', ly: 29000000, vis: 6,
      de: 'A galaxy with a bright core and a bold dark band of dust, like a hat.', da: 'مجرة ذات نواة ساطعة وحزام غبار داكن بارز كالقبعة.',
      we: 'Infrared passes through that dust band and shows its smooth, glowing ring.', wa: 'تخترق الأشعة تحت الحمراء حزام الغبار وتُظهر حلقتها الناعمة المتوهجة.' }
  ];

  /* Internal "render record" (mock-only fields) keyed by target id. */
  M.RECORDS = {};
  R.forEach(function (r) { M.RECORDS[r.id] = r; });

  function availabilityOf(r) { return r.vis === 0 ? 'none' : (r.partial ? 'partial' : 'available'); }

  /* Convert a compact record to a contract `Target`. */
  M.toTarget = function (r) {
    const meta = [{ key: 'distance', value: r.ly, unit: 'ly' }];
    if (r.cls === 'star' || r.cls === 'brown-dwarf') meta.push({ key: 'temperature', value: r.tK, unit: 'K' });
    if (r.spec) meta.push({ key: 'spectralType', value: r.spec });
    meta.push({ key: 'angularSize', value: r.size, unit: 'deg' });
    meta.push({ key: 'apparentMagnitude', value: r.mag });
    return {
      id: r.id,
      name: { en: r.en, ar: r.ar },
      aliases: r.aka.slice(),
      classification: r.cls,
      typeLabel: { en: r.te, ar: r.ta },
      coordinates: { ra: r.ra, dec: r.dec },
      constellation: r.con,
      description: { en: r.de, ar: r.da },
      whyInfrared: { en: r.we, ar: r.wa },
      distanceLightYears: r.ly,
      temperatureKelvin: r.tK,
      angularSizeDeg: r.size,
      apparentMagnitude: r.mag,
      metadata: meta,
      availability: availabilityOf(r),
      observationCount: r.vis,
      isSimulated: true,
      demo: r.sim || {}
    };
  };

  M.ids = R.map(function (r) { return r.id; });
})();
