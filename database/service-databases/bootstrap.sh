#!/bin/sh
set -eu

ADMIN_URL="${POSTGRES_ADMIN_URL:-postgresql://service_desk:service_desk@postgres:5432/postgres}"
BASE_URL="${POSTGRES_BASE_URL:-postgresql://service_desk:service_desk@postgres:5432}"

until pg_isready -d "$ADMIN_URL" >/dev/null 2>&1; do sleep 2; done

for database in identity_db service_desk_db development_db camera_db audit_db notification_db analytics_db file_db; do
  exists="$(psql "$ADMIN_URL" -Atqc "SELECT 1 FROM pg_database WHERE datname = '$database'")"
  if [ "$exists" != "1" ]; then
    psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database"
  fi
done

for item in \
  "identity_db:identity.sql" \
  "service_desk_db:service-desk.sql" \
  "development_db:development.sql" \
  "camera_db:camera.sql" \
  "audit_db:audit.sql" \
  "notification_db:notification.sql" \
  "analytics_db:analytics.sql" \
  "file_db:file.sql"; do
  database="${item%%:*}"
  schema="${item##*:}"
  psql "$BASE_URL/$database" -v ON_ERROR_STOP=1 -f "/schema/$schema"
done

create_role() {
  role="$1"; database="$2"; password="$3"
  exists="$(psql "$ADMIN_URL" -Atqc "SELECT 1 FROM pg_roles WHERE rolname = '$role'")"
  if [ "$exists" != "1" ]; then
    psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE ROLE $role LOGIN PASSWORD '$password'"
  fi
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE $database TO $role"
  psql "$BASE_URL/$database" -v ON_ERROR_STOP=1 -c "GRANT USAGE ON SCHEMA public TO $role; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO $role; GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO $role"
}

create_role "${IDENTITY_DB_USER:-identity_app}" identity_db "${IDENTITY_DB_PASSWORD:-identity_dev}"
create_role "${SERVICE_DESK_DB_USER:-servicedesk_app}" service_desk_db "${SERVICE_DESK_DB_PASSWORD:-servicedesk_dev}"
create_role "${DEVELOPMENT_DB_USER:-development_app}" development_db "${DEVELOPMENT_DB_PASSWORD:-development_dev}"
create_role "${CAMERA_DB_USER:-camera_app}" camera_db "${CAMERA_DB_PASSWORD:-camera_dev}"
create_role "${AUDIT_DB_USER:-audit_app}" audit_db "${AUDIT_DB_PASSWORD:-audit_dev}"
create_role "${NOTIFICATION_DB_USER:-notification_app}" notification_db "${NOTIFICATION_DB_PASSWORD:-notification_dev}"
create_role "${ANALYTICS_DB_USER:-analytics_app}" analytics_db "${ANALYTICS_DB_PASSWORD:-analytics_dev}"
create_role "${FILE_DB_USER:-file_app}" file_db "${FILE_DB_PASSWORD:-file_dev}"

echo "service databases are ready"
