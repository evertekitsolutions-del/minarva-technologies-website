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

## Database restore qualification — October 12, 2026

A successful `configuration_restore` rehearsal on 2026-10-07 previously caused the automated `recovery_drill` release checklist item to turn PASS, because the database refresh accepted **any** passed drill type. That was too permissive. It is **not proof of a database backup restore**.

Migration `20261012_recovery_gate_database_restore_evidence.sql` corrects this gate. A qualifying drill must be of type `database_restore` or `full_recovery`, in an explicitly isolated non-production/staging/UAT/isolated-restore environment, with completed time later than start, a populated recovery point, and an evidence reference. Existing configuration-only evidence is preserved as historic operational evidence, but cannot certify database recovery for release. Until a qualifying drill is recorded, the release gate is Pending with no fabricated evidence. The migration also updates the existing private refresh implementation so subsequent admin refreshes cannot re-enable the false-positive PASS.

**Important:** Even a properly entered drill is a manually supplied record, not cryptographic proof that a backup was restored. An operator must independently review restoration logs, schema, representative rows, storage links (when applicable), timings and the evidence source before sign-off. A backup drill must never target the production database destructively. The Auth leaked-password protection warning and genuine UAT gates remain separate blockers.

## Platform Health database recovery qualification — October 14, 2026

Previously `public.platform_health_readiness()` marked Recovery VERIFIED after any passed drill, including the non-production `configuration_restore` event. That contradicted the fixed `recovery_drill` release gate. Migration `20261014_platform_health_qualified_recovery.sql` aligns its result to the **same database/full restore predicate**: isolated non-production environment, passed status, later completion time, backup recovery point, and evidence reference. Passed configuration-only drills remain visible in `last_configuration_drill_at`, but cannot certify database recovery. `last_successful_drill_at` now means last qualifying recorded database/full restore.

Admin dashboard now displays DB RESTORE PENDING versus DB RESTORE RECORDED, preserving the historical configuration-only drill visibly without falsely certifying a database restore. Recorded evidence is still a claim requiring an independent reviewer to inspect real restoration logs and representative restored data, not an automatic guarantee of successful recovery. Browser form validation mirrors the qualifying predicate for feedback only; release authorization remains in database RPCs. Source-level regression tests verify both public UI and migration controls. Real calling remains OFF. No actual backup restore is asserted.
