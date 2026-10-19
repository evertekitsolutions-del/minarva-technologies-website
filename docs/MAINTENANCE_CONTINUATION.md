# AMC/Warranty continuation

Work extends existing Minarva Technologies Service Jobs and Technician PWA; do not restart prior modules. The AMC/Warranty register defaults inactive. Existing pg_cron prepares recurring planned visits over a 45-day horizon only when a contract is activated. All customer jobs require explicit admin approval, with unique visit-to-job mapping. No outbound calls or paid integrations. Remaining: staged authenticated UAT, full AMC renewal/billing, parts, WhatsApp approvals, release recovery drill and completion rebaseline.

## Service RPC privilege boundary — 2026-10-19

Supabase Security Advisor identified two public SECURITY DEFINER entry points:
`acknowledge_service_sla_alert(uuid)` and `refresh_maintenance_schedule()`.
Migration `20261019_service_rpc_private_boundaries.sql` moves the unchanged
administrator-authorized write/refresh logic to non-exposed
`service_ops_private`. Their original public RPC signatures now use
SECURITY INVOKER wrappers with explicit authenticated-only EXECUTE.
The definer bodies additionally reject a missing auth user and recheck
`private.is_active_admin()` before touching any records.
The database cron service refresh, outbox, API responses and website UI
are not changed. No production service jobs or messages are generated.
The new regression contract runs in Service Pages Integrity CI.
A live SQL privilege check and a fresh Supabase Security Advisor scan are
required before this milestone may be marked verified. The independent
Auth leaked-password protection warning remains outside this migration.

## AMC/Warranty renewal successor drafts — 2026-10-19

Add `20261019_service_maintenance_renewal_links.sql` to the existing secure
contract registry. Administrator-only `/service-maintenance` now displays
a 60-day expiry watch for loaded contracts and can prefill a successor renewal
draft. The draft starts the day AFTER the original contract ends and always
requires an explicitly reviewed end date, revised visit dates and (where
applicable) warranty terms. Saving creates a separate INACTIVE contract;
it never extends or silently edits the prior signed contract.

The database enforces a single successor for each source, same customer,
strictly non-overlapping coverage dates, immutable source lineage,
no self-renewal, and initial inactivity. Existing private/admin RLS is not
weakened. Existing contracts have NULL predecessor and are unchanged.
The frontend renewal watch intentionally reports only loaded records
(currently 1000 max), never an unverified database-wide count. New
`assets/maintenance-renewal.mjs` provides leap-year/date-safe renewal
calculations; `tools/service-maintenance-renewal-contract.mjs` covers
security and date regression in existing Service Pages CI.

This is renewal TRACKING / DRAFTING only, not a signed renewal, automatic
activation, quotation, paid AMC invoice, online payment or service reminder.
Any billing must reuse the existing explicit quotation -> invoice -> payment
workflow with proper financial audit. WhatsApp and phone calls remain OFF.
Actual authenticated staging UAT / backup restore / Auth leak protection
release gates remain pending. Expanded full-scope completion percentage
remains unverified.

## Renewal quotation, invoice & payment read model — 2026-10-19

Migration `20261019_maintenance_renewal_quote_links.sql` adds an append-only
active-admin-only renewal→existing quotation association. Renewal successor
and quotation MUST belong to the same customer, only one quotation per renewal,
and one renewal per quotation. A SQL trigger blocks changing the customer's
identity on a linked quotation. Existing `create_quotation`,
`convert_quotation_to_invoice`, `record_invoice_payment`, and void/
cancel RPCs remain the only finance creation/mutation paths.

`/service-maintenance` now links to `/quotations?customer=<id>` for
explicit drafting, allows manual administrator selection of an existing
eligible quotation, and after confirmation shows the saved quotation and
any existing invoice via `invoices.source_quotation_id`. Invoice totals,
payment_status, amount_paid and balance_due are displayed from the
authoritative invoice ledger, not re-derived locally. Due/overdue warnings
are internal UI hints only and require a real unpaid balance and saved
invoice due date. No WhatsApp, SMS, email or telephone action is fired.

