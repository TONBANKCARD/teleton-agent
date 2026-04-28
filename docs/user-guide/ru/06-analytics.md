# Аналитика

Analytics показывает, как используется агент, куда уходит cost и здорово ли работает система. Раздел объединяет token metrics, tool metrics, activity heatmaps, latency, errors, budget status, temporal patterns, anomaly detection и feedback learning.

## Скриншоты

![Temporal context analytics](../assets/screenshots/ru/temporal-context-analytics.png)
![Anomaly monitoring](../assets/screenshots/ru/anomaly-monitoring.png)
![Feedback learning dashboard](../assets/screenshots/ru/feedback-learning-dashboard.png)

## Основные метрики

| Метрика | Для чего использовать |
| --- | --- |
| Token usage | Найти cost spikes и large-context workflows. |
| Tool usage | Найти часто используемые, failing или unused tools. |
| Activity heatmap | Понять, когда активны пользователи и задачи. |
| Performance | Отслеживать latency, p95 latency, success rate и errors. |
| Cost | Оценить monthly usage и per-tool cost. |
| Budget | Сравнить current spend с monthly limits и projections. |

## Time filters

Короткие периоды полезны для incident response, длинные - для планирования. Если change был вчера, начните с 24 hours. Для model selection и cost reviews сравнивайте 7 или 30 days.

## Anomaly detection

Anomaly cards показывают необычное поведение: резкий рост tokens, tool errors, repeated approvals или unexpected schedule changes. Acknowledge anomalies только после понимания причины.

## Temporal context

Temporal context записывает повторяющиеся patterns. Используйте его для настройки schedules и heartbeat behavior. Например, если пользователи активны около 09:00 UTC, запускайте digest tasks до этого окна.

## Feedback learning

Feedback analytics показывает ratings, themes, preferences и recent feedback. Используйте его вместе с Soul Editor experiments при изменении tone или response style.

## Export data

Exports полезны для cost reviews, incident reports и long-term trend analysis. Храните exports безопасно: они могут содержать operational timing, chat-derived metadata и tool names.

## Review checklist

- Token growth соответствует реальной нагрузке.
- Tool failures не сосредоточены в одном module.
- Cost projection остается ниже budget.
- У каждой anomaly есть owner и explanation.
- Feedback themes отражены в prompt или policy changes.
