# Реализация Editing Toolbar — 2026-10-29

Выполнены команды стандартного инвентаря, общий реестр, верхняя/мобильная/плавающая/фиксированная панели, всплывающие группы, параметры вставки, обработка текста, кисть/ластик, настройка/import/export. Реестр также используется контекстным меню и Command Palette.

Архитектурные решения выполнения:
- Реестр и контекст объединены в registry.ts; overlay coordinator общий для отдельных React roots CodeMirror, находится в ToolbarSurface.tsx.
- Config layouts хранят enabled/items/position вместе; appearance общая. Формы редактирования доступны в Settings → Editing Toolbar.
- Fixtures содержат pinned inventory64; семантические проверки групп находятся в registry/brush/color/textTools/rendering/browser tests, а не отдельном файле на каждый command ID.
- Обработка больших выборок выполняется Worker; preview для больших выборок отключён до Apply. Clipboard на HTTP имеет штатный fallback.
- Неподдерживаемые внешние plugin commands сохраняются disabled с отчётом. Не исполняются JS/SVG/CSS из импортированной конфигурации.
- Произвольные сторонние AI/PKMer/plugin интеграции остаются за границами этой реализации по spec.

Проверки перед выпуском: npm test — 188 server + 359 web PASS, 7 Windows symlink skips; npm run typecheck PASS. Реальный скрытый Chromium проверяет меню и палитры на desktop/390px; отдельные browser tests проверяют Settings и импорт. Регрессии независимого обзора: сохранение selection при смене блока, повторное u, partial sub/sup, перекрывающиеся carets, whitespace в span, readonly Copy, контекст формы и кисти, защита code alignment.

Параллельная доработка рендеринга закончена локально: tables в списках/цитатах, пустые колонки/escaped pipe, составные heading fragments и transclusion depth, измеренная типографика. Входит в совместный выпуск; подробности docs/rendering-compatibility.md.

Firefox/Safari и полная визуальная матрица тем/конструкций не проверялись. Linux-only symlink smoke требует отдельной Linux-среды; Windows skips сохранены явно. Исходный текст реальных заметок в тестах не использовался.

Build/desktop typecheck/build и disposable HTTP smoke PASS.
