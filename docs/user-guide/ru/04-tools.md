# Инструменты

Страница Tools управляет тем, какие built-in tools доступны агенту и где каждый инструмент разрешено выполнять. Это одна из ключевых поверхностей безопасности WebUI.

## Скриншоты

![Dashboard widgets для ресурсов инструментов](../assets/screenshots/ru/dynamic-dashboard-engine.png)
![Task delegation использует capabilities инструментов](../assets/screenshots/ru/task-delegation-ui.png)
![Cache и tool resources](../assets/screenshots/ru/cache-widget.png)

## Основные понятия

| Понятие | Описание |
| --- | --- |
| Module | Группа инструментов: Telegram, TON, web, workspace, exec или plugin tools. |
| Enabled | Может ли агент рассматривать инструмент. |
| Scope | Где инструмент разрешен: always, direct messages, groups или admin only. |
| Cost badge | Примерный показатель latency, cost или operational risk. |
| Stats | Total calls, success count, failures, last use и average duration. |

## Поиск и фильтрация

Поиск работает по names, descriptions и modules. State filter показывает all, enabled или disabled tools. Sort by module удобен для аудита, sort by name - когда известно точное имя.

## Просмотр инструмента

Откройте detail panel, чтобы увидеть description, parameters, usage stats и test panel. Тестируйте инструменты сначала безопасными параметрами. Для Telegram и TON используйте test accounts и малые суммы.

## Включение и отключение

1. Найдите инструмент или раскройте module.
2. Переключите enabled state.
3. Выберите самый строгий usable scope.
4. Проверьте поведение в Security Center, если инструмент чувствительный.

Для high-risk modules:

- Держите `exec` выключенным, пока оператор явно не запросит system command execution.
- Держите wallet-moving TON tools в admin-only или approval-gated режиме.
- Ограничивайте workspace write/delete tools доверенными операторами.

## Bulk operations

Bulk selection полезен для module-level audit. Хорошие примеры:

- Disable all unused tools после проверки last-used dates.
- Перевести все TON send tools в admin-only.
- Export tool configuration перед большим изменением.
- Import known-good tool configuration на другой установке.

## Plugin tools

Plugin tools появляются рядом с built-ins, но приходят из plugin manifests. Перед включением в production проверьте plugin permissions, secrets и source.
