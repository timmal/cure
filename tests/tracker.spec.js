// @ts-check
const { test, expect } = require('@playwright/test');
const { KEY, open, readState } = require('./helpers');

const dose = (page, k) => page.locator(`[data-k="${k}"]`);

test('отметка переживает перезагрузку, первый кадр без мигания', async ({ page }) => {
  await open(page, '2026-09-11T13:02:00');
  await dose(page, 'd:lizak').click();
  await expect(dose(page, 'd:lizak')).toHaveAttribute('aria-pressed', 'true');
  await expect(dose(page, 'd:lizak').locator('.meta')).toHaveText('13:02');

  const st = await readState(page);
  expect(st.version).toBe(1);
  expect(st.checks['2026-09-11']['d:lizak']).toMatch(/^2026-09-11T10:02:00/); // ISO в UTC
  expect(st.log.at(-1)).toMatchObject({ type: 'check', date: '2026-09-11', key: 'd:lizak' });

  // Первый кадр: до любых таймеров и асинхронщины отметка уже на месте.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      // @ts-ignore
      window.__firstFrame = document.querySelector('[data-k="d:lizak"]')?.getAttribute('aria-pressed');
    });
  });
  await page.reload();
  await page.waitForSelector('.dose');
  expect(await page.evaluate(() => /** @type any */(window).__firstFrame)).toBe('true');
  await expect(dose(page, 'd:lizak').locator('.meta')).toHaveText('13:02');
  await expect(page.locator('#log li').first()).toContainText('11 сен, 13:02');
  await expect(page.locator('#log li').first()).toContainText('отмечен Лизак (день)');
});

test('старт Сумамеда 12.09 переживает перезагрузку и растягивает ленту дней', async ({ page }) => {
  await open(page, '2026-09-12T09:00:00');
  await page.click('#startSum');
  await expect(page.locator('.sum-notes')).toContainText('Сумамед: 12–14 сентября');
  await page.reload();
  await page.waitForSelector('.dose');
  for (const d of [12, 13, 14]) {
    await page.click(`[data-day="${d}"]`);
    await expect(page.locator('[data-slot="d"] [data-k="d:sum"]')).toBeVisible();
  }
  await page.click('[data-day="15"]');
  await expect(dose(page, 'd:sum')).toHaveCount(0);
  await expect(page.locator('[data-day]')).toHaveCount(6); // 11..16

  // Старт 15.09 → лента до 17.09.
  await page.click('#cancelSum');
  await page.click('[data-day="15"]');
  await page.click('#startSum');
  await expect(page.locator('[data-day="17"]')).toBeVisible();
  await expect(page.locator('[data-day]')).toHaveCount(7);
});

test('отмена старта Сумамеда убирает его из расписания, но не из checks', async ({ page }) => {
  await open(page, '2026-09-12T13:00:00');
  await page.click('#startSum');
  await dose(page, 'd:sum').click();
  await page.click('#cancelSum');
  await expect(dose(page, 'd:sum')).toHaveCount(0);
  await expect(page.locator('#startSum')).toBeVisible();
  const st = await readState(page);
  expect(st.sumStart).toBeNull();
  expect(st.checks['2026-09-12']['d:sum']).toBeTruthy();
  expect(st.log.at(-1).type).toBe('sum-cancel');
});

test('часы 11.09 13:00: выбран 11-й, бейдж «сейчас» на слоте «День»', async ({ page }) => {
  await open(page, '2026-09-11T13:00:00');
  await expect(page.locator('[data-day="11"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-day="11"] .wd')).toHaveText('сегодня');
  await expect(page.locator('.slot.is-now')).toHaveAttribute('data-slot', 'd');
  await expect(page.locator('.slot.is-now .now')).toHaveText('сейчас');
  await expect(page.locator('.sum-date')).toContainText('Сегодня, пятница, 11 сентября');
});

test('часы 20.09: выбран последний день', async ({ page }) => {
  await open(page, '2026-09-20T10:00:00');
  await expect(page.locator('[data-day="16"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.slot.is-now')).toHaveCount(0);
  await expect(page.locator('[data-task="visit"]')).toBeVisible();
});

test('переход через полночь при открытой вкладке переключает «сегодня»', async ({ page }) => {
  await open(page, '2026-09-11T23:59:30');
  await expect(page.locator('[data-day="11"] .wd')).toHaveText('сегодня');
  await expect(page.locator('.slot.is-now')).toHaveAttribute('data-slot', 'n');
  await page.clock.runFor(2 * 60 * 1000);
  await expect(page.locator('[data-day="12"] .wd')).toHaveText('сегодня');
  await expect(page.locator('[data-day="12"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.slot.is-now')).toHaveAttribute('data-slot', 'm');
  await expect(page.locator('.sum-title')).toHaveText('День 2 из 5');
});

test('смена слота при открытой вкладке переносит бейдж «сейчас»', async ({ page }) => {
  await open(page, '2026-09-11T11:59:30');
  await expect(page.locator('.slot.is-now')).toHaveAttribute('data-slot', 'm');
  await page.clock.runFor(90 * 1000);
  await expect(page.locator('.slot.is-now')).toHaveAttribute('data-slot', 'd');
});

test('13.09: Имет и Фервекс «если нужно», не входят в знаменатель', async ({ page }) => {
  await open(page, '2026-09-13T09:00:00');
  for (const k of ['m:imet', 'm:fervex', 'e:imet', 'e:fervex']) {
    await expect(dose(page, k)).toHaveClass(/opt/);
    await expect(dose(page, k).locator('.meta')).toHaveText('если нужно');
  }
  // 3 носа + dek + lizak (утро) + nosol,dek,lizak (день) + 3 носа + dek + lizak (вечер) = 13
  await expect(page.locator('#sumCount')).toHaveText('0 из 13');
  await dose(page, 'm:imet').click();
  await expect(page.locator('#sumCount')).toHaveText('0 из 13');
  await dose(page, 'm:nosol').click();
  await expect(page.locator('#sumCount')).toHaveText('1 из 13');
  // 12.09 они обязательны: 13 + 4 = 17
  await page.click('[data-day="12"]');
  await expect(page.locator('#sumCount')).toHaveText('0 из 17');
  await expect(dose(page, 'm:imet')).not.toHaveClass(/opt/);
});

