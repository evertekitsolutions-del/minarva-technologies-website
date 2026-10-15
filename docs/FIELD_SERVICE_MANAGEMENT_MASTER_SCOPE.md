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


## Field Operations Control Tower milestone — 2026-10-15

Admin-only `/service-operations` complements existing `/service-jobs`, Technician PWA, Feedback and Customer Care. It reads real authenticated records using bounded Supabase pagination, computes engineer workloads, unassigned jobs, overdue scheduled visits (only before Visit Start), overdue follow-ups, dated return visits, callbacks due, waiting parts/on hold, urgent jobs and completed jobs without feedback. Action buttons link straight to the existing Service Job and Job Sheet. A pure Node regression suite checks state transitions, cancellation, future due dates, callback date handling and respect for all customer feedback ratings. The dashboard NEVER fabricates records, sends messages, mutates data or equates internal overdue reminders with contractual SLA breaches. Truncated paginated snapshots are visibly flagged as partial.

**Still pending:** explicit customer-approved per-service SLA durations, contractual breach/escalation semantics, inventory/AMC recurring contracts, technician location permission and work scheduling, end-to-end live WhatsApp provider review/approval, WhatsApp template governance, authenticated isolated transactional UAT, real restore drill, and final release owner approval. Do not falsely mark these done.


## Contractual SLA Targeting & Internal Escalation (2026-10-15)

Configured in `/service-sla-policies`. Four priority policies (low, normal, high, urgent) have **enabled=false and both targets null by default**. An active administrator must enter customer-agreed elapsed-clock minutes (at least one response/resolve target) and explicitly confirm enabling. A database BEFORE INSERT trigger snapshots configured target deadlines onto **new** Service Jobs, preserving commitments on existing ones if policies are later edited. The Service Jobs form displays the frozen arrival/resolution deadlines; explicit administrator changes require confirmation and are tracked by the existing audit logging. Never overwrite a past deadline simply because the job priority or policy changes.

Field Operations Dashboard now highlights `Response SLA breached`, `Resolution SLA breached`, and `SLA deadline within 60 min` for jobs with explicit saved deadlines. Response measures **engineer arrival** (`arrived_at`), not travel start or assignment. Resolution measures confirmed completion (`completed_at`); completed jobs without those actual timestamps are not falsely labeled proven late. Cancelled jobs do not generate breaches. On-hold periods still count in elapsed clock time: there is **no promised business-hours calendar, holiday exclusion or SLA clock pause** yet.

**Internal dashboard escalation only:** SLA alerts are computed when the authenticated administrator views/refreshes the dashboard, not pushed in the background to engineers/customers. No scheduled jobs, customer messages, paid providers, fabricated contract SLA or telephone calls. Proper multi-channel alert delivery, escalation acknowledgement and business-hours/holiday calendars remain future work. The release still needs isolated authenticated transactional UAT and recovery evidence.


## Automatic SLA Internal Alert Inbox (2026-10-15)

Existing `pg_cron` refreshes `private.refresh_service_sla_alerts()` every 15 minutes under the database scheduler, inserting or updating persistent `public.service_sla_alerts` records. Each alert has a unique `(service_job_id, alert_kind, target_due_at)` identity so retries do not create duplicate events. Four kinds: arrival response breach, completion resolution breach, and each deadline due within the next 60 minutes. Only **explicit saved SLA deadlines** are considered, not assumed durations or generic priority levels. For past completed jobs, a response breach requires a recorded late `arrived_at`; a resolution breach requires a recorded late `completed_at`. Missing arrival/completion timestamps on completed records are not automatically treated as proved late. Cancelled jobs have no live conditions. Stale alerts resolve automatically without deleting history; acknowledged alerts remain acknowledged until conditions clear.

A new authenticated active-admin-only `/service-sla-alerts` dashboard displays open/acknowledged/resolved alerts and links to the service job/job sheet. Admin can explicitly confirm acknowledgement; the audit fields record identity and timestamp. Direct anonymous access and table writes are forbidden by grants and RLS. The dashboard reads up to 250 recent matching alert records and displays partial record counts when capped. The pre-existing Field Operations metrics dashboard remains read-only.

The scheduler runs inside the existing Supabase PostgreSQL instance. **No external calls**: no WhatsApp, SMS, email, phone, external pushes or new paid infrastructure are activated. This is an internal inbox, not guaranteed instantaneous notification: up to 15-minute polling delay, and no unattended mobile push. Business-hours holidays, pause contracts, service AMC/warranty, escalation recipient routing and approved WhatsApp templates remain unfinished.