UI lists are bounded: only the first 1000 loaded contracts feed the
renewal/finance cards and the newest 50 eligible quotations are offered
per customer. The underlying SQL uniqueness guards cross-page races.
Association links are immutable and cannot be updated/deleted by
authenticated browser clients. Real authenticated staging end-to-end
financial tests, release recovery proof and leaked-password setting
remain outstanding. The broad renewal billing workflow is not claimed
complete beyond this evidence-backed linkage milestone.

## AMC/Warranty manual renewal follow-up desk — 2026-10-19

The authenticated Service Maintenance admin page now includes a **Manual Renewal
Follow-up Desk**, built directly on the existing 60-day renewal watch and
customer master. For near-expiry/expired coverage without a renewal successor,
admins can review a real customer's contract details, select English or
Malayalam, edit a conservative message draft and manually copy it **only**
after confirming appropriate independent customer messaging permission.

`assets/maintenance-renewal-followup.mjs` has deterministic date-aware
templates without asserted pricing, no inferred WhatsApp opt-in, an explicit
DO NOT CALL notice where flagged, and a safe clipboard button. Copy is
disabled by default, reset on contract/language switch or message edits, and
requires fresh confirmation. The customer `preferred_contact_channel` and
`call_consent` are not interpreted as WhatsApp marketing consent. No
provider API, outbox insertion, logging of contact, auto-calling, sending,
scheduled reminders, paid credits or synthetic customer data is introduced.

A dedicated regression `tools/service-maintenance-followup-contract.mjs`
checks Malayalam/English expiry text, malformed contract dates,
renewal-suppression, opt-in acknowledgement and zero outbound actions in
Service Pages CI. This milestone uses existing authorized customer reads
only and **has no new migration**.

Production database connector must be reconnected for subsequent stored
follow-up statuses, server-authorized consent evidence or any new RLS schema
work. Real messaging still requires explicit owner-approved provider
integration, customer consent, approved templates, delivery tracking, and
legal compliance. Authenticated transactional UAT, restoration proof and Auth
leaked-password setting remain pending; do not call the full project done.

## Manual follow-up audit and operator history — 2026-10-19

Milestone after merged PR #45. New migration
`20261019_maintenance_manual_followup_audit.sql` creates a secure
append-only `service_maintenance_followup_events` history table with
contract/customer foreign keys, an idempotent client event UUID, server-side
authenticated actor/time, manual event type, channel/language, short
permission-reference attestation and optional note. The insert trigger
fails closed for missing admin or customer mismatch and rejects outbound
phone-related records when the customer is marked `do_not_call`.
Active admin alone may SELECT/INSERT under RLS; anonymous users and
UPDATE/DELETE are denied. No RPC escalates privileges.

The `/service-maintenance` admin view adds a separate manual log panel
and a bounded 100-row chronological history per selected contract. It records
**operator assertions** (`draft_reviewed`, `manual_attempt_reported`,
`customer_reply_reported`) rather than fabricated provider sent/delivered
events. Permission reference text is operator-supplied and NOT independently
verified consent. Recording a follow-up does not message the customer.
The existing English/Malayalam review + clipboard experience is preserved.

The migration must be applied and checked with live SQL before the new
history UI can write/read actual records. During implementation the linked
Supabase app returned `link_id must identify an eligible linked account`.
Code and CI tests may merge independently, but **do not claim this database
milestone deployed, verified or end-to-end operational** until live
migration, RLS/ACL readback, negative tests and isolated authenticated UAT
pass. On production environments still missing the migration, the new
history panel reports unavailability while old manual draft/copy remains
usable. Never auto-send WhatsApp, SMS or telephone messages without separate
customer consent, owner approval and provider integration. The existing Auth
leaked-password protection warning and backup recovery evidence remain
release blockers.
