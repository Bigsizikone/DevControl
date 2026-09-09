# Authkit / Orderful release

The existing React/NestJS application now uses an Authkit-inspired sign-in screen and an Orderful-inspired light workspace. These are visual references; the application does not depend on the WorkOS/AuthKit hosted service.

## Authentication

All business endpoints require a database-backed session. Client-supplied `x-role` and `x-user-id` headers are discarded and replaced with the authenticated user's current database role and ID. Anonymous calls receive 401. Passwords use salted scrypt hashes; session tokens are random 256-bit values stored only as SHA-256 hashes in PostgreSQL. Cookies are HttpOnly, SameSite=Strict, Secure in production and scoped to `/ServiceDesk`. Sessions expire after eight hours; logout revokes them. Password changes revoke all sessions. Login attempts are rate-limited by account and connection address. Mutations validate Origin against PUBLIC_ORIGIN.

`auth_credentials`, `auth_sessions` and `auth_attempts` are created at startup and are excluded from the editable NSI table allowlist. The existing roles and permission engines remain in place. The initial account has the administrator role; there is no public registration or social-provider placeholder.

To provision an account, start the service once against a migrated database, set DATABASE_URL, ADMIN_LOGIN, ADMIN_NAME and ADMIN_PASSWORD (at least 16 characters), then run `node scripts/create-admin.cjs`. The command refuses to overwrite existing accounts. Keep all credentials outside Git. Users can change their own password through the profile menu.

## Deployment

`compose.standalone.yml` and `Dockerfile.standalone` deploy the existing monolith plus PostgreSQL, without publishing database or application ports. Caddy reaches `servicedesk-app:3000` through the existing `one-c-news_one-c-news` network. Build backend and frontend locally before packaging `dist` and `frontend/dist` for this image. The deployment directory is `/opt/servicedesk`.

Set a random hex DB_PASSWORD in `/opt/servicedesk/.env` with mode 600. Import the existing database into the new empty database only once; exclude session and rate-limit data from the export. Copy existing attachments to the persistent `/app/storage` volume and update their stored file paths for Linux. Never import over a populated database without a separate backup and an explicit migration plan.

Add these routes inside the existing devcontrol.tech Caddy site, before the fallback handler for the portfolio:

```caddyfile
redir /ServiceDesk /ServiceDesk/ 308
handle /ServiceDesk/* {
    reverse_proxy servicedesk-app:3000
}
handle {
    reverse_proxy devcontrol-site:80
}
```

Save a dated backup of Caddyfile and validate the new file before reloading. HTTP continues to redirect to HTTPS. PUBLIC_ORIGIN must match the canonical HTTPS origin; alternate hosts should redirect to it. The first startup needs PostgreSQL to be available and initialized with the existing Service Desk schema.

## Validation and boundaries

Both builds and 18 tests pass. Browser checks cover invalid and valid login, admin identity, database health, eight workspace sections, mobile menu, no page overflow, logout, revoked cookies, forged administrator headers and cross-origin rejection. Screenshots were checked at 1536×1024 and 390×844. The in-app browser initially rendered the page, then failed with a lost-tab error; the repeatable verification used bundled Playwright with installed Edge.

Visual comparison covered layout, copy, palette, typography, icons, radii and responsive behavior. Deliberate differences from the generated concepts follow the supplied text references: restrained glass lighting, pill-shaped auth CTA, monochrome status badges, available sans-serif fonts and actual database values. Sidebar wrapping and a stale NSI default query were fixed. The overview chart uses actual creation dates. Legacy reports remain demonstration forms and are explicitly labeled as such.

Strix scan was not run: no model provider was configured and the local Docker daemon was unavailable. Application tests and browser/API checks are not a substitute for a full penetration test.

The `/assets` business API prefix is authenticated; only Vite static bundle filenames are public. A regression test covers the route collision, trusted role propagation and anonymous API rejection.
