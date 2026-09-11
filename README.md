# Лечение — трекер приёма лекарств

Мобильный мини-сайт без сборки: `index.html`, `app.css`, `data.js` (назначения и расписание), `store.js` (localStorage, экспорт/импорт), `app.js` (рендер), `sw.js` + `manifest.webmanifest` (PWA, офлайн).

Состояние хранится в `localStorage` под ключом `med-tracker:v1`.

```sh
npm install            # только Playwright для тестов
npm run serve          # http://localhost:4173/
npm test               # приёмочные тесты (мобильный вьюпорт, замоканные часы)
```

Деплой: GitHub Pages из ветки `main` (корень репозитория). Все пути относительные, поэтому подпапка `/cure/` работает.
