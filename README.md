# Service Desk — первый вертикальный срез

Реализованы:

- RBAC с несколькими ролями;
- проверка permission и области доступа;
- специальные правила инициатора, наблюдателя, исполнителя, диспетчера и руководителя;
- конфигурируемые routing rules с приоритетом;
- подбор группы поддержки;
- фильтр обязательных компетенций;
- стратегии `min_active_load`, `territory`, `organization_affinity`, `equipment_affinity` и комбинирование стратегий;
- REST endpoints для проверки доступа и симуляции маршрутизации;
- unit-тесты для основных сценариев.

## Запуск

Требуется Node.js 20+.

```bash
npm install
npm test
npm run build
npm start
```

Сервер запускается на `http://localhost:3000` при локальном запуске Node.js; в удаленном Docker-развертывании внешний порт — `3001`.

### Единый локальный хост

После сборки frontend раздается тем же Node.js-сервером, что и API. Все запросы интерфейса к `/api/*` обслуживаются на том же origin, поэтому для локальной проверки достаточно:

```bash
pnpm run build
pnpm --dir frontend run build
pnpm start
```

Откройте `http://localhost:3000/`. Проверка API: `http://localhost:3000/api/health`.

Для запуска контейнера:

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

Проверка состояния: `GET /health`.

Health endpoint дополнительно проверяет соединение с PostgreSQL и возвращает `database: up`.

Веб-интерфейс доступен на `http://localhost:3002` при Docker-развертывании. Он проксирует `/api/*` во внутренний API-контейнер.

### Проверка доступа

`POST /access/check`

```json
{
  "user": { "id": "u-1", "roleCodes": ["initiator"] },
  "permission": "ticket.read",
  "ticket": { "id": "t-1", "createdBy": "u-1" }
}
```

### Симуляция маршрута

`POST /routing/simulate` принимает `ticket`, `rules`, `groups`, `candidates` и необязательный `requiredCompetencyIds`. Возвращает совпавшие правила, группу, исполнителя, SLA и причины результата.

## Следующий срез

Подключить PostgreSQL и миграции, заменить in-memory конфигурацию репозиториями, добавить JWT/SSO, полноценные DTO и интеграционные тесты HTTP-контуров. После этого реализовать workflow заявок, аудит, SLA и эскалации.

## Модуль «Видеокамеры»

Модуль доступен ролям `Оператор`, `Старший оператор` и `Администратор`. Проверка выполняется в меню и на каждом backend-маршруте по заголовкам текущего протокола `x-role` и `x-user-id`; пользователь без роли получает `403`.

### Маршруты

- `GET /cameras/meta` — операторы, организации, подразделения и роли для форм.
- `GET /cameras/schedule` и `GET /cameras/schedule/:id` — график с фильтрами периода, сотрудника и статуса.
- `POST /cameras/schedule`, `PUT /cameras/schedule/:id`, `DELETE /cameras/schedule/:id` — управление сменами для старшего оператора и администратора.
- `POST /cameras/schedule/generate` — генерация по шаблону: каждый день, дни недели, 2/2, 1/3, цикл или набор дат.
- `POST /cameras/schedule/recommend` — rule-based рекомендация без автоматического применения.
- `GET /cameras/violations` — журнал с поиском, фильтрами и пагинацией.
- `POST /cameras/violations`, `GET/PUT/DELETE /cameras/violations/:id` — документ нарушения.
- `POST /cameras/violations/:id/attachments` — загрузка base64-файла с проверкой MIME, расширения и лимита.
- `DELETE /cameras/violations/:id/attachments/:attachmentId` и `GET .../download` — удаление и защищённое скачивание.

### Сущности и миграции

