// @ts-check
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'allow' });

test('офлайн после первого визита: приложение открывается и отметки работают', async ({ context, page }) => {
  await page.goto('/');
  await page.waitForSelector('.dose');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // ждём, пока прекеш заполнится
    for (let i = 0; i < 50; i++) {
      const c = await caches.open('cure-v1');
      const keys = await c.keys();
      if (keys.length >= 17) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('precache incomplete ' + reg.scope);
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.dose');
  await expect(page.locator('h1')).toHaveText('Лечение');
  await page.locator('[data-k="m:dek"]').click();
  await page.reload();
  await page.waitForSelector('.dose');
  await expect(page.locator('[data-k="m:dek"]')).toHaveAttribute('aria-pressed', 'true');
  // шрифт тоже из кеша
  const fontLoaded = await page.evaluate(() => document.fonts.check('500 15px "IBM Plex Sans"'));
  expect(fontLoaded).toBe(true);
  await context.setOffline(false);
});

test('манифест валиден и установка возможна (CDP installability)', async ({ context, page }) => {
  await page.goto('/');
  await page.waitForSelector('.dose');
  const m = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  expect(m.display).toBe('standalone');
  expect(m.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // На localhost без HTTPS Chrome может ругаться только на схему — на деплое её нет.
  const real = installabilityErrors.filter(e => e.errorId !== 'not-from-secure-origin');
  expect(real).toEqual([]);
});