test('отметка в одной вкладке появляется во второй', async ({ context, page }) => {
  await open(page, '2026-09-11T13:00:00');
  const page2 = await context.newPage();
  await page2.clock.install({ time: new Date('2026-09-11T13:00:00+03:00') });
  await page2.goto('/');
  await page2.waitForSelector('.dose');
  await dose(page, 'm:dek').click();
  await expect(dose(page2, 'm:dek')).toHaveAttribute('aria-pressed', 'true');
  await expect(page2.locator('#log li').first()).toContainText('отмечен Декатилен Орис (утро)');
});

test('битый JSON не ломает приложение, сырое значение сохраняется', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-11T13:00:00+03:00') });
  await page.goto('/');
  await page.evaluate(k => localStorage.setItem(k, '{"version":1,"checks":{oops'), KEY);
  await page.reload();
  await page.waitForSelector('.dose');
  await expect(page.locator('#note')).toBeVisible();
  await expect(page.locator('#note')).toContainText('повреждены');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some(k => k.startsWith('med-tracker:v1:corrupt-'))).toBe(true);
  await dose(page, 'd:lizak').click();
  expect((await readState(page)).checks['2026-09-11']['d:lizak']).toBeTruthy();
});

test('версия из будущего тоже уводит в чистое состояние с заметкой', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ version: 99, checks: {} })), KEY);
  await page.reload();
  await page.waitForSelector('.dose');
  await expect(page.locator('#note')).toContainText('повреждены');
});

test('экспорт, сброс, импорт возвращают исходное состояние', async ({ page }) => {
  await open(page, '2026-09-11T13:00:00');
  await dose(page, 'm:nosol').click();
  await dose(page, 'd:lizak').click();
  await page.click('[data-task="tests"]');
  await page.click('#startSum');
  const before = await readState(page);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  expect(dl.suggestedFilename()).toBe('med-tracker-2026-09-11.json');
  const path = await dl.path();
  const exported = JSON.parse(require('fs').readFileSync(path, 'utf8'));
  expect(exported).toEqual(before);

  // Сброс: двойное нажатие.
  await page.click('#reset');
  await expect(page.locator('#reset')).toHaveText('Нажми ещё раз, чтобы сбросить');
  await page.click('#reset');
  await expect(dose(page, 'm:nosol')).toHaveAttribute('aria-pressed', 'false');
  const afterReset = await readState(page);
  expect(afterReset.checks).toEqual({});
  expect(afterReset.sumStart).toBeNull();
  expect(afterReset.log.at(-1).type).toBe('reset');
  expect(afterReset.log.length).toBe(before.log.length + 1);

  // Импорт с подтверждением.
  await page.locator('#importFile').setInputFiles(path);
  await expect(page.locator('#importOk')).toBeVisible();
  await page.click('#importOk');
  await expect(dose(page, 'm:nosol')).toHaveAttribute('aria-pressed', 'true');
  await expect(dose(page, 'd:lizak')).toHaveAttribute('aria-pressed', 'true');
  expect(await readState(page)).toEqual(before);
});

test('одиночное нажатие на сброс истекает через 3 секунды', async ({ page }) => {
  await open(page, '2026-09-11T13:00:00');
  await dose(page, 'm:nosol').click();
  await page.click('#reset');
  await page.clock.runFor(3100);
  await expect(page.locator('#reset')).toHaveText('Сбросить все отметки');
  await expect(dose(page, 'm:nosol')).toHaveAttribute('aria-pressed', 'true');
});

test('невалидный файл импорта отклоняется с заметкой', async ({ page }) => {
  await open(page, '2026-09-11T13:00:00');
  await page.locator('#importFile').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"checks":{"2026-09-11":{"zz":"nope"}}}') });
  await expect(page.locator('#note')).toContainText('Файл не подошёл');
  await expect(page.locator('#importOk')).toHaveCount(0);
});

test('недоступный localStorage: явное предупреждение в футере', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  });
  await open(page, '2026-09-11T13:00:00');
  await expect(page.locator('#status')).toContainText('Отметки не сохраняются');
  await dose(page, 'm:nosol').click();
  await expect(dose(page, 'm:nosol')).toHaveAttribute('aria-pressed', 'true');
});

test('лог ограничен 500 записями', async ({ page }) => {
  await open(page, '2026-09-11T13:00:00');
  await page.evaluate(k => {
    const s = JSON.parse(localStorage.getItem(k) || '{"version":1,"checks":{},"tasks":{},"sumStart":null,"log":[]}');
    s.log = Array.from({ length: 499 }, (_, i) => ({ at: new Date(2026, 8, 11, 8, 0, i % 60).toISOString(), type: 'check', date: '2026-09-11', key: 'm:nosol' }));
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);
  await page.reload();
  await page.waitForSelector('.dose');
  await dose(page, 'm:nosol').click();
  await dose(page, 'm:nosol').click();
  const st = await readState(page);
  expect(st.log.length).toBe(500);
  expect(st.log.at(-1).type).toBe('uncheck');
});

test('нет ФИО и телефонов в UI', async ({ page }) => {
  await open(page, '2026-09-11T13:00:00');
  await page.click('#refAll summary');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\+?\d[\d\s\-()]{8,}\d/);
});
