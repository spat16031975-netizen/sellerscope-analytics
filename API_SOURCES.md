# Источники API и ограничения

Дата проверки: **17 ноября 2026 года**. Использовались только официальные порталы Wildberries и Ozon. HTML-документация обоих маркетплейсов защищена антиботом; поэтому для воспроизводимости зафиксированы прямые ссылки на документацию и официальные release notes. Любой метод дополнительно проверяется разрешённым read-only запросом перед production-включением.

## Краткая таблица решений

| Область | Подтверждённый источник | Риск | Решение |
|---|---|---|---|
| Ozon FBO/FBS | `/v3/posting/fbo/list`, `/v4/posting/fbs/unfulfilled/list`, `/v4/posting/fbs/list` | предыдущие версии отключены 1 августа 2026 | поддерживать только актуальные версии; версия метода хранится в журнале |
| Ozon финансы | `/v1/finance/accrual/postings`, `/types`, `/by-day` | `/v3/finance/transaction/*` отключены 8 сентября 2026; Ozon предупреждает о возможном расхождении с ЛК | забирать методы последовательно, хранить raw-записи и показывать статус сверки |
| Ozon ключи | `/v1/roles.expires_at`, OAuth | API-ключи теперь действуют 90 дней | для SaaS использовать OAuth; ключи оставить только для контролируемого пилота |
| Ozon реклама | оперативная статистика CPC и асинхронная историческая статистика | разные квоты и глубина; исторические запросы ресурсоёмкие | отдельные расписания, очередь отчётов, учёт лимитов |
| WB остатки | `POST /api/analytics/v1/stocks-report/wb-warehouses` | старый `GET /api/v1/supplier/stocks` отключён 23 июня 2026 | новый отчёт с offset-пагинацией; дневные снимки хранить самостоятельно |
| WB история остатков | `STOCK_HISTORY_DAILY_CSV` | официально доступно только последние 3 месяца | ежедневные собственные снимки после подключения |
| WB финансы | `GET /api/v5/supplier/reportDetailByPeriod` | поздние корректировки и новые поля | перекрывающееся повторное обновление закрытых периодов |
| WB реклама | Promotion API, кампании и статистика | схемы CPC/аукционов меняются, часть метрик недоступна для отдельных типов | хранить тип оплаты и raw; не унифицировать атрибуцию с Ozon |

## Ozon Seller API

Официальная документация: <https://docs.ozon.ru/api/seller/>.

Подтверждено официальными обновлениями:

- актуальные списки отправлений: `/v3/posting/fbo/list`, `/v4/posting/fbs/unfulfilled/list`, `/v4/posting/fbs/list`, `/v2/posting/digital/list`; старые версии отключены 1 августа 2026: <https://dev.ozon.ru/news/734-Otkliuchenie-starykh-metodov-Seller-API-dlia-raboty-s-postingami/>;
- актуальные финансы: `/v1/finance/accrual/postings`, `/v1/finance/accrual/types`, `/v1/finance/accrual/by-day`; старые `/v3/finance/transaction/list` и `/totals` отключены: <https://dev.ozon.ru/news/783-Izmeneniia-v-metodakh-dlia-raboty-s-finansovymi-otchetami-v-Seller-API/>;
- новые API-ключи имеют срок 90 дней, дата доступна через `/v1/roles` в `expires_at`; для коммерческих интеграций рекомендован OAuth: <https://dev.ozon.ru/news/784-Izmeneniia-v-srokakh-deistviia-kliuchei-Seller-API/>;
- OAuth Authorization Code Flow, защита `state`, access token 1 час, refresh token 6 месяцев: <https://dev.ozon.ru/start/450-Protsess-OAuth-avtorizatsii-dlia-dostupa-k-Seller-API-Ozon/>.

До проверки реальным кабинетом не подтверждены: фактические scopes конкретного публичного приложения, доступные регионы, состав начислений конкретного договора и максимальная глубина данных по каждому магазину.

## Ozon Performance API

Официальная документация: <https://docs.ozon.ru/api/performance/>.

- с 6 апреля 2026 Performance API поддерживает OAuth и общий токен с Seller API при соответствующих scopes: <https://dev.ozon.ru/news/691-Performance-API-Optimizatsiia-kontrolia-dostupov-cherez-OAuth/>;
- оперативная статистика по товарам CPC возвращает текущие и предыдущие сутки и не расходует квоту; историческая статистика кампании формируется асинхронно и расходует лимит: <https://dev.ozon.ru/news/795-Performance-API-poluchaite-otchety-ne-raskhoduia-limity/>;
- лимиты на ресурсоёмкие операции действуют с 14 сентября 2026: <https://dev.ozon.ru/news/794-Performance-API-vvedenie-ogranichenii-na-kolichestvo-zaprosov/>.

Решение: текущие двое суток обновлять каждые 3 часа через оперативный метод; историю запрашивать отдельными заданиями, дедуплицировать отчёты и повторять только после готовности.

## Wildberries API

Официальная документация: <https://dev.wildberries.ru/>. Официальные release notes: <https://dev.wildberries.ru/en/release-notes>.

Подтверждено release notes 2026:

- `POST /api/analytics/v1/stocks-report/wb-warehouses`: лимит 1 запрос на 20 секунд, до 250 000 строк, offset-пагинация; старый `GET /api/v1/supplier/stocks` отключён 23 июня 2026;
- CSV-отчёт `STOCK_HISTORY_DAILY_CSV` отдаёт дневной остаток на 23:59 за последние 3 месяца;
- финансовый отчёт реализации использует `GET /api/v5/supplier/reportDetailByPeriod`; в 2026 добавлялись новые поля, поэтому нормализация версионируется;
- Promotion API поддерживает CPC, но для некоторых типов кампаний недоступны показы/CTR/CPM; отсутствующие значения должны быть `null`;
- денежные значения аналитических отчётов возвращаются в валюте страны регистрации продавца.

До live-проверки не подтверждены: разрешённые категории конкретного WB-токена, фактическая глубина статистики продаж, доступ Promotion API для кабинета и региональные тарифные ограничения.

## Политика включения метода

Метод считается production-доступным только после четырёх проверок:

1. существует в текущей официальной документации и не отмечен deprecated;
2. scope/категория токена явно разрешает read-only запрос;
3. контракт ответа сохранён в fixture без секретов и покрыт тестом нормализации;
4. выборка сверена с личным кабинетом продавца на нескольких операциях.

Если любой пункт не выполнен, интерфейс показывает «Источник не подтверждён» или «Данные неполные», а не демонстрационное значение.
