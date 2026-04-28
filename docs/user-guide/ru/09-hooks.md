# Хуки

Hooks меняют или блокируют поведение до ответа агента. Они полезны для keyword blocklists, injected context, policy reminders и легкой автоматизации вокруг incoming messages.

## Скриншоты

![Events page для проверки hook-related events](../assets/screenshots/ru/events-page.png)
![Integrations page для external hook destinations](../assets/screenshots/ru/integrations-page.png)
![Audit trail для изменений hooks](../assets/screenshots/ru/audit-trail-security-page.png)

## Keyword blocklist

Blocklist отклоняет сообщения с заданными keywords и возвращает configured response. Используйте его для hard stops: seed phrases, private keys или запрещенные support topics.

## Context triggers

Context triggers добавляют instructions при появлении keyword. Например, trigger для `airdrop` может добавить напоминание предупредить о scam risk перед ответом.

## Visual rule builder

Structured rules объединяют condition blocks и action blocks. Используйте builder, когда одного keyword недостаточно или нужны несколько rules в priority order.

## Тестирование hooks

Используйте test panel перед сохранением нового hook set:

1. Введите representative user message.
2. Запустите test.
3. Проверьте, блокируется ли message.
4. Посмотрите triggered hooks и injected context.
5. Настройте keywords, чтобы избежать false positives.

## Правила проектирования hooks

- Делайте blocklist terms конкретными.
- Используйте injected context для advice и hard block для secrets или abuse.
- Тестируйте positive и negative examples.
- Сохраняйте rule order простым.
- Проверяйте audit logs после changes in production hooks.

## Integrations

Hooks - локальные behavior controls. Для outbound automation используйте Events, Webhooks, Workflows или Integrations вместо side effects в prompt text.
