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
