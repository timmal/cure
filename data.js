/* Назначения, слоты и логика расписания. Чистые функции без DOM и хранилища. */
(function (global) {
  'use strict';

  const YEAR = 2026, MONTH_INDEX = 8; // сентябрь 2026
  const MON = 'сентября';
  const MON_SHORT = 'сен';
  const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  const MEDS = {
    nosol:  { name: 'Но-Соль', sub: '2 впрыска в каждую ноздрю', form: 'Увлажняющий спрей для носа 0,65%, 15 мл', how: '3–4 раза в день, по 2 впрыска в каждую ноздрю', course: '5 дней, 11–15 сентября' },
    evk:    { name: 'Эвказолин Аква', sub: '2 впрыска в каждую ноздрю', form: 'Спрей для носа 1 мг/г, 10 г', how: '2 раза в день, по 2 впрыска в каждую ноздрю', course: '5 дней, 11–15 сентября' },
    fliks:  { name: 'Фликс', sub: '2 впрыска в каждую ноздрю', form: 'Спрей для носа, суспензия 0,05%, 9 г', how: '2 раза в день, по 2 впрыска в каждую ноздрю', course: '5 дней, 11–15 сентября' },
    imet:   { name: 'Имет 400 мг', sub: '1 таблетка после еды', form: 'Таблетки в плёночной оболочке 400 мг, №10', how: '2 раза в день по 1 таблетке после еды', course: '2–3 дня, с 11 сентября (срок поправлен ручкой)' },
    fervex: { name: 'Фервекс', sub: '1 пакетик', form: 'Пакетики, дописан врачом ручкой', how: '2 раза в день по 1 пакетику', course: '2–3 дня, с 11 сентября' },
    dek:    { name: 'Декатилен Орис', sub: 'Оросить горло', form: 'Спрей для полости рта 1,5 мг/мл, 30 мл', how: 'Орошать горло 3 раза в день', course: '5 дней, 11–15 сентября' },
    lizak:  { name: 'Лизак', sub: '1 таблетка, рассасывать', form: 'Таблетки для рассасывания со вкусом апельсина, №20', how: '3 раза в день по 1 таблетке', course: '5 дней, 11–15 сентября' },
    sum:    { name: 'Сумамед 500 мг', sub: '1 таблетка между едой', form: 'Таблетки в плёночной оболочке 500 мг, №3', how: '1 раз в день между приёмами пищи', course: '3 дня, начать после результатов анализов' },
  };

  const SLOTS = [
    { id: 'm', title: 'Утро',       hint: 'до 12:00' },
    { id: 'd', title: 'День',       hint: '12:00–17:00' },
    { id: 'e', title: 'Вечер',      hint: '17:00–21:00' },
    { id: 'n', title: 'Перед сном', hint: 'после 21:00' },
  ];
  const SLOT_TITLE = { m: 'утро', d: 'день', e: 'вечер', n: 'перед сном' };

  const TASKS = {
    tests: { name: 'Сдать анализы крови', sub: 'Общий развёрнутый и С-реактивный белок (количественный), за 4 часа не есть' },
    visit: { name: 'Повторная консультация терапевта', sub: 'С результатами анализов' },
  };

  const DOCTOR_NOTES = [
    'Стрелками задан порядок спреев: Но-Соль, затем Эвказолин, затем Фликс.',
    'Надпись у стрелок «2×1–5» понята как 2 раза в день, 5 дней. Интервалы между спреями врач не указал.',
    'У Имета срок поправлен ручкой: 2–3 дня вместо 3.',
    'Дописано сверху: Фервекс, 1 пакетик 2 раза в день, 2–3 дня.',
    'Анализы крови сдать до 11 сентября, повторная консультация до 16 сентября.',
  ];

  const FIRST_DAY = 11;
  const MAIN_END = 15;
  const VISIT_DAY = 16;

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${YEAR}-${pad(MONTH_INDEX + 1)}-${pad(d)}`;
  const weekday = d => new Date(YEAR, MONTH_INDEX, d).getDay();

  /** Номер «сегодня» относительно 1 сентября 2026 по локальному времени. Может выходить за пределы месяца. */
  function todayNum(now) {
    const n = now || new Date();
    const start = new Date(YEAR, MONTH_INDEX, 1);
    const cur = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((cur - start) / 86400000) + 1;
  }

  function currentSlot(now) {
    const h = (now || new Date()).getHours();
    return h < 12 ? 'm' : h < 17 ? 'd' : h < 21 ? 'e' : 'n';
  }

  function lastDay(sumStart) {
    return Math.max(VISIT_DAY, sumStart ? sumStart + 2 : 0);
  }

  function clampDay(d, sumStart) {
    return Math.min(Math.max(d, FIRST_DAY), lastDay(sumStart));
  }

  function dosesFor(day, sumStart) {
    const s = { m: [], d: [], e: [], n: [] };
    const main = day >= FIRST_DAY && day <= MAIN_END;
    const short = day >= FIRST_DAY && day <= 13;
    const shortOpt = day === 13;
    const nose = slot => [['nosol', 1], ['evk', 2], ['fliks', 3]].forEach(([med, step]) => s[slot].push({ med, step, group: 'nose' }));
    const shortRows = () => [{ med: 'imet', optional: shortOpt, optLabel: 'если нужно' }, { med: 'fervex', optional: shortOpt, optLabel: 'если нужно' }];

    if (main) nose('m');
    if (short) s.m.push(...shortRows());
    if (main) s.m.push({ med: 'dek' }, { med: 'lizak' });

    if (sumStart && day >= sumStart && day <= sumStart + 2) s.d.push({ med: 'sum' });
    if (main) s.d.push({ med: 'nosol' }, { med: 'dek' }, { med: 'lizak' });

    if (main) nose('e');
    if (short) s.e.push(...shortRows());
    if (main) s.e.push({ med: 'dek' }, { med: 'lizak' });

    if (main) s.n.push({ med: 'nosol', optional: true, optLabel: 'по желанию' });
    return s;
  }

  function tasksFor(day) {
    const t = [];
    if (day === FIRST_DAY) t.push('tests');
    if (day === VISIT_DAY) t.push('visit');
    return t;
  }

  function progress(day, state) {
    const s = dosesFor(day, state.sumStart), c = state.checks[dayKey(day)] || {};
    let total = 0, done = 0;
    for (const id in s) for (const it of s[id]) {
      if (it.optional) continue;
      total++; if (c[`${id}:${it.med}`]) done++;
    }
    for (const t of tasksFor(day)) { total++; if (state.tasks[t]) done++; }
    return { total, done };
  }

  /** ISO → 'HH:MM' по локальному времени. */
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** ISO → '11 сен, 13:02'. */
  function fmtStamp(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getDate()} ${MON_SHORT}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** Текст записи журнала. */
  function describeLog(e) {
    const dayOf = () => {
      if (!e.date) return '';
      const at = new Date(e.at);
      if (!isNaN(at) && dayKey(at.getDate()) === e.date && at.getMonth() === MONTH_INDEX && at.getFullYear() === YEAR) return '';
      return ` за ${+e.date.slice(-2)} ${MON_SHORT}`;
    };
    switch (e.type) {
      case 'check': case 'uncheck': {
        const [slot, med] = (e.key || ':').split(':');
        const m = MEDS[med];
        return `${e.type === 'check' ? 'отмечен' : 'снята отметка'} ${m ? m.name : med} (${SLOT_TITLE[slot] || slot})${dayOf()}`;
      }
      case 'task': case 'untask': {
        const t = TASKS[e.key];
        return `${e.type === 'task' ? 'выполнено' : 'снята отметка'}: ${t ? t.name : e.key}`;
      }
      case 'sum-start': return `старт Сумамеда с ${e.key} ${MON}`;
      case 'sum-cancel': return 'старт Сумамеда отменён';
      case 'reset': return 'сброс всех отметок';
      default: return e.type;
    }
  }

  global.CURE = {
    YEAR, MONTH_INDEX, MON, MON_SHORT, WD_SHORT, WD_FULL, MEDS, SLOTS, TASKS, DOCTOR_NOTES,
    FIRST_DAY, MAIN_END, VISIT_DAY,
    pad, dayKey, weekday, todayNum, currentSlot, lastDay, clampDay, dosesFor, tasksFor, progress,
    fmtTime, fmtStamp, describeLog,
  };
})(window);
