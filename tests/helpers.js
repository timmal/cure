// @ts-check
const KEY = 'med-tracker:v1';

/** Открывает страницу с замоканными часами. `time` в локальном (Киев) времени, без зоны. */
async function open(page, time = '2026-09-11T13:00:00', { install = true } = {}) {
  if (install) await page.clock.install({ time: new Date(time + '+03:00') });
  await page.goto('/');
  await page.waitForSelector('.dose');
}

async function readState(page) {
  return page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
}

module.exports = { KEY, open, readState };
