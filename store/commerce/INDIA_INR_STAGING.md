# STORE-025 — India / INR Medusa region in isolated staging

Problem: the upstream Medusa DTC demo initializes a EUR region, so a Kerala-focused website cannot correctly resolve `/in` and INR prices without a real India region.

This milestone **reuses official Medusa v2.22 native workflows**, no manual SQL, no WooCommerce, no fabricated CCTV products.

## Implementation

- `apps/backend/src/scripts/init-india-region.ts` — native Medusa `medusa exec` custom script. Reads authoritative store/region module data, adds INR among supported store currencies if missing, makes INR the staging default, and creates exactly one India country region via `createRegionsWorkflow`. If an India region already exists, checks currency INR without creating a duplicate; rejects other currency and multiple competing India regions. A temporary built-in system payment provider is listed but public carts are still locked by the Medusa backend.
- Staging-only opt-ins: `STORE_INR_REGION_STAGING_ENABLED=true`, `STORE_INR_REGION_STAGING_APPROVED=true`, `STORE_INR_REGION_STAGING_DB_NAME=<exact database name>`. The database name MUST end in `_ci` or `_staging` and match the `DATABASE_URL` pathname. `NODE_ENV=production` always fails.
- GitHub runtime smoke uses existing **disposable PostgreSQL 16 / Redis 7**, runs `medusa exec` twice to verify idempotency, starts Medusa, then verifies India INR through the public `GET /store/regions` API while the **customer cart-write lock remains active**.
- No prices, tax invoices, GST rates, stock, courier options or fake transactions are seeded. No production DB, existing CRM Supabase or real merchant systems are touched. The script never runs automatically on deployment.

This configures the **staging region only**, not the production store or customer checkout. Official Medusa region/store management can later be used with merchant approval. The user must approve actual payment providers, tax policy and shipping for Kerala separately. All real product variants need explicit verified INR prices in the Medusa Pricing Module.

Run only in a disposable reviewed Medusa staging environment:

```bash
pnpm --dir store/commerce --filter @dtc/backend exec medusa exec ./src/scripts/init-india-region.ts
```

Do not set staging flags in a production runtime. Do not interpret CI region setup as shipping availability, GST compliance or merchant payment approval.
