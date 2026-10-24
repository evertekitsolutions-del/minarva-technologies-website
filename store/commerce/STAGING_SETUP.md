# Medusa-based Minarva CCTV Store — no WooCommerce

This is a **development/staging** environment, not a public checkout deployment. Original upstream MIT source remains under `store/commerce/`. The main Minarva Technologies static website and Supabase CRM are not modified.

## Prerequisites

- Docker Compose
- Node.js >= 22.23.4
- Corepack with pinned pnpm 10.11.1 (from `package.json`)
- Localhost ports 55432, 56379, 9000, 8000

## Start existing open-source services

```sh
cd store/commerce
cp .env.example .env
# Set a unique random 32+ character password in .env and match the password below.
docker compose --env-file .env -f compose.dev.yml up -d --wait

corepack enable
corepack pnpm install --frozen-lockfile
cp apps/backend/.env.template apps/backend/.env
cp apps/storefront/.env.template apps/storefront/.env.local
```

Edit `apps/backend/.env`:
- `DATABASE_URL=postgresql://minarva_store:<URL-ENCODED-LOCAL-PASSWORD>@127.0.0.1:55432/minarva_cctv_store`
- `REDIS_URL=redis://127.0.0.1:56379`
- `STORE_CORS=http://localhost:8000`
- `ADMIN_CORS=http://localhost:9000`
- `AUTH_CORS=http://localhost:8000,http://localhost:9000`
- Generate **two distinct** strong `JWT_SECRET` and `COOKIE_SECRET` with a secure random generator.

Then:
```sh
cd apps/backend
corepack pnpm medusa db:migrate
# Do not execute upstream demo seed scripts or open public payments.
corepack pnpm dev
```
In a second terminal, open `store/commerce/apps/storefront/.env.local`:
- `NEXT_PUBLIC_DEFAULT_REGION=in`
- `NEXT_PUBLIC_BASE_URL=http://localhost:8000`
- `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000`
- Add Medusa **publishable** API key obtained after creating a real `INR` region and India sales channel through the authenticated Medusa admin; do not use a secret key.

```sh
cd store/commerce/apps/storefront
corepack pnpm dev
```

The existing Medusa UI is available locally at `http://localhost:8000` only when backend, region, publishable key and storefront setup are completed. `http://localhost:9000/app` is the admin after creation of an actual admin user. Shipping and payments are not ready for customer use.

## Production blockers

Persistent hosted Medusa Node runtime + PostgreSQL (and production Redis), administrator/customer security, merchant provider approvals, real catalog/BOM weights, India tax, tested Shiprocket provider, verified payment webhooks, source-tested Partial COD, returns, data/privacy disclosures, and domain DNS. Hosting and paid services require separate approval. Do not point `store.minarvatechnologies.com` to local development.

## Stop

```sh
docker compose --env-file .env -f compose.dev.yml down
```

No `-v`: that would delete the local Medusa database and Redis data.
