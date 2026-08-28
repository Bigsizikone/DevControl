# ADR-008: S3-compatible object storage

Статус: принято.

Файлы хранятся в MinIO/S3, в БД сохраняются metadata и object key. Клиент получает presigned URL через File Service.
