# ADR-007: ClickHouse-ready аналитика

Статус: принято.

MVP использует PostgreSQL analytics_db. Контракт Analytics Service и Star Schema не зависят от конкретного движка, поэтому возможна миграция на ClickHouse.
