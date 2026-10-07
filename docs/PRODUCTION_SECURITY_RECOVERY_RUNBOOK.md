# Minarva Technologies — Production Security & Recovery Runbook

Updated: 2026-10-07

## Current production posture

This runbook applies to the Minarva Technologies website / CRM / billing / service / technician / customer-care platform.

Real automated phone dialing remains disabled. The telephony emergency stop remains ON.

## Public enquiry security

The website enquiry form must use the `public-enquiry-submit` Supabase Edge Function.

Current controls:
- direct anonymous `INSERT` on `public.enquiries` is revoked
- old `website_create_enquiry` anonymous RLS policy is removed
- allowed website origins are checked at the Edge Function
- server-side name / phone / email / service / message validation
- honeypot field
- minimum form-age check
- request-size limit
- privacy-preserving hashed client fingerprint
- privacy-preserving hashed phone fingerprint
- 5 attempts / 15 minutes per client fingerprint
- 3 attempts / 30 minutes per phone fingerprint
- attempt hashes retained for only 24 hours and pruned by cron
- WhatsApp remains the fallback when CRM submission is unavailable

## Browser security headers

Vercel production headers include:
- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- X-Frame-Options: DENY
- Referrer-Policy
- Permissions-Policy
- Cross-Origin-Opener-Policy

The current CSP intentionally permits inline scripts/styles because the existing application is static HTML with inline modules. Replacing inline scripts with hashed/external modules is a future tightening step.

## Audit log

`public.platform_audit_log` is append-only from the browser perspective.

Authenticated active admins can read it. Normal browser roles cannot insert/update/delete it.

The database trigger records:
- timestamp
- actor user / JWT role where available
- operation
- entity/table
- entity ID
- changed field names
- status transition
- business reference number where available

It deliberately avoids storing a full copy of customer PII in each audit event.

## Recovery verification

A database/storage backup is **not considered verified merely because a backup feature exists**.

Use `/platform-health` → Recovery Drill to record an actual drill only after it is performed.

Minimum database restore drill:
1. Identify the exact backup/recovery point in Supabase.
2. Use a non-production recovery target or an approved isolated restore procedure.
3. Restore.
4. Verify schema/migrations.
5. Verify representative records for Customers, Enquiries, Quotations, Invoices, Payments, Service Jobs and Customer Care.
6. Verify Storage references where the drill includes Storage.
7. Record start/end time.
8. Record evidence reference.
9. Mark Passed only when validation succeeds.
10. Never perform a destructive production restore merely to satisfy this checklist.

No successful recovery drill should be fabricated.

## Auth security blocker

Supabase Security Advisor currently reports **Leaked Password Protection Disabled**.

This is an Auth project setting, not a database migration. It must be enabled/verified in Supabase Auth settings using an account/control surface that exposes that setting. Until verified, keep it as an explicit production-hardening blocker.

## Automated calling safety

Before any real call:
- call consent must be true
- Do Not Call must be false
- call-channel opt-out must be false
- phone must pass readiness screening
- duplicate callable numbers require review
- quiet hours must be respected
- primary STT/TTS must be selected from real bilingual benchmarks
- telephony provider/cost profile must be reviewed
- provider webhook authentication/idempotency must pass UAT
- emergency stop must be tested
- explicit owner go-live approval is required

## Release freeze criteria

Do not declare production freeze complete until:
- Security Advisor blockers are reviewed
- a real recovery drill has passed
- end-to-end UAT has passed
- latest Vercel production deployment is READY
- no direct anonymous enquiry insert is possible
- Customer Care dead letters/failures are reviewed
- real automated calling remains OFF unless separately approved