- `008_camera_module.sql` создаёт `camera_work_shifts`, `camera_schedule_templates`, `camera_violations`, `camera_violation_attachments`, `camera_schedule_recommendations`, индексы, роли и permissions.
- `009_camera_seed.sql` добавляет старшего оператора, пять операторов, дневные/ночные смены на две недели и десять нарушений.
- Файлы хранятся отдельно от документа в каталоге `CAMERA_UPLOAD_DIR`; лимит задаётся `MAX_VIOLATION_FILE_SIZE_MB`.
- Все изменения смен, нарушений и вложений попадают в существующий `audit_log`. `CameraEventBus` публикует `CameraShiftCreated`, `CameraShiftUpdated`, `CameraShiftCancelled`, `CameraViolationCreated`, `CameraViolationUpdated`, `CameraViolationDeleted` и события вложений без привязки к каналу доставки.

### Алгоритмы

Конфликты смен проверяются сервером как пересечение временных интервалов; если окончание меньше начала, к окончанию добавляются сутки, поэтому `20:00–08:00` считается 12-часовой ночной сменой. Рекомендации исключают пересечения и рассчитывают оценку по числу смен и рабочих часов сотрудника за последние 30 дней; результат должен быть подтверждён пользователем.

Для локального запуска примените миграции в порядке `001`, `003`, `004`, `005`, `007`, `008`, затем seed `002`, `006`, `009`. В Docker-файле эти файлы подключены автоматически.

## Микросервисный контур

Архитектурный рефакторинг добавлен поэтапно и обратно совместимо:

- `apps/api-gateway` — единая точка входа с `/api/v1/*`, request/correlation ID, rate limit и legacy-проксированием `/api/*`;
- `services/identity-service`, `service-desk-service`, `development-service`, `camera-service`, `analytics-service`, `audit-service`, `notification-service`, `file-service` — независимые приложения с собственными health endpoints;
- `services/outbox-relay` — публикация transactional outbox в RabbitMQ;
- `database/service-databases` — отдельные схемы `identity_db`, `service_desk_db`, `development_db`, `camera_db`, `audit_db`, `notification_db`, `analytics_db`, `file_db`;
- Redis — отключаемый cache-aside с namespace и TTL;
- RabbitMQ — durable topic exchange для доменных событий;
- Analytics DB — Star Schema, SCD Type 2 dimensions и управление cube runs;
- MinIO — S3-compatible object storage для File Service.

Для запуска целевого dev-контура:

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

Gateway доступен на `http://localhost:3000`, legacy API — на `http://localhost:3001`, frontend через nginx — на `http://localhost:3002`, Grafana — на `http://localhost:3003`, Prometheus — на `http://localhost:9090`. ClickHouse запускается профилем `olap`:

```bash
docker compose -f docker-compose.deploy.yml --profile olap up -d clickhouse
```

Подробная схема, владельцы данных, события, OLAP, миграция и риски описаны в [docs/architecture/microservices.md](docs/architecture/microservices.md). Контракты находятся в `packages/contracts`.

### Раздел «Интеграции» и API

Раздел «Интеграции» доступен только администратору. Backend предоставляет:

- `GET /api/assets/integrations` — список подключений;
- `POST /api/assets/integrations` — регистрация подключения и описания его метода;
- `GET /api/assets/api-description` — каноническое описание API Service Desk: объекты, атрибуты с типами и ограничениями, методы GET/POST/PATCH, примеры запросов и ответов, заголовки и коды ошибок.

Для локального запуска базовый адрес — `http://KPDGS-help.ru/api`. Для промышленного контура адрес строится через DNS API Gateway и HTTPS. Доступ проверяется заголовком `x-role: admin`; интеграционный ключ передается как `Authorization: Bearer <api-key>`. Секрет генерируется на сервере при создании подключения, показывается один раз и не включается в URL, тело запроса или логи.

В интерфейсе описание доступно на вкладке «Интеграции» → «API» и загружается непосредственно из endpoint backend-сервиса.

## Приемная документация

Комплект ЧТЗ, ПМИ, ПСИ и целевого описания бизнес-процессов находится в каталоге [docs/acceptance](docs/acceptance/00_Комплект_приемной_документации.md).
