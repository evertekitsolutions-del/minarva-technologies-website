# Isolated UAT Strategy

## Goal
Run destructive/transactional UAT without polluting production business records and without enabling real automated calling.

## Environments
1. **Production** — real business data. Read-only smoke and explicitly approved real-user workflows only. Never create synthetic customers, quotations, invoices, payments, jobs or calls.
2. **UAT/Staging** — isolated Supabase project/branch plus a non-production deployment. Synthetic records must carry a run identifier and can be deleted after the run.
3. **Local** — developer/harness verification using the same migrations and test contracts.

## Required UAT configuration
- Separate Supabase URL and publishable key.
- Dedicated UAT admin account.
- Dedicated UAT technician account when technician flows are exercised.
- Real telephony disabled.
- Telephony emergency stop enabled.
- Provider adapters sandbox-only.
- No production customer contact details.
- UAT records prefixed/tagged with a unique run ID.

## Full transactional flow
The E2E harness must verify, in order:
1. admin authentication
2. enquiry creation/conversion
3. customer visibility
4. quotation creation
5. quotation-to-invoice conversion
6. invoice payment and balance
7. service-job creation and job-sheet lifecycle
8. technician assigned-job visibility/execution
9. Customer Care sandbox orchestration
10. AI Voice sandbox intent/callback/escalation
11. Calling Readiness dry-run with calling still OFF
12. desktop/mobile responsive regression
13. cleanup of synthetic UAT records

## Evidence
Every completed gate records the UAT run ID, environment, exact Git SHA, timestamp and automated/manual evidence reference. A failed cleanup fails the run.

## Production rule
The automated full transactional suite must refuse to create synthetic data when BASE_URL is the production URL or when UAT_ALLOW_SYNTHETIC_DATA is not exactly true.

## Enforced preflight (October 2026)

`tools/uat-isolation.mjs` must run before a browser or secret-bearing UAT step.
It checks every protected test route for a single, explicitly configured **non-production
Supabase origin**, verifies locally referenced JavaScript modules, and requires the
Content-Security-Policy `connect-src` to allow the staging backend and reject
the production backend. A browser network guard blocks any attempted request to
the production Supabase host.

**Important current limitation:** the current production frontend HTML and
`vercel.json` contain the production Supabase URL. Merely deploying this repo to
a different Vercel preview URL does **not** isolate its database and therefore
fails the preflight correctly. A staging-specific frontend configuration and
independent staging Supabase project must exist before credentials are used.

The workflow `Isolated UAT Preflight` reads the dedicated environment variable
`UAT_SUPABASE_URL` from the GitHub `uat` environment and separate
`UAT_ADMIN_EMAIL` / `UAT_ADMIN_PASSWORD` environment secrets. Do not paste
credentials into issues or chats. Explicitly verify project costs before creating
a Supabase staging branch/project.

The historical filename `tools/transactional-uat.mjs` is retained for
compatibility, but the implemented behavior is **read-only login and protected
route preflight**, not transactional customer/invoice/payment/job UAT. This
workflow does not create or clean up synthetic records, does not mark release
gates PASS, and never initiates outbound messages or telephone calls.

Full transactional E2E and evidence updates remain pending genuine isolated
data fixtures, negative permission tests, cleanup validation and manual
release authorization.
