/* Рендер и обработка событий. Состояние читается синхронно до первого кадра. */
(function () {
  'use strict';
  const C = window.CURE, S = window.CURE_STORE;
  const $ = id => document.getElementById(id);

  const CHECK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // ---- состояние ----
  const loaded = S.load();
  let state = loaded.state;
  let storageOk = loaded.available;
  let saveFailed = false;
  let viewDay, today = C.todayNum(), slotNow = C.currentSlot();
  let justKey = null, refOpen = false, resetArmed = false, resetTimer = null;
  let pendingImport = null; // {state, count} — ждёт подтверждения

  viewDay = C.clampDay(today, state.sumStart);

  // ---- запись ----
  function commit() {
    if (!storageOk) return;
    saveFailed = !S.save(state);
  }

  function log(type, extra) {
    S.appendLog(state, Object.assign({ at: new Date().toISOString(), type }, extra || {}));
  }

  // ---- рендер ----
  function renderDays(scroll) {
    const el = $('days');
    let html = '';
    for (let d = C.FIRST_DAY; d <= C.lastDay(state.sumStart); d++) {
      const { total, done } = C.progress(d, state);
      const pct = total ? Math.round(done / total * 100) : 0;
      html += `<button class="day" data-day="${d}" aria-current="${d === viewDay}" aria-label="${d} ${C.MON}, отмечено ${done} из ${total}">
        <span class="wd">${d === today ? 'сегодня' : C.WD_SHORT[C.weekday(d)]}</span>
        <span class="dn">${d}</span>
        <span class="bar"><i style="width:${pct}%"></i></span>
      </button>`;
    }
    el.innerHTML = html;
    if (scroll) {
      const a = el.querySelector('[aria-current="true"]');
      if (a) el.scrollLeft = a.offsetLeft - el.clientWidth / 2 + a.offsetWidth / 2;
    }
  }

  function row(attrs, on, mark, name, sub, meta, cls) {
    return `<button class="dose${cls}" ${attrs} aria-pressed="${on}">
      <span class="mark" aria-hidden="true">${mark}</span>
      <span class="txt"><span class="name">${name}</span><span class="sub">${sub}</span></span>
      <span class="meta">${meta}</span>
    </button>`;
  }

  function doseRow(slotId, it, checks) {
    const m = C.MEDS[it.med], k = `${slotId}:${it.med}`, t = checks[k], on = !!t;
    const mark = on ? CHECK : (it.step || '');
    const meta = on ? C.fmtTime(t) : (it.optional ? it.optLabel : '');
    const cls = (it.optional ? ' opt' : '') + (on && justKey === k ? ' pop' : '');
    return row(`data-k="${k}"`, on, mark, m.name, m.sub, meta, cls);
  }

  function renderMain() {
    const d = viewDay;
    const checks = state.checks[C.dayKey(d)] || {};
    const slots = C.dosesFor(d, state.sumStart), { total, done } = C.progress(d, state);

    const title = d <= C.MAIN_END ? `День ${d - C.FIRST_DAY + 1} из 5` : (slots.d.length ? 'Сумамед' : 'Визит к врачу');
    const wdName = C.WD_FULL[C.weekday(d)];
    const dateLine = d === today ? `Сегодня, ${wdName}, ${d} ${C.MON}` : `${wdName[0].toUpperCase() + wdName.slice(1)}, ${d} ${C.MON}`;
    const notes = [];
    if (state.sumStart) notes.push(`Сумамед: ${state.sumStart}–${state.sumStart + 2} ${C.MON}`);
    if (!state.tasks.visit && d < C.VISIT_DAY) notes.push(`Повторный визит к терапевту до ${C.VISIT_DAY} ${C.MON}`);

    let html = `<section class="summary">
      <div class="sum-top">
        <div><p class="sum-date">${dateLine}</p><h2 class="sum-title">${title}</h2></div>
        <p class="sum-count" id="sumCount">${total ? `<b>${done}</b> из ${total}` : 'Нет приёмов'}</p>
      </div>
      <div class="progress" role="progressbar" aria-label="Отмечено за день" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
      ${notes.length ? `<ul class="sum-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
    </section>`;

    if (!state.sumStart && d >= C.FIRST_DAY && d <= C.MAIN_END) {
      html += `<section class="gate">
        <h3>Сумамед ждёт результатов анализов</h3>
        <p>Когда результаты придут, начни курс: 3 дня по 1 таблетке между едой. Приём появится в блоке «День».</p>
        <button class="btn" id="startSum">${d === today ? 'Начать курс сегодня' : `Начать курс с ${d} ${C.MON}`}</button>
      </section>`;
    }

    const tl = C.tasksFor(d);
    if (tl.length) {
      html += `<section class="slot"><div class="slot-head"><h2>Дела</h2></div><div class="slot-body">` +
        tl.map(id => {
          const t = C.TASKS[id], v = state.tasks[id], on = !!v;
          const cls = on && justKey === 'task:' + id ? ' pop' : '';
          return row(`data-task="${id}"`, on, on ? CHECK : '', t.name, t.sub, on ? C.fmtTime(v) : '', cls);
        }).join('') + `</div></section>`;
    }

    const cs = d === today ? slotNow : null;
    for (const s of C.SLOTS) {
      const items = slots[s.id];
      if (!items.length) continue;
      let body = '', inNose = false;
      for (const it of items) {
        if (it.group === 'nose' && !inNose) { body += `<p class="group-label">Нос, строго по порядку</p>`; inNose = true; }
        else if (!it.group && inNose) { body += `<div class="group-sep"></div>`; inNose = false; }
        body += doseRow(s.id, it, checks);
      }
      const isNow = cs === s.id;
      html += `<section class="slot${isNow ? ' is-now' : ''}" data-slot="${s.id}">
        <div class="slot-head"><h2>${s.title}</h2><span class="hint">${s.hint}</span>${isNow ? '<span class="now">сейчас</span>' : ''}</div>
        <div class="slot-body">${body}</div>
      </section>`;
    }

    html += `<details class="ref" id="refAll"${refOpen ? ' open' : ''}><summary>Все назначения</summary>` +
      Object.values(C.MEDS).map(m => `<div class="ref-item"><p class="ref-name">${m.name}</p><p>${m.form}</p><p>${m.how}. ${m.course}.</p></div>`).join('') +
      `<div class="ref-item"><p class="ref-name">Пометки врача</p>${C.DOCTOR_NOTES.map(n => `<p>${n}</p>`).join('')}</div></details>`;

    return html;
  }

  function renderLog() {
    const el = $('log');
    const items = state.log.slice().reverse().slice(0, 100);
    if (!items.length) { el.innerHTML = '<li class="empty">Пока пусто</li>'; return; }
    el.innerHTML = items.map(e =>
      `<li><time datetime="${esc(e.at)}">${C.fmtStamp(e.at)} —</time><span>${esc(C.describeLog(e))}</span></li>`).join('');
  }

  function renderFoot() {
    const st = $('status');
    st.className = 'status';
    if (!storageOk) { st.classList.add('err'); st.textContent = 'Отметки не сохраняются: хранилище недоступно (приватный режим или нет места).'; }
    else if (saveFailed) { st.classList.add('err'); st.textContent = 'Отметки не сохраняются: не удалось записать в хранилище.'; }
    else st.textContent = 'Отметки сохраняются на этом устройстве';

    let html = '';
    if (pendingImport) {
      html = `<div class="confirm" role="group" aria-label="Подтверждение импорта">
        <span>Заменить текущие отметки данными из файла? В файле: ${pendingImport.count} отм., Сумамед ${pendingImport.state.sumStart ? `с ${pendingImport.state.sumStart} ${C.MON}` : 'не запущен'}.</span>
        <span class="row"><button class="btn" id="importOk">Заменить</button><button class="btn ghost" id="importCancel">Отмена</button></span>
      </div>`;
    }
    html += `<button class="link" id="export">Скачать отметки</button>
      <button class="link" id="import">Загрузить отметки</button>` +
      (state.sumStart ? `<button class="link" id="cancelSum">Отменить старт Сумамеда</button>` : '') +
      `<button class="link${resetArmed ? ' danger' : ''}" id="reset">${resetArmed ? 'Нажми ещё раз, чтобы сбросить' : 'Сбросить все отметки'}</button>`;
    $('footActions').innerHTML = html;
  }

  function render(scrollDays) {
    viewDay = C.clampDay(viewDay, state.sumStart);
    renderDays(scrollDays);
    $('main').innerHTML = renderMain();
    renderLog();
    renderFoot();
    justKey = null;
  }

  function showNote(text) {
    const el = $('note');
    el.textContent = text || '';
    el.hidden = !text;
  }

  function refocus(sel) {
    const el = document.querySelector(sel);
    if (el) el.focus({ preventScroll: true });
  }

  // ---- действия ----
  function toggleDose(k) {
    const dk = C.dayKey(viewDay);
    const c = state.checks[dk] || (state.checks[dk] = {});
    if (c[k]) { delete c[k]; log('uncheck', { date: dk, key: k }); if (!Object.keys(c).length) delete state.checks[dk]; }
    else { c[k] = new Date().toISOString(); justKey = k; log('check', { date: dk, key: k }); }
    commit(); render(); refocus(`[data-k="${k}"]`);
  }

  function toggleTask(id) {
    if (state.tasks[id]) { delete state.tasks[id]; log('untask', { key: id }); }
    else { state.tasks[id] = new Date().toISOString(); justKey = 'task:' + id; log('task', { key: id }); }
    commit(); render(); refocus(`[data-task="${id}"]`);
  }

  function startSum(day) {
    state.sumStart = day; log('sum-start', { key: String(day) }); commit(); render(true);
  }

  function cancelSum() {
    state.sumStart = null; log('sum-cancel'); commit(); render(true);
  }

  function reset() {
    const keep = state.log;
    state = S.fresh();
    state.log = keep;
    log('reset');
    commit(); render(true);
  }

  function exportState() {
    const blob = new Blob([S.serialize(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const n = new Date();
    a.href = url;
    a.download = `med-tracker-${C.YEAR}-${C.pad(n.getMonth() + 1)}-${C.pad(n.getDate())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onImportFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = S.parseImport(String(r.result));
        let count = Object.keys(s.tasks).length;
        for (const dk in s.checks) count += Object.keys(s.checks[dk]).length;
        pendingImport = { state: s, count };
        showNote('');
        renderFoot(); refocus('#importOk');
      } catch (e) {
        pendingImport = null;
        showNote(`Файл не подошёл: ${e.message}.`);
        renderFoot();
      }
    };
    r.onerror = () => { showNote('Не удалось прочитать файл.'); };
    r.readAsText(file);
  }

  function applyImport() {
    if (!pendingImport) return;
    state = pendingImport.state;
    pendingImport = null;
    commit(); render(true);
  }

  // ---- синхронизация времени и вкладок ----
  function tick() {
    const t = C.todayNum(), s = C.currentSlot();
    if (t === today && s === slotNow) return false;
    const wasOnToday = viewDay === C.clampDay(today, state.sumStart);
    today = t; slotNow = s;
    if (wasOnToday) viewDay = C.clampDay(today, state.sumStart);
    return true;
  }

  function tickAndRender() {
    if (tick()) render(true);
  }

  function reloadFromStorage() {
    const l = S.load();
    if (l.note) showNote(l.note);
    state = l.state;
    storageOk = l.available;
    render();
  }

  // ---- события ----
  document.addEventListener('toggle', e => {
    if (e.target.id === 'refAll') refOpen = e.target.open;
  }, true);

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.day) {
      viewDay = +b.dataset.day;
      render(true);
      window.scrollTo({ top: 0 });
      refocus(`[data-day="${viewDay}"]`);
      return;
    }
    if (b.dataset.k) return toggleDose(b.dataset.k);
    if (b.dataset.task) return toggleTask(b.dataset.task);
    switch (b.id) {
      case 'startSum': return startSum(viewDay);
      case 'cancelSum': return cancelSum();
      case 'export': return exportState();
      case 'import': $('importFile').value = ''; return $('importFile').click();
      case 'importOk': return applyImport();
      case 'importCancel': pendingImport = null; renderFoot(); return refocus('#import');
      case 'reset': {
        clearTimeout(resetTimer);
        if (!resetArmed) {
          resetArmed = true; renderFoot(); refocus('#reset');
          resetTimer = setTimeout(() => { resetArmed = false; renderFoot(); }, 3000);
        } else {
          resetArmed = false; reset();
        }
        return;
      }
    }
  });

  $('importFile').addEventListener('change', e => onImportFile(e.target.files && e.target.files[0]));

  window.addEventListener('storage', e => {
    if (e.key === S.KEY || e.key === null) reloadFromStorage();
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickAndRender(); });
  setInterval(() => {
    if (tick()) { render(true); return; }
    if (document.activeElement && document.activeElement.closest('.dose')) return;
  }, 60000);

  // ---- старт ----
  if (loaded.note) showNote(loaded.note);
  render(true);
  S.requestPersist();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  // Для тестов и отладки.
  window.__cure = { getState: () => state, getViewDay: () => viewDay, tick: tickAndRender };
})();
