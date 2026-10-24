# STORE-008 — real Medusa runtime smoke test

The upstream Medusa source **compiled** in STORE-005, but compilation is not evidence a merchant's checkout or Admin dashboard actually boots. This milestone adds GitHub Actions execution of the existing Medusa CLI and server without writing a commerce engine.

## Reused code

- Medusa `db:migrate` and `medusa develop` official CLI
- PostgreSQL 16 / Redis 7 disposable GitHub Actions service containers
- Medusa's existing HTTP `/health` API
- Exact pnpm lockfile; no new paid infrastructure or API credentials

## What proves success

The CI workflow must:
1. Install pinned OSS dependencies without executing vendor install scripts.
2. Migrate **disposable** Postgres database `minarva_store_ci`.
3. Run the actual Medusa backend with both external Shiprocket and automation plugins OFF.
4. Verify `http://127.0.0.1:9000/health` responds with HTTP 2xx.
5. Fail if the backend crashes or fails to respond within timeout.

No Supabase CRM migrations, production databases, public DNS, customer messages, payment capture or Shiprocket orders. This does not test a complete cart checkout nor Cashfree/Shiprocket compatibility in active mode.

## Next acceptance

Admin-authentication smoke, publishable API key, India INR region, approved product catalog and test-only checkout. Then payment-provider registration and signed Cashfree verification with unique persisted idempotency keys. No public sale until end-to-end tested.
