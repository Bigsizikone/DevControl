# ADR-002: Database per service

Статус: принято.

Каждый сервис владеет собственной логической БД и migrations. Между сервисами нет физических FK и cross-database JOIN.
