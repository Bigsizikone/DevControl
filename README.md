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
