# ADR-003: Redis cache-aside

Статус: принято.

Redis используется только как отключаемый cache-aside слой с namespace и TTL. Критичные записи сначала фиксируются в primary DB.
