/* Хранилище: localStorage, версия, миграции, битые данные, экспорт и импорт. */
(function (global) {
  'use strict';

  const KEY = 'med-tracker:v1';
  const VERSION = 1;
  const LOG_LIMIT = 500;
  const LOG_TYPES = new Set(['check', 'uncheck', 'task', 'untask', 'sum-start', 'sum-cancel', 'reset']);

  const fresh = () => ({ version: VERSION, checks: {}, tasks: {}, sumStart: null, log: [] });

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const isDateKey = k => /^2026-09-\d{2}$/.test(k);
  const isDoseKey = k => /^[mden]:[a-z]+$/.test(k);
  const isIso = v => typeof v === 'string' && !isNaN(new Date(v));

  /**
   * Приводит произвольный объект к StateV1 или бросает ошибку с понятным текстом.
   * Используется и для localStorage, и для импорта файла.
   */
  function validate(raw) {
    if (!isObj(raw)) throw new Error('не объект');
    const v = raw.version;
    if (v !== undefined && v !== VERSION) {
      if (typeof v === 'number' && v > VERSION) throw new Error(`версия ${v} новее, чем поддерживает приложение`);
      raw = migrate(raw);
    }
    const s = fresh();
    if (raw.checks !== undefined) {
      if (!isObj(raw.checks)) throw new Error('checks не объект');
      for (const dk in raw.checks) {
        if (!isDateKey(dk) || !isObj(raw.checks[dk])) throw new Error(`плохой ключ дня ${dk}`);
        const day = {};
        for (const k in raw.checks[dk]) {
          const t = raw.checks[dk][k];
          if (!isDoseKey(k) || !isIso(t)) throw new Error(`плохая отметка ${dk} ${k}`);
          day[k] = t;
        }
        if (Object.keys(day).length) s.checks[dk] = day;
      }
    }
    if (raw.tasks !== undefined) {
      if (!isObj(raw.tasks)) throw new Error('tasks не объект');
      for (const k of ['tests', 'visit']) if (raw.tasks[k] !== undefined) {
        if (!isIso(raw.tasks[k])) throw new Error(`плохая отметка дела ${k}`);
        s.tasks[k] = raw.tasks[k];
      }
    }
    if (raw.sumStart !== undefined && raw.sumStart !== null) {
      const n = raw.sumStart;
      if (!Number.isInteger(n) || n < 1 || n > 31) throw new Error('sumStart вне диапазона');
      s.sumStart = n;
    }
    if (raw.log !== undefined) {
      if (!Array.isArray(raw.log)) throw new Error('log не массив');
      s.log = raw.log
        .filter(e => isObj(e) && isIso(e.at) && LOG_TYPES.has(e.type))
        .map(e => {
          const o = { at: e.at, type: e.type };
          if (typeof e.date === 'string') o.date = e.date;
          if (typeof e.key === 'string') o.key = e.key;
          return o;
        })
        .slice(-LOG_LIMIT);
    }
    return s;
  }

  /** Точка для миграций старых версий. Сейчас версий до 1 не было, отдаём объект как есть. */
  function migrate(raw) {
    return Object.assign({}, raw, { version: VERSION });
  }

  function probeStorage() {
    try {
      const k = KEY + ':probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /** Синхронное чтение. Возвращает {state, note, available}. */
  function load() {
    const available = probeStorage();
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* недоступно */ }
    if (raw == null) return { state: fresh(), note: null, available };
    try {
      return { state: validate(JSON.parse(raw)), note: null, available };
    } catch (e) {
      let note = 'Сохранённые данные были повреждены, начали с чистого листа.';
      try {
        localStorage.setItem(`${KEY}:corrupt-${Date.now()}`, raw);
        note += ' Старая копия оставлена в хранилище.';
      } catch (e2) { /* нет места, ничего страшного */ }
      return { state: fresh(), note, available };
    }
  }

  /** Синхронная запись. Возвращает true при успехе. */
  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }

  function appendLog(state, entry) {
    state.log.push(entry);
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }

  function serialize(state) {
    return JSON.stringify(state, null, 2);
  }

  /** Разбор импортируемого файла. Бросает ошибку с текстом для пользователя. */
  function parseImport(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error('файл не JSON'); }
    return validate(raw);
  }

  function requestPersist() {
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        return navigator.storage.persist().catch(() => false);
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve(false);
  }

  global.CURE_STORE = { KEY, VERSION, LOG_LIMIT, fresh, validate, load, save, appendLog, serialize, parseImport, requestPersist };
})(window);
