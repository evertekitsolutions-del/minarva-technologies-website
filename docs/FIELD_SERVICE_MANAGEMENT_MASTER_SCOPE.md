# Minarva Technologies — Field Service Management Master Scope

## Product contract

A customer service request is a tracked job, not just a CRM enquiry. Apply to CCTV, computer/laptop, networking/Wi-Fi, biometric/access control, automation, solar/inverters and on-site support. Preserve the existing website + CRM + billing + Technician PWA + Customer Care modules and their relationships. Do not replace the Minarva Biz retail product.

## End-to-end workflow

1. Office registers manual or enquiry-origin job; links/creates customer, site, service category, device brand/model/serial, fault, photo/evidence, warranty/AMC reference, urgency, requested work, branch, estimated labour/parts. Generate immutable job number and timestamp.
2. Confirm customer contact preferences and explicit WhatsApp service-update permission; consent is OFF by default, auditable and withdrawable. Do not treat phone number alone or call consent as WhatsApp opt-in.
3. Assign or reassign an active field engineer, optionally team and SLA; record assignee, appointment slot, work location, customer confirmation, travel ETA and reassignment history. Engineer sees only permitted jobs in existing mobile PWA.
4. Operational stages: Registered -> Assigned -> Scheduled -> On the way/Visit Start -> Arrived -> Work Started -> Paused/Waiting Parts/Follow-up -> Work Completed -> Customer Acknowledged -> Closed. Preserve existing service_jobs status and separate visit timestamps, rather than breaking the deployed status enum.
5. At field site capture diagnosis, action, inventory/spares (quantity, price), before/after photo, GPS/visit time with permission, device details, checklists, customer signature/acknowledgement, warranty/AMC info, revisit reason/date and callback requirements. Support weak connection/offline idempotent technician actions; reconcile conflicts.
6. Job-sheet -> itemized quotation -> approval -> invoice -> payment, preserving tax/audit and linking records. Reopen/escalate nonresolved work and schedule return visits.
7. SLA breach, unassigned backlog, engineer workload, first-time fix, revisit rate, parts use, open/overdue jobs, field productivity and service revenue dashboards.

## Communications lifecycle

- Event keys: service_registered, service_engineer_assigned, service_visit_scheduled, service_visit_rescheduled, technician_eta, visit_started, arrived, work_started, work_completed, job_completed, service_follow_up, service_feedback_request, service_review_request and cancellation/revisit variants.
- Localized editable Malayalam/English WhatsApp templates with per-stage variables for job number, service category, assigned engineer, scheduled time, ETA, status and support contact; link delivery receipts, failure/retry/dedup/opt-out to per-job history. Avoid duplicate sends on mobile retries.
- Default to permission-safe **mock/test-only** delivery. Business-initiated production WhatsApp needs recipient opt-in, a configured real provider and Meta-approved templates. Do not enable costs/providers/real messages without owner authorization. Keep automated telephone calls OFF.
- After completion: optionally request an honest private feedback form via a short-lived opaque token, one-time submission rate limit, 1–5 satisfaction score, comments, reopen/escalate callback; store only necessary feedback metadata. No public customer data/phone visible on feedback link.
- Google review request: owner-provided official Business Profile review URL, a neutral invitation sent to **all eligible completed jobs** regardless of customer feedback rating. No incentives, positive-only solicitation or review gating. No Google link invented or configured without owner-provided official URL. Customer may skip.
- Preview, enable/disable, template approval status, quiet hours, dedupe, suppression and actual delivery state should be controlled centrally by admin.

## Implemented and not implemented (2026-10-15)

**Already in deployed baseline:** manual jobs, customer/site/priority/schedule/engineer, technician PWA stages/ETA, job-sheet materials/photos/acknowledgement, billing conversion, Customer Care mock adapters and technician stage notification hooks.

**This milestone:** explicit per-service WhatsApp update opt-in and source/timestamps; admin checkbox, Malayalam/English registration/assignment/visit/reschedule templates, outbox routing and per-job message status, permission revocation and technician-hook consent guard. No live send or phone call.

**Pending and must not be reported complete:** official WhatsApp live-provider/template approval, fully unified admin + mobile stage event dedupe/delivery receipts, customer self-service feedback token page, actual review URL and unbiased review sends, SLA/AMC/recurring visit enhancements, staged authenticated transactional UAT, backup restore and final release approval.

## Non-negotiable verification

Protect production and existing records. Use database transactions, RLS, administrative access, no anonymous job/data leakage; no credentials in client source. All notification tests must use mock/test recipients and no real external contact, with asserted idempotency, consent withdrawal, outbox suppression and delivery failure behavior. Real UAT only on dedicated isolated staging. Never record fake feedback/reviews or false provider-delivered status.
