# Minarva Technologies — Project Continuation Source of Truth

## Project identity

This repository is for **Minarva Technologies' own business website + internal business operations system**.

It is **not** the separate commercial product **Minarva Biz**.

The goal is one connected system for Minarva Technologies covering:
- Public website
- Enquiry capture
- Admin CRM
- Customer management
- Quotations
- Billing / invoices
- Payments
- Service jobs / tickets
- Computer & CCTV service workflow
- Product/service catalogue
- Purchases / expenses where needed
- Reports
- Customer follow-up and reminders
- Automatic calling / AI customer care
- Future customer self-service / portal

## Delivery rules

- Continue from live GitHub/Supabase state; do not restart finished work.
- Work in **small, fully completed milestones**.
- Do not simplify away required features.
- Root-cause fix blockers rather than removing features.
- Prefer free architecture while the business is still scaling.
- Keep public website and internal admin system connected but security-separated.
- Use RLS on exposed Supabase tables.
- Never expose service-role secrets in browser code.
- Preserve existing public website and CRM behavior while adding billing/operations.

## Current architecture

- GitHub repository: `evertekitsolutions-del/minarva-technologies-website`
- Hosting: Vercel
- Backend/Auth/DB: Supabase
- Supabase project: `minarva-technologies-web`
- Supabase project ref: `kwullzwhlzziosjsejud`
- Region: Mumbai / ap-south-1

## Current completed foundation

### Public website
- Responsive Minarva Technologies website
- Enquiry form
- Supabase-backed enquiry creation
- WhatsApp handoff
- Public form protected by RLS constraints

### Admin / CRM
- Authorized Supabase Auth admin login
- Admin allowlist/bootstrap foundation
- Enquiry dashboard
- Exact database-wide KPI counts
- Search, filters, sorting and CSV export
- Status workflow: New / Contacted / Qualified / Closed / Spam
- Follow-up dates, notes and follow-up filters
- Add and edit enquiries
- Call / WhatsApp / Email actions
- Database-wide duplicate phone detection
- Database-wide customer history
- Phone normalization at DB level
- Service normalization at UI + DB level
- Standard service suggestions
- Progressive older-record loading
- Cursor-safe Load Older
- Load All option for full table/CSV scope
- Responsive admin toolbar

## Baseline at creation of this file

Latest known website/admin baseline before billing foundation:
`c369cfade73947b4a64f7d4c66baf3cf2a8bc764`

Billing foundation commits:
- continuation/calling roadmap: `5840319eabcd2eedb902352758218ecad95210dc`
- billing foundation migration: `efec9980ef84f5eee24cea8f8f157628150c46db`
- FK index cleanup migration: `445741d34d54733b700c670e8e3d8adce6c311f9`

Always verify live state before substantive work.

## Overall own-business roadmap

### Phase A — Billing & quotation foundation
Build the internal commercial-document system without disturbing the public CRM.

Required foundation:
- Business billing settings
- GST-ready but GST-optional configuration
- Customer master linked to enquiry/customer history
- Product / service catalogue
- Quotation header + line items
- Invoice header + line items
- Payments and outstanding balance
- Professional document numbering
- Tax / discount / notes / terms support
- PDF/print-ready document output later in the phase
- Convert enquiry → quotation
- Convert quotation → invoice
- Audit timestamps and authorized admin access

### Phase B — Service operations
- Service job / ticket creation
- CCTV service workflow
- Computer/laptop service workflow
- Customer device/site details
- Complaint / diagnosis / work performed
- Technician assignment
- Parts/material usage
- Job status
- Follow-up / completion
- Service history
- Link service job → invoice

### Phase C — Purchases / expenses / inventory support
Only what Minarva Technologies needs operationally:
- Purchases
- Suppliers
- Stock / parts where applicable
- Expenses
- Basic profitability/reporting links

### Phase D — Customer experience
- Customer portal or secure document access
- Quote/invoice/service-status view
- Payment status
- Service history
- Optional reminders

### Phase E — Automatic calling / AI customer care

Build a provider-agnostic voice customer-care layer connected to CRM, billing and service operations.

Required capabilities:
- Inbound customer-care calls
- Outbound follow-up calls
- AI voice agent with Malayalam + English support target
- IVR / intent routing
- Lead follow-up after website enquiry
- Quotation follow-up
- Invoice/payment reminder calls
- Service appointment confirmation
- Service completion / feedback calls
- AMC / maintenance reminder calls
- Human-agent handoff / callback request
- Call outcome stored back in CRM
- Call notes, transcript and summary where supported
- Retry policy with limits; never uncontrolled repeated calling
- Customer opt-out / do-not-call handling
- Consent and communication-preference tracking
- Allowed calling hours / quiet-hours enforcement
- Call recording disclosure where recording is enabled
- Private storage and retention controls for recordings/transcripts
- Provider webhook event log for ringing/answered/completed/failed states
- Provider abstraction so telephony vendor can be changed later without redesigning CRM

Voice-ready data model must include:
- customer communication consent
- preferred language
- preferred contact channel
- do-not-call flag
- call consent source + timestamp
- call campaigns / call jobs
- call attempts
- call outcomes
- callback requests
- provider call IDs
- optional transcript / summary references

Compliance/security requirement:
- Design calling workflows to respect applicable telecom, DND/consent, privacy and recording rules before production activation.
- Do not make promotional robocalls to customers without an appropriate legal/consent basis.
- Keep telephony secrets server-side only.
- Browser/admin UI must never contain provider secret credentials.

### Phase F — Reporting / automation
- Sales and service reports
- Outstanding receivables
- Enquiry conversion
- Service turnaround
- Revenue by service category
- Reminder automation using free-tier-compatible scheduling where practical
- Voice-call conversion and outcome reporting
- Call answer/failure/callback metrics
- Customer-care performance dashboards

## Billing Foundation — Milestone 1 — COMPLETE

Completed in Supabase and committed as migrations:
- `supabase/migrations/20261005_billing_foundation_milestone_1.sql`
- `supabase/migrations/20261005_billing_foundation_index_cleanup.sql`

Implemented:
- business billing settings
- voice-ready customer master
- catalogue items/services
- quotations
- quotation items
- admin-only RLS policies
- phone normalization for customer master
- updated_at triggers
- quotation/customer/catalogue indexes
- foreign-key index cleanup

Voice-ready customer fields included:
- preferred_language
- preferred_contact_channel
- call_consent
- call_consent_at
- call_consent_source
- do_not_call

Security advisor after migration: no new database/RLS security finding; only the existing Auth leaked-password-protection warning remains.
Performance advisor after cleanup: no unindexed-foreign-key findings remain; only unused-index informational notices remain on the new/low-usage tables.

## Billing Foundation — Milestone 2A — COMPLETE

Implemented in `admin.html`:
- authenticated **Billing Settings** entry point in the Admin Dashboard
- secure load/save against `business_billing_settings`
- singleton upsert flow
- Business / Legal name
- optional GSTIN + PAN
- phone + email
- billing address
- State / State Code / PIN / Country
- GST / Non-GST default tax mode
- currency
- quotation + invoice prefixes
- financial-year start month
- quotation validity days
- default terms
- UPI ID
- bank name / account holder / account number / IFSC
- client-side validation for key billing identifiers
- modal cancel / backdrop / Escape handling
- existing CRM dashboard behavior preserved

GitHub commit:
- `068b62074601dacf5b615eb04d4b7d0163949977`

The browser uses the existing Supabase publishable key + authenticated session; admin-only RLS remains the authority for reads/writes.

## Billing Foundation — Milestone 2B1 — COMPLETE

Implemented in `admin.html`:
- authenticated **Customer Master** entry point
- customer list + search
- create customer
- edit customer
- database-wide duplicate-phone awareness using `phone_normalized`
- optional customer code
- GSTIN
- billing address + separate service/site address
- source enquiry ID linkage field
- preferred language
- preferred contact channel
- call consent flag
- consent source + consent date/time
- Do Not Call flag
- internal customer notes
- responsive Customer Master layout
- admin-only RLS remains the database authority

GitHub commit:
- `9a7a15599cd4393e0e950456b4961d427fa05767`

No fake production customer data was created.

## Billing Foundation — Milestone 2B2 — COMPLETE

Implemented:
- durable `enquiries.customer_id -> customers.id` foreign-key link
- indexed enquiry/customer linkage
- safe backfill only for unambiguous existing `source_enquiry_id` relationships
- public website cannot insert `customer_id`; authenticated admin update path remains RLS-controlled
- direct **Create/Link Customer** action on every enquiry row
- direct **Create / Link Customer** action inside Manage Enquiry
- linked enquiries show **Open Customer**
- existing customer detection by normalized phone
- single match opens the existing customer and offers explicit linking
- multiple matches require the admin to select the correct customer before linking
- no match prefills Customer Master from enquiry name / phone / email
- new customer preserves `source_enquiry_id`
- preferred contact can be suggested from enquiry source, but **call consent is never inferred**
- new customer creation from an enquiry automatically links only after successful customer creation
- linked customer confirmation returns to Manage Enquiry
- core enquiry loads now include `customer_id`

Migration:
- `supabase/migrations/20261005_enquiry_customer_link.sql`

GitHub commits:
- migration fix/final: `d2a100597f6c6052a997f4a3045ff3ed72be6cc8`
- enquiry → customer UI workflow: `8a3ca2c24018d6c19c9401e21267257ec0990954`

Security verification:
- new customer link is nullable and FK-protected
- anonymous website role has no INSERT privilege on `customer_id`
- authenticated admin can update the link subject to existing admin RLS
- Security Advisor shows no new database/RLS issue; the pre-existing leaked-password-protection Auth warning remains
- Performance Advisor shows only unused-index informational notices on low-usage/new indexes

## Billing Foundation — Milestone 2C1 — COMPLETE

Implemented in `admin.html`:
- authenticated **Catalogue** entry point in Admin Dashboard
- catalogue list + search
- Product / Service type filter
- Active / Inactive filter
- create catalogue item
- edit catalogue item
- SKU / item code
- HSN / SAC
- unit
- unit price
- GST / tax rate
- active / inactive status
- description for quotation/invoice line reuse
- standardized Minarva service presets for fast service creation
- service-name normalization for catalogue services
- duplicate SKU error handling
- responsive catalogue layout
- admin-only RLS remains the database authority

GitHub commit:
- `6976a63523a556e2842ab1053f706d67b686f14f`

No fake product/service data was created.

Security verification after UI milestone:
- no new database/RLS finding
- the existing Supabase Auth **Leaked Password Protection Disabled** warning remains

## Billing Foundation — Milestone 2C2 — COMPLETE

Implemented:
- dedicated authenticated `/quotations` workspace
- Admin Dashboard **Quotations** navigation
- quotation list + search + Draft/Sent filter
- create quotation
- select Customer Master record
- optional source enquiry ID
- active catalogue Product / Service selection
- custom manual lines
- quantity
- unit
- unit price
- line discount %
- GST / tax rate
- HSN / SAC
- No-tax / GST-exclusive / GST-inclusive modes
- live subtotal / discount / taxable / tax / grand-total calculation
- quotation date + validity
- notes + terms
- Draft / Sent status
- existing quotation Draft/Sent status update
- URL prefill support for future `?customer=<uuid>&enquiry=<id>` shortcuts
- responsive mobile/tablet layout

Professional quotation numbering:
- added Billing Settings `document_company_code` (default `MT`)
- format: `QT-MT-2026-27-0001`
- financial-year-aware sequential counter
- atomic numbering inside the same database transaction as quotation header + lines
- configurable quotation prefix + company code
- no fake quotation data created for testing

Database implementation:
- `quotations.tax_mode`
- private `document_counters`
- atomic `public.create_quotation(...)` RPC
- server-side line validation and totals
- server-side inclusive/exclusive/non-tax calculation
- customer and optional enquiry validation
- transaction rollback protects against partial quotation creation

Security hardening:
- initial RPC SECURITY DEFINER linter warning was root-cause fixed
- `create_quotation` now runs as SECURITY INVOKER
- private document counter has RLS enabled
- counter access is authenticated + active-admin policy controlled
- anonymous users cannot execute quotation creation RPC
- current Security Advisor has no new quotation/RLS warning; only the pre-existing **Leaked Password Protection Disabled** Auth warning remains
- Performance Advisor shows only unused-index informational notices on new/low-usage indexes

Migrations:
- `supabase/migrations/20261005_quotation_creation_foundation.sql`
- `supabase/migrations/20261005_quotation_creation_security_cleanup.sql`

GitHub commits:
- atomic quotation creation + numbering migration: `0d788e770caf9032d911eb74000e1ac159004291`
- quotation workspace UI: `0bbc1dced0ad6de6c5b42df4cbf86a664ce13167`
- Admin navigation + company-code settings: `1833b54d7025d25ec278d74c0542606d9ce1b8a8`
- quotation RPC security cleanup: `dc9c3b747e2ac875c6d0742fbc81468061aa959c`

## Billing Foundation — Milestone 2C3 — COMPLETE

Implemented:
- open any saved quotation from the quotation list
- load and view all saved quotation line items
- Draft quotation editing
- non-Draft quotations open read-only
- atomic `public.update_quotation(...)` RPC
- quotation number preserved during Draft edits
- server-side revalidation and recalculation of all line totals and quotation totals
- transactional line replacement; failed edits roll back without partial data
- professional A4 quotation print layout
- business details
- customer billing/contact details
- GSTIN / tax mode
- quotation number/date/validity/reference
- line-item HSN/SAC, qty, unit, rate, discount, tax and amount
- subtotal / discount / taxable / tax / grand total
- notes
- payment details / UPI / bank information
- terms & conditions
- print preview
- browser Print / Save as PDF flow
- direct **Enquiry → Quotation** shortcut for enquiries already linked to a Customer Master record
- direct shortcut available both from enquiry rows and Manage Enquiry
- existing `?customer=<uuid>&enquiry=<id>` quotation prefill is now wired into the CRM workflow

Security / integrity:
- `update_quotation` is authenticated-admin-only through existing RLS + admin authority
- anonymous execution is blocked
- only quotations whose current database status is `draft` can be structurally edited by the edit RPC
- quotation numbers are never regenerated during edit
- current Security Advisor reports no new database/RLS finding; only the pre-existing **Leaked Password Protection Disabled** Auth warning remains
- Performance Advisor reports only unused-index informational notices on new/low-usage indexes

Migration:
- `supabase/migrations/20261005_quotation_edit_rpc.sql`

GitHub commits:
- atomic Draft quotation edit RPC: `799b28d4ed768fcf6a6d5ebe32c937a005fe82a6`
- saved quotation detail/edit + A4 print/PDF preview: `0ea412a319a8cef1a4da93715d6ca8475cd9d3cf`
- direct Enquiry → Quotation shortcuts: `77350743538b85745e8332571001036c31a0c1f0`

No fake quotation/customer/product data was created.

## Billing Foundation — Milestone 2D1 — COMPLETE

Implemented:
- invoice header + invoice line-item tables
- source quotation reference retained and unique
- financial-year-aware invoice numbering using existing private document counter
- format: `INV-MT-2026-27-0001`
- atomic authenticated `convert_quotation_to_invoice(...)` RPC
- conversion allowed only from Sent / Accepted quotations
- quotation customer, enquiry, tax mode, totals, notes, terms and line items copied without retyping
- source quotation automatically marked `converted`
- duplicate quotation → invoice conversion blocked
- GST / Non-GST totals preserved from the quotation
- payment foundation fields: `amount_paid`, generated `balance_due`, generated `payment_status`
- payment states: Unpaid / Partially Paid / Paid
- security-invoker customer outstanding summary view
- dedicated authenticated `/invoices` workspace
- invoice search + status/payment filters
- invoiced / paid / outstanding summary cards
- Admin Dashboard **Invoices** navigation
- **Convert to Invoice** action on eligible quotation rows
- conversion redirects directly to the created invoice in the invoice workspace
- billing-settings singleton defaults are guaranteed without overwriting saved settings
- no fake invoice or payment data created

Migration:
- `supabase/migrations/20261005_invoice_conversion_foundation.sql`
- `supabase/migrations/20261005_ensure_billing_settings_default.sql`

GitHub commits:
- invoice DB + atomic conversion foundation: `4f3ded6a4e81286f5798c71bbe6738d2e25b69b9`
- billing-settings default guard: `f7eccc1b45ac167b6fb5deba9f94e2453b896b5d`
- invoice workspace: `a8aaa1a6856c61f583aa3087f81d54cb63ee257b`
- quotation conversion UI: `d11d3860846266e8f42b72f9340096205bcf7dc9`
- Admin invoices navigation: `e31ad0dc7020e04a54f3300fd656ad63208f6dff`

Security verification:
- invoice and invoice-item tables are protected by admin-only RLS
- conversion RPC runs as SECURITY INVOKER
- authenticated admin execution is allowed
- anonymous execution is blocked
- outstanding view uses security-invoker semantics so underlying RLS remains authoritative
- Security Advisor checked after the milestone; the existing Auth leaked-password-protection warning remains if still reported
- Performance Advisor checked after the milestone; unused-index notices on newly created/low-usage indexes are informational

## Billing Foundation — Milestone 2D2 — COMPLETE

Implemented:
- open any saved invoice
- full invoice detail with source quotation / enquiry references
- line-item detail and totals
- professional A4 invoice preview
- browser Print / Save PDF
- payment-entry form
- payment date
- payment amount
- payment method: Cash / UPI / Bank Transfer / Card / Cheque / Other
- payment reference
- payment notes
- audit-safe `invoice_payments` ledger
- atomic `record_invoice_payment(...)` RPC
- server-side overpayment prevention
- automatic `amount_paid`, generated `balance_due`, generated `payment_status`
- payment states: Unpaid / Partially Paid / Paid
- customer-wide payment history
- void-payment correction workflow with mandatory reason
- payment rows cannot be hard-deleted
- posted payment financial/history fields are immutable
- voided payments remain visible in audit history
- atomic `void_invoice_payment(...)` RPC
- invoice cancellation workflow with mandatory reason
- invoices are never deleted by cancellation
- invoices with active payment history cannot be cancelled until payment corrections are completed
- direct invoice amount/status mutation is guarded; approved RPC workflows are the authority
- atomic `cancel_invoice(...)` RPC
- security-invoker `invoice_collection_candidates` view for future collection automation
- collection candidate data includes outstanding balance, due date, days overdue, preferred language/contact channel, call consent and Do Not Call state
- **AI call eligibility requires explicit call consent and Do Not Call = false**
- invoice screen clearly shows AI-call eligible / blocked state and reason
- no automated call is placed by this milestone
- converted invoice URL now opens the created invoice detail directly
- no fake payment or invoice data created

Migrations:
- `supabase/migrations/20261005_invoice_payment_ledger.sql`
- `supabase/migrations/20261005_invoice_payment_fk_indexes.sql`

GitHub commits:
- payment ledger + audit-safe RPC foundation: `122d8dc5e49430360bf142458b9eac439287661a`
- Invoice Detail / A4 Print / Payment UI: `782031ddb253c7422db7269525dce7d17d6945d7`
- payment audit-actor FK index cleanup: `482040bfe0df4924509bb562f154de2ec601bdbd`

Security verification:
- payment table is admin-RLS protected
- anonymous users cannot read payment records
- anonymous users cannot execute payment / void / cancel RPCs
- authenticated admin execution is allowed
- authenticated role has no DELETE privilege on payment history
- payment audit trigger is active
- invoice financial/status mutation guard is active
- current Security Advisor shows no new database/RLS problem; only the pre-existing **Leaked Password Protection Disabled** Auth warning remains
- new unindexed-FK findings introduced by payment ledger were fixed; remaining Performance Advisor findings are unused-index informational notices on a new/low-usage database

## Operations — Milestone 3A1 — COMPLETE

Implemented:
- secure `technicians` master table
- secure `service_jobs` table
- immutable/read-only lifecycle `service_job_events` history
- financial-year-aware service ticket numbering
- format: `JOB-MT-2026-27-0001`
- reusable private atomic document-sequence allocator
- **root-cause fix** for the earlier SECURITY INVOKER invoice-conversion counter access: invoice conversion now uses the protected allocator instead of requiring direct access to the private counter table
- authenticated `create_service_job(...)` RPC
- create service job from:
  - Enquiry
  - Customer Master
  - Invoice
  - standalone Service Jobs workspace
- source-enquiry and source-invoice/customer consistency checks
- customer + service/site address
- service category
- device/equipment details
- complaint / requested service
- requested/planned work
- priority: Low / Normal / High / Urgent
- lifecycle statuses: Open / Scheduled / In Progress / On Hold / Completed / Cancelled
- automatic Completed timestamp
- assigned technician foundation
- quick Technician creation UI
- visit date / schedule
- follow-up date/time
- internal notes
- customer-facing notes
- service-charge estimate
- parts estimate
- generated total estimate
- dedicated authenticated `/service-jobs` workspace
- job list/search
- status filter
- priority filter
- create + edit workflow
- lifecycle history display
- Admin Dashboard **Service Jobs** navigation
- direct Enquiry → Service Job shortcut
- direct Manage Enquiry → Service Job shortcut
- direct Customer Master → Service Job shortcut
- direct Invoice → Service Job shortcut
- completed jobs remain permanently linked through Customer / Enquiry / Invoice references for future billing and customer history
- security-invoker `service_job_followup_candidates` view
- follow-up candidate data includes preferred language/contact channel, Call Consent and Do Not Call
- **AI follow-up call eligibility requires explicit Call Consent and Do Not Call = false**
- Service Jobs UI visibly shows AI follow-up eligible / blocked state
- no automated calls are placed by this milestone
- no fake technician or service-job data created

Integrity / audit safeguards:
- job number is immutable after creation
- creation audit fields cannot be rewritten
- edited enquiry/invoice links must still belong to the selected customer
- inactive/nonexistent technician assignment is rejected
- Scheduled status requires a schedule date/time
- status, assignment and schedule changes are automatically written to lifecycle history
- anonymous users cannot read the service tables or execute service-job creation
- admin-only RLS remains the authority

Migrations:
- `supabase/migrations/20261005_service_job_foundation.sql`
- `supabase/migrations/20261005_service_job_integrity_hardening.sql`

GitHub commits:
- service-job DB / numbering / lifecycle foundation: `c1f7727b32877c287c94df197f1d6aaf1c2bc37f`
- Service Jobs workspace: `121082f00b2669e4e19c1cadf6a7e77355e1bceb`
- service-job edit integrity hardening: `11e1f91af4496aecb80553a6d9de601d5a5a575a`
- Admin / Enquiry / Customer shortcuts: `062133ec83c92f021be6903ad6a6523c29df686f`
- Invoice → Service Job shortcut: `11d453a3dc9eeb4324f48da8fed2cf5b31da03e8`

Verification:
- technicians / service_jobs / service_job_events tables present
- service-job follow-up view present
- create-service-job RPC is SECURITY INVOKER
- authenticated execution allowed
- anonymous execution blocked
- lifecycle trigger active
- update-integrity trigger active
- Security Advisor reports no new database/RLS finding; only the existing **Leaked Password Protection Disabled** Auth warning remains
- Performance Advisor reports only unused-index informational notices on the new/low-usage schema

## Operations — Milestone 3A2 — COMPLETE

Implemented:
- dedicated authenticated `/job-sheet?job=<uuid>` execution workspace
- professional service job-sheet detail view
- A4 Print Preview + browser Print / Save PDF
- visit timeline controls:
  - Visit Start
  - Arrival
  - Work Start
  - Work Complete
- chronological visit-stage validation
- diagnosis / findings
- work performed
- resolution states:
  - Resolved
  - Partially Resolved
  - Unresolved
  - Awaiting Parts
  - Return Visit Required
- unresolved / return-visit reason
- next visit date/time
- callback-required flag + callback time
- completion checklist
- Warranty reference
- AMC reference
- actual service charge
- parts/materials-used ledger
- automatic parts actual total
- automatic overall actual total
- customer acknowledgement name / remarks / date-time
- handwritten customer-signature canvas
- private signature storage
- private Before Photo / After Photo / Other Image upload
- private Storage bucket: `service-job-media`
- 10 MB image limit
- JPG / PNG / WEBP restriction
- signed private preview URLs
- attachment metadata linked to service job
- attachment removal flow
- lifecycle history additions for visit execution / billing preparation
- Completed status now requires Work Complete timestamp + Resolution
- billing-sensitive fields lock after billing preparation
- direct Service Job → Job Sheet navigation
- Completed status in the basic Service Jobs editor now directs users to the Job Sheet workflow
- completed service work can generate a Draft quotation without retyping
- service charge + used materials are copied into the Draft quotation
- quotation stores `source_service_job_id`
- service job stores `billing_quotation_id` + billing-prepared timestamp
- Job Sheet opens the generated billing quotation directly
- Quotations workspace supports `?quotation=<uuid>` deep-link opening
- no automated customer call is placed here; existing consent / Do Not Call logic remains visible for future AI follow-up

Database / RPC:
- `service_job_materials`
- `service_job_attachments`
- new execution / acknowledgement / resolution / actual-charge fields on `service_jobs`
- `mark_service_job_stage(...)`
- `save_service_job_execution(...)`
- `prepare_service_job_billing(...)`
- private Storage RLS policies restricted to active authenticated admins
- anonymous stage / execution / billing access is blocked
- service-job media bucket is private
- service-job execution remains linked to Customer / Enquiry / Invoice / Quotation history

Migration:
- `supabase/migrations/20261005_service_job_visit_execution.sql`

GitHub commits:
- Job Sheet / execution DB + Storage + billing-prep foundation: `ac99e3b0a1739d46eca9da22bf46f93ded4ed7b3`
- dedicated Job Sheet execution workspace: `42e4e18862b35e4feae1d011563436091c6ff4a7`
- Service Jobs → Job Sheet navigation + completion workflow guard: `e67a3bd33bb0334b8354b5c2c6051f5cd4eaba4`
- service-job billing quotation deep link: `673eaab2eea801a758b1fda78dae9e45549bc630`

Verification:
- service-job materials table present
- service-job attachments table present
- private media bucket present
- visit / billing fields present
- visit-stage RPC present
- execution-save RPC present
- billing-preparation RPC present
- authenticated admin execution allowed
- anonymous execution blocked
- Storage policies are active-admin-only
- Security Advisor reports no new database/RLS issue; the existing **Leaked Password Protection Disabled** warning remains
- Performance Advisor currently reports unused-index informational notices only on this new/low-usage schema

## Operations — Milestone 3A3 — COMPLETE

Implemented:
- dedicated technician mobile/PWA at `/technician`
- technician password login + account creation through Supabase Auth
- technician account can claim access only when its authenticated email exactly matches an active approved Technician Master record
- `mobile_access_enabled` gate
- technician last-mobile-seen timestamp
- assigned-job queue only
- Today / Upcoming / Overdue / All views
- customer call shortcut
- visit execution controls:
  - Visit Start
  - Arrival
  - Work Start
  - Work Complete
- technician ETA + ETA note
- technician ETA/status changes create customer-notification outbox hooks
- quick diagnosis and work-performed notes
- resolution / unresolved reason
- next visit + callback
- completion checklist
- Warranty / AMC reference capture
- mobile materials-used entry
- admin-set existing material prices are preserved when technician changes quantities/descriptions
- touch customer acknowledgement/signature
- camera-oriented Before / After / Other photo capture
- private Storage upload under assigned-job-only `/<job-id>/mobile/*` paths
- technician can access only media for assigned jobs
- IndexedDB offline cache for technician profile, queue and opened job
- offline mutation queue
- offline photo/signature Blob queue
- automatic retry when connection returns
- idempotent client action IDs prevent double-applying an uncertain/retried action
- PWA manifest
- scoped Service Worker
- offline app-shell fallback
- Supabase dynamic API responses are deliberately not cached by the Service Worker
- installable standalone mobile experience
- technician can complete a job from mobile after Work Complete + Resolution requirements are met
- Service Operations admin screen now links directly to Technician Mobile
- Technician creation guidance explains that the same real email is required for mobile account linking

Access-control / API architecture:
- `technician_mobile_actions` idempotency/audit table
- `service_job_notification_outbox` notification-hook table
- technician ETA fields on service jobs
- technician mobile queue/profile/job/action RPCs
- technician mobile functions expose only scoped public SECURITY INVOKER wrappers
- privileged implementation functions were moved to the private schema
- anonymous users cannot call technician RPCs
- technician app does not receive direct broad Data API table access; assigned-job data is returned through scoped RPCs
- duplicate permissive technician/admin SELECT policies were removed
- service-job media Storage policies were consolidated:
  - admin full access
  - technician assigned-job mobile-folder access only
  - technician delete restricted to own uploaded objects
- customer Call Consent / Do Not Call remains enforced before any future call-channel notification hook can be marked pending
- no outbound WhatsApp/SMS/email/call provider is triggered yet; only durable provider-agnostic hooks are queued

Weak-network / retry behavior:
- stage/ETA/execution/material/completion actions use client-generated action UUIDs
- server records each mobile action exactly once
- retrying the same action UUID returns the existing result instead of duplicating the action
- photos/signatures use deterministic storage paths derived from the queued action UUID
- pending actions persist in IndexedDB until sync succeeds

PWA files:
- `technician.html`
- `technician-sw.js`
- `technician.webmanifest`
- `technician-icon.svg`

Migrations:
- `supabase/migrations/20261005_technician_mobile_pwa_foundation.sql`
- `supabase/migrations/20261005_technician_mobile_security_hardening.sql`

GitHub commits:
- technician mobile DB / access / idempotency / notification-hook foundation: `b99716245a235b59835e7fb355c288893ad4d9f9`
- Technician Mobile PWA: `3bb865f985eb269fc6ab517ec141a9f6af1afe68`
- offline Service Worker: `3cfd881501bc7c0bc37c09842408409d980964a7`
- PWA manifest: `54328a6525556afc64879b30c25f255fbc8184dc`
- PWA icon: `2f0ef284313e931a73f21cfdba4eedb18e651499`
- Service Operations → Technician Mobile navigation: `a5ac434555eed97b2a977f577d5d34259ef0c902`
- technician RPC/RLS/Storage security hardening: `5cfb5b11fe4807466d4e67e53efda3095d67f323`

Verification:
- technician mobile tables/fields/RPCs present
- authenticated RPC execution allowed
- anonymous RPC execution blocked
- technician Storage policies restricted to assigned-job mobile paths
- public technician RPCs are SECURITY INVOKER after hardening
- Security Advisor no longer reports the technician SECURITY DEFINER exposure findings
- duplicate permissive-policy warnings introduced during the first technician-access pass were removed
- current Security Advisor has only the pre-existing **Leaked Password Protection Disabled** Auth warning
- current Performance Advisor reports unused-index informational notices only; these are expected on the newly created/low-usage schema
- no fake technician/job/mobile-action data was created

## Customer Care — Milestone 3B1 — COMPLETE

Implemented:
- provider-neutral customer-care orchestration layer
- Malayalam / English notification template master
- 16 seeded template variants
- 48 event/channel routes covering WhatsApp / SMS / Email / Call
- event → template routing
- channel preference resolution
- channel-specific opt-out table
- explicit Call Consent enforcement
- Do Not Call hard block
- quiet-hours engine
- default timezone: `Asia/Kolkata`
- default quiet hours: 20:00 → 09:00
- scheduled delivery timestamps
- retry / exponential backoff / max-attempt foundation
- provider-adapter registry
- four disabled provider placeholders; **no credentials or paid provider added**
- generic customer contact outbox
- delivery-attempt log
- customer contact timeline
- automated call job queue
- call reason / language / rendered script / variables
- call outcome
- retry
- callback-required state
- escalation-to-human state
- opt-out hook
- call opt-out also sets Customer Master **Do Not Call**
- service-job durable notification hooks are mirrored into the generic customer-care outbox
- ETA / Visit Started / Arrived / Work Started / Work Completed / Job Completed routes
- invoice Due Soon / Due Today / Overdue reminder generator
- configurable overdue schedule
- campaign master
- campaign members
- Service Follow-up / Invoice Reminder / Automated Call / Manual campaign foundation
- explicit customer selection when creating a campaign in the admin UI
- provider-neutral campaign enqueue RPC
- Customer Care admin dashboard
- Pending / Ready / Sent / Failed / Suppressed KPI cards
- Automated Call Queue view
- Recent Customer Contact Timeline
- provider-adapter status
- editable quiet hours / retry settings
- manual Generate Invoice Reminders action
- manual Prepare Dispatch action
- Admin Dashboard → Customer Care navigation
- no fake customer/contact/call data created
- no external WhatsApp/SMS/email/call request is sent in this milestone

Automatic scheduler:
- Supabase `pg_cron` enabled
- `minarva-customer-care-tick` scheduled every 15 minutes
- scheduler generates eligible invoice reminders
- scheduler prepares due contact attempts
- quiet-hours logic can defer items automatically
- because all provider adapters are intentionally disabled/unconfigured, prepared items stop safely at **Ready** and cannot make a real outbound call/message

Core tables:
- `customer_care_settings`
- `customer_care_provider_adapters`
- `notification_template_variants`
- `notification_event_routes`
- `customer_contact_preferences`
- `customer_care_campaigns`
- `customer_care_campaign_members`
- `customer_contact_outbox`
- `notification_delivery_attempts`
- `customer_contact_timeline`
- `automated_call_jobs`

Core RPC / worker foundation:
- `customer_care_generate_invoice_reminders(...)`
- `customer_care_prepare_dispatch(...)`
- `customer_care_enqueue_campaign(...)`
- `customer_care_record_attempt_result(...)`
- `customer_care_set_opt_out(...)`
- private scheduler / renderer / service-hook mirror workers

Migrations:
- `supabase/migrations/20261005_customer_care_orchestration_foundation.sql`
- `supabase/migrations/20261005_customer_care_scheduler.sql`
- `supabase/migrations/20261005_customer_care_fk_indexes.sql`

GitHub commits:
- customer-care DB / templates / routes / attempts / calls / campaigns: `293c586648f0970d2d359120747a44bc135f3e55`
- automatic 15-minute scheduler: `24224419c51c28056f932c8efa3341644163fd6b`
- Customer Care admin dashboard: `0355c99f0ab03b98a6eb785175d1315b662c3294`
- Admin Dashboard → Customer Care navigation: `49b8729488c75f1411fa376daa8df24416125360`
- customer-care FK/index hardening: `9fa1e0437aa63a4635f322e25dec9df81a3c9661`

Verification:
- 16 template variants present
- 48 event/channel routes present
- 4 provider placeholders present
- 0 provider adapters enabled
- contact outbox / attempts / timeline / campaigns / call-jobs present
- authenticated admin RPC execution allowed
- anonymous execution blocked
- `pg_cron` enabled
- scheduler active at `*/15 * * * *`
- Security Advisor reports no new DB/RLS problem; only the existing **Leaked Password Protection Disabled** Auth warning remains
- unindexed-foreign-key findings introduced by this milestone were fixed
- current Performance Advisor findings are unused-index informational notices on the new/low-usage schema

## Customer Care — Milestone 3B2 — COMPLETE

Implemented:
- Supabase Edge Function runtime: `customer-care-dispatcher`
- Edge Function is ACTIVE and JWT-protected
- authenticated active-admin verification inside the worker
- service-role-only internal claim / finish worker RPCs
- provider runtime modes:
  - Disabled
  - Test
  - Live
- **Live mode is intentionally locked** until a real provider is configured and explicitly approved
- four Mock/Test adapters:
  - Mock WhatsApp
  - Mock SMS
  - Mock Email
  - Mock Automated Call
- all current event/channel routes point to the safe Mock adapters
- Mock adapters simulate successful delivery but make **zero external contact**
- provider health/readiness fields
- stale worker-lock recovery
- idempotent attempt processing through the existing attempt/outbox model
- exponential retry scheduling for provider failures
- dead-letter table for exhausted failures
- manual retry RPC
- test-recipient allowlist foundation
- future external Test adapters are blocked unless the recipient is allowlisted
- provider secrets/config remain server-side; no provider credentials are exposed in the browser
- Customer Care dashboard updated with:
  - **Run Sandbox Dispatcher**
  - Test adapter enable/disable controls
  - Test Recipient Allowlist
  - Dead Letters / Manual Retry
  - failed/suppressed outbox Retry action
  - clear Sandbox/Test warning
  - explicit **Live locked** status
- sandbox call results are labelled `sandbox_simulated`
- no real WhatsApp, SMS, email or phone call is sent
- no paid telephony provider activated
- no fake customer/contact records created

Database / runtime:
- `customer_care_test_allowlist`
- `customer_care_dead_letters`
- provider adapter runtime/health columns
- `customer_care_worker_prepare_dispatch(...)`
- `customer_care_worker_claim(...)`
- `customer_care_worker_finish(...)`
- `customer_care_worker_update_health(...)`
- `customer_care_retry_outbox(...)`
- `customer_care_provider_runtime_state(...)`

Edge Function:
- `supabase/functions/customer-care-dispatcher/index.ts`
- `supabase/functions/customer-care-dispatcher/deno.json`
- Supabase function slug: `customer-care-dispatcher`
- JWT verification enabled
- sandbox response masks recipients
- server-side Service Role is used only inside the Edge Function

Migrations:
- `supabase/migrations/20261007_customer_care_adapter_runtime.sql`
- `supabase/migrations/20261007_customer_care_runtime_fk_indexes.sql`

GitHub commits:
- adapter runtime / sandbox DB foundation: `4867faf1c31d429a8a4dbada631d0e504aad7b06`
- Edge Function dispatcher: `9d97c9bfcfdac09741babc298cc1b4e1d4ce9b7e`
- Edge Function Deno config: `70f71f6b4ae66c59abe0504f296076d66f3fca96`
- Customer Care sandbox dashboard controls: `350aa4161fd3f1ce8c68dee2dc53dd0619f97987`
- runtime FK/index hardening: `ec70013a7060936c4e0c10990905d6b32c447a60`

Verification:
- Edge Function `customer-care-dispatcher` is ACTIVE
- JWT verification is enabled
- authenticated browser role cannot execute internal worker-claim RPC
- Service Role can execute worker-claim RPC
- anonymous users cannot change provider runtime state
- 4 Mock adapters are enabled in Test mode
- 0 Live adapters are enabled
- all 48 event/channel routes are mapped to safe Mock adapters
- Security Advisor reports no new DB/RLS finding; only the existing **Leaked Password Protection Disabled** Auth warning remains
- new unindexed-FK findings introduced by 3B2 were fixed
- remaining Performance Advisor notices are unused-index informational findings on new/low-usage tables

## Customer Care — Milestone 3B3 — COMPLETE

Implemented:
- JWT-protected Supabase Edge Function `customer-care-voice-simulator`
- dedicated authenticated `/voice-simulator` admin workspace
- Malayalam + English conversation state machine
- inbound + outbound sandbox direction support
- conversation goals:
  - Invoice Payment Reminder
  - Service Follow-up
  - Technician ETA / Service Update
  - Callback Handling
  - General Customer Care
- invoice context loading from the actual customer invoice
- service context loading from the actual customer service job
- deterministic intent engine with Malayalam / English / common mixed-language phrases
- structured intents:
  - payment already paid
  - promise to pay
  - invoice/payment dispute
  - callback request
  - wrong number
  - Do Not Call / opt-out
  - human-agent request
  - unresolved service issue
  - resolved service issue
  - acknowledgement / unclear response
- automatic callback timestamp scheduling with configurable delay
- human escalation rules
- maximum-turn escalation
- outbound consent validation **before session start**
- consent / Do Not Call / channel opt-out re-check **before every customer turn**
- saying “do not call” updates Call opt-out + Customer Do Not Call
- “already paid” becomes a verification outcome and **does not silently alter invoice accounting**
- wrong-number / dispute / unresolved-service / human-request outcomes escalate instead of auto-resolving
- transcript persistence
- transcript text PII redaction for email / phone / long sensitive-number patterns
- raw audio is not stored
- structured session summary + structured outcome JSON
- outcome event history
- call outcome → Customer Contact Timeline
- linkage to existing Automated Call Job where available
- browser sandbox TTS using Speech Synthesis when supported
- optional browser speech-recognition input when supported
- text simulator remains authoritative when browser STT is unavailable
- recent sandbox sessions browser
- Customer Care dashboard → **AI Voice Sandbox** shortcut
- real telephony remains **disabled**
- no paid voice/AI API activated
- no fake customer or call-session data created during verification

Database:
- `ai_voice_engine_settings`
- `ai_speech_adapters`
- `ai_call_sessions`
- `ai_call_turns`
- `ai_call_outcome_events`
- `automated_call_jobs.latest_ai_session_id`
- service-role-only worker RPCs:
  - `customer_care_ai_worker_start_session(...)`
  - `customer_care_ai_worker_add_turn(...)`
  - `customer_care_ai_worker_finish_session(...)`

Provider-neutral research:
- documented in `docs/VOICE_ENGINE_RESEARCH.md`
- whisper.cpp — local/offline STT candidate, MIT
- faster-whisper — self-hosted STT candidate, MIT
- Vosk — lightweight offline STT candidate, Apache-2.0
- production local TTS deliberately not locked until both engine and individual voice/model licenses are verified

Migration:
- `supabase/migrations/20261007_ai_voice_conversation_engine.sql`

Edge Function:
- `supabase/functions/customer-care-voice-simulator/index.ts`
- `supabase/functions/customer-care-voice-simulator/deno.json`
- slug: `customer-care-voice-simulator`
- status verified ACTIVE
- JWT verification enabled

GitHub commits:
- AI voice DB/state foundation: `f63f05b00d0043e29b956a0ba20694a4c98a8762`
- AI Voice Edge Function: `bfc6fe6ccdacd91b88fa66eb47956cca0c1f7a47`
- Edge Function Deno config: `eefc8056ad73a3cf26b0aeaa1641b5a7049a38a7`
- Voice Sandbox UI: `ac5e5001dd8cfaee6d80bd1659552a428498c1c9`
- voice-engine research: `97ff61e41cfc6a204cc0ab65e40ebe837e0bdc96`
- Customer Care → Voice Sandbox navigation: `239d53633e2a9c04aac222f4b7188db95e3427c8`

Verification:
- AI voice tables and RLS policies are present
- Edge Function is ACTIVE and JWT-protected
- internal start / turn / finish RPCs are executable by Service Role
- authenticated browser role cannot execute the internal AI worker RPCs directly
- anonymous role cannot execute the internal start RPC
- sandbox enabled = true
- live telephony enabled = false
- currently enabled adapters are the built-in Rules NLU and browser sandbox TTS
- no sandbox session was fabricated for verification
- Security Advisor reports no new DB/RLS problem; only the existing **Leaked Password Protection Disabled** Auth warning remains
- remaining Performance Advisor notices are unused-index informational findings on the new/low-usage schema

## Customer Care — Milestone 3B4A — COMPLETE

Implemented:
- stable provider-neutral STT request / response contract
- stable provider-neutral TTS request / response contract
- telephony webhook event contract
- JWT-protected Edge Function `voice-runtime-gateway`
- gateway actions:
  - health
  - contracts
  - safe probe
- probe intentionally reports **not connected** instead of faking speech inference
- voice runtime profile:
  - PCM S16LE
  - WAV container
  - 16 kHz default
  - mono default
  - configurable max audio duration
  - VAD enable / min speech / silence settings
  - timeout + retry settings
  - live streaming disabled by default
- benchmark registry with Malayalam/English metrics:
  - median / p95 latency
  - realtime factor
  - WER / CER for STT
  - TTS quality proxy field
  - peak memory
  - hardware/runtime evidence
- no fake benchmark numbers inserted
- telephony adapter contract with Live disabled
- DTMF / recording / streaming / voicemail capability flags
- idempotent telephony webhook event storage
- per-call duration / billable duration / currency / cost accounting foundation
- real provider-call IDs and call-leg IDs can be stored later
- candidate STT adapters remain disabled:
  - whisper.cpp
  - faster-whisper
  - Vosk
- candidate TTS adapters remain disabled:
  - Piper
  - Kokoro
  - Mimic 3
- no primary/fallback speech engine selected before benchmark evidence
- no real audio processing
- no real phone dialing
- no paid provider activated

Database:
- `voice_runtime_profiles`
- `voice_benchmark_runs`
- `voice_runtime_requests`
- `telephony_adapter_contracts`
- `telephony_webhook_events`
- `telephony_call_usage`
- `customer_care_voice_register_benchmark(...)`
- `customer_care_telephony_runtime_state(...)`

Edge Function:
- `supabase/functions/voice-runtime-gateway/index.ts`
- `supabase/functions/voice-runtime-gateway/deno.json`
- slug: `voice-runtime-gateway`
- ACTIVE
- JWT verification enabled

Migrations:
- `supabase/migrations/20261007_voice_runtime_contracts.sql`
- `supabase/migrations/20261007_voice_runtime_fk_indexes.sql`

GitHub commits:
- runtime / benchmark / telephony contract schema: `f373ee73224f12560a95893c5d5634eb1ab76b15`
- voice runtime gateway: `bd8743ff4eb9c9a3973e349eabe322baf4bab62c`
- gateway Deno config: `8978edaa92204024d485dca8ce9777fb5a7cde3a`
- FK performance cleanup: `2936bfae0b77a822ad466de5030bf5913b31b525`
- expanded voice/TTS research: `6c2ab650015f754db5dbf453ce7f2c9fc171ebf6`

Verification:
- gateway is ACTIVE and JWT-protected
- live audio streaming = false
- benchmark registry contains no fabricated benchmark run
- live telephony adapters = 0
- anonymous role cannot use benchmark/runtime-control RPCs
- Security Advisor still reports no new DB/RLS problem; only the existing **Leaked Password Protection Disabled** Auth warning remains

## Customer Care — Milestone 3B4B — HARNESS COMPLETE / REAL RUNS PENDING

Implemented:
- reproducible local STT benchmark harness
- direct adapters for:
  - whisper.cpp
  - faster-whisper
  - Vosk
- Malayalam + English JSONL corpus manifest format
- mandatory audio normalization to 16 kHz mono PCM16 WAV
- WER measurement
- CER measurement
- per-sample latency
- median latency
- p95 latency
- realtime factor
- observed max-RSS memory metric
- transcript hypothesis capture
- model/runtime/hardware evidence fields
- provider-neutral TTS benchmark harness for Piper/Kokoro-style local runtimes
- TTS latency / realtime-factor measurement
- TTS MOS/quality intentionally remains null until a real listening evaluation is performed
- authenticated admin benchmark importer to `voice_benchmark_runs`
- no Service Role credential required by benchmark importer
- bilingual benchmark selection gate in the database
- Primary/Fallback STT/TTS cannot be selected unless:
  - the adapter is production-approved
  - real Malayalam evidence exists
  - real English evidence exists
  - STT has WER/CER measurements
  - TTS has a real quality score
- Primary and Fallback adapter cannot be identical
- dedicated authenticated `/voice-runtime` Benchmark & Selection Center
- adapter readiness UI
- benchmark registry UI
- runtime safety UI
- selection controls backed by server-side validation
- Voice Sandbox + Customer Care navigation to Voice Runtime
- live audio streaming remains OFF
- live telephony remains OFF
- no fabricated benchmark result inserted

Files:
- `tools/voice_benchmark/benchmark.py`
- `tools/voice_benchmark/tts_benchmark.py`
- `tools/voice_benchmark/import_result.py`
- `tools/voice_benchmark/README.md`
- `tools/voice_benchmark/corpus.example.jsonl`
- `tools/voice_benchmark/tts_corpus.example.jsonl`
- `voice-runtime.html`

Migration:
- `supabase/migrations/20261007_voice_benchmark_selection_gate.sql`

GitHub commits:
- STT benchmark harness: `5bd71fd22d6f46868268d8dd73ebb9f34bb17141`
- TTS benchmark harness: `d63001d1c602e1f4af0104b7c78022a3fb0ad205`
- benchmark importer: `228f6ab291a654f3247d2934a6bd8238d129df02`
- benchmark workflow docs: `459b13303fe8b91af3d2aa1dd3628179ecfcdcd0`
- STT corpus example: `f409ee79e2b1c9e4a70c0396ec7eb217b2c9d70a`
- TTS corpus example: `c065575c72f5ba411bb379515540e7a620adfda1`
- benchmark selection gate: `fed3f5e013fef8071db95dde21546fe08bc58728`
- Voice Runtime Center: `1df3328815b390ff4d57e3fcc6382a0855d30764`
- Voice Sandbox runtime navigation: `d0d94570ff63d8862ab636d158371d1bb7f098ab`
- Customer Care runtime navigation: `41ccbba2edd9943f8603a1119f702cac8aeca71f`

Current blocker for measured engine selection:
- an actual machine/server with candidate model files + real consented Malayalam/English benchmark audio is required
- therefore benchmark count can legitimately remain zero until a real run is executed
- no benchmark number may be invented

## Customer Care — Milestone 3B5A — COMPLETE

Implemented:
- authenticated `/calling-readiness` dashboard
- customer call-consent audit
- Do Not Call audit
- call-channel opt-out audit
- phone normalization / callable-format screening
- India +91 normalization for safe 10-digit mobile cases
- international explicit-prefix handling
- ambiguous country-code cases marked Review instead of guessed
- missing / invalid numbers blocked
- duplicate callable-number detection
- quiet-hours audit with configured timezone
- all-customer dry-run preview
- call-campaign-specific dry-run preview
- eligible / review / blocked counts
- assumed call-duration calculator
- optional provider-rate / estimated-cost calculator
- no fake provider price is inserted
- dry-run history table
- telephony cost-profile foundation
- provider capability/configuration contract remains credential-free
- busy / no-answer / voicemail / callback / opt-out / wrong-number / human-escalation outcome policy matrix
- webhook replay/idempotency readiness check
- unique `adapter_key + provider_event_id` contract remains the duplicate-event guard
- database go-live gate matrix
- production go-live checklist
- emergency-stop flag added and defaults **ON**
- live telephony flag remains **OFF**
- live telephony adapters verified = **0**
- anonymous access to call-readiness / dry-run RPCs blocked
- no customer was called

Database:
- `telephony_cost_profiles`
- `telephony_outcome_policies`
- `call_readiness_dry_runs`
- `telephony_go_live_checklist`
- `customer_care_call_readiness_audit(...)`
- `customer_care_call_dry_run(...)`
- `customer_care_campaign_call_dry_run(...)`
- `customer_care_webhook_idempotency_readiness()`
- `customer_care_telephony_policy_matrix()`
- `customer_care_telephony_go_live_readiness()`

Migrations:
- `supabase/migrations/20261007_calling_readiness_audit.sql`
- `supabase/migrations/20261007_calling_readiness_campaign_gates.sql`

Files:
- `calling-readiness.html`
- `docs/AUTOMATED_CALLING_GO_LIVE_CHECKLIST.md`

GitHub commits:
- calling readiness DB / dry-run foundation: `c1895f8d0601d686ef48415e1f73c929c9a06ebd`
- Calling Readiness dashboard: `f4b986f75b051227f040566942aa3d1694c453c4`
- Customer Care → Calling Readiness navigation: `43b9b1e40284eda2f0c5e0274bb456e6a3994bb4`
- campaign dry-run + go-live gates: `589cb914dfbb885f607b87bbf4ca8d4a64815145`
- production go-live checklist: `4863b33d5084262e7d795423cda7da7257c9b816`
- Calling Readiness campaign/gate UI: `9f1c3363f40550115bd8c56dbcc30dfff7df54d2`


Verification:
- readiness / dry-run / webhook RPCs present
- authenticated execution allowed
- anonymous execution denied
- live telephony adapter count = 0
- live telephony enabled = false
- Security Advisor: no new DB/RLS finding
- existing **Leaked Password Protection Disabled** warning remains
- current unused-index notices are informational on new/low-usage tables

## Platform — Milestone 4A1A — COMPLETE / 4A1B ACTIVE

Completed production-hardening work:
- production security headers in Vercel config:
  - CSP
  - HSTS
  - X-Content-Type-Options
  - X-Frame-Options
  - Referrer-Policy
  - Permissions-Policy
  - Cross-Origin-Opener-Policy
- public website enquiry moved behind hardened Supabase Edge Function
- direct anonymous enquiry INSERT revoked
- anonymous website INSERT policy removed
- server-side enquiry validation
- origin allowlist
- honeypot
- minimum form-age bot check
- request-size limit
- privacy-preserving hashed client / phone fingerprints
- rate limits:
  - 5 attempts / 15 min per client fingerprint
  - 3 attempts / 30 min per phone fingerprint
- 24-hour anti-abuse hash retention + cleanup cron
- cross-module database audit log
- audit triggers on core CRM / billing / service / customer-care tables
- Platform Health & Recovery dashboard
- actual recovery-drill registry; backup is not considered verified until a real drill passes
- production security/recovery runbook
- Admin → Platform Health navigation
- live automated calling remains OFF
- telephony emergency stop remains ON

Release-control work added in 4A1B:
- `platform_release_checklist`
- `platform_uat_runs`
- `platform_uat_steps`
- automated release-check refresh RPC
- release-readiness RPC
- explicit UAT run creation and evidence recording
- dedicated authenticated `/release-readiness` dashboard
- manual UAT items remain Pending until real evidence is recorded
- Admin and Platform Health navigation to Release Readiness

Migration:
- `supabase/migrations/20261007_platform_release_uat_control.sql`

GitHub commits:
- release/UAT control plane: `cdf6f1a6bee2f643504bcfe3f7d9c296253fea32`
- release dashboard: `428563da376f301ea1ef10fb5bde0a623c8a9d9b`
- Admin → Release Readiness: `8a3ee1be6466d0ebffc556fd22725aef0fb3dbaf`
- Platform Health → Release Readiness: `3e756d0e8739091b9976fe7eae991d582142b5aa`


Known external blocker:
- Supabase Auth **Leaked Password Protection Disabled** warning still requires the project Auth setting to be enabled; it cannot be honestly marked fixed from database SQL alone.

## Platform — Milestone 4A2A — COMPLETE

Implemented:
- non-destructive cross-module structural smoke RPC
- required-table verification across CRM / billing / service / technician / customer-care / release-control modules
- required-function verification for technician, customer-care, health and release RPCs
- direct anonymous enquiry INSERT verification
- legacy website anonymous INSERT policy verification
- core RLS presence verification
- referential-integrity smoke checks:
  - quotation items → quotation
  - invoice items → invoice
  - payments → invoice
  - service materials → service job
  - service attachments → service job
- automated-calling safety verification:
  - emergency stop ON
  - live telephony OFF
  - live adapter count = 0
- structural-smoke result is now a blocking automated release-check item
- release-control FK performance indexes added
- production Vercel deployment of structural-smoke commit verified READY

Migration:
- `supabase/migrations/20261007_platform_structural_smoke.sql`

GitHub commit:
- structural release smoke verification: `b922a3d27e09d7dc698195181c4f055218cdd404`

Direct verification:
- required tables present: 21 / 21
- required functions present: 7 / 7
- orphan quotation items: 0
- orphan invoice items: 0
- orphan payments: 0
- orphan service materials: 0
- orphan service attachments: 0
- anonymous direct enquiry INSERT: disabled
- legacy anonymous website insert policy: absent
- live telephony: OFF
- telephony emergency stop: ON
- live telephony adapters: 0
- anonymous execution of structural-smoke RPC: denied
- no real UAT run has been fabricated
- no recovery drill has been fabricated

Security Advisor:
- only current security warning remains **Leaked Password Protection Disabled**
- remediation: Supabase Auth project setting, not a SQL migration

Performance Advisor:
- missing release-control FK indexes resolved
- remaining unused-index notices are informational on new/low-traffic schema

## Immediate next milestone

**Platform — Milestone 4A2B: Real UAT Evidence + Recovery Drill + Release Freeze**

Remaining work that cannot be honestly auto-passed:
- perform an actual recovery/restore drill and record evidence
- enable Supabase leaked-password protection and re-run Security Advisor
- start a real UAT run from `/release-readiness`
- execute and record real evidence for:
  - Enquiry → Customer
  - Quotation → Invoice
  - Payment
  - Service Job → Job Sheet
  - Technician PWA
  - Customer Care
  - AI Voice Sandbox
  - Calling Readiness
  - mobile/responsive regression
- review production security headers on the final live deployment
- when every blocking release check is Pass, approve final Release Freeze
- real automated phone dialing remains OFF and is **not** part of software release approval

## Platform — Milestone 4A2B1 — COMPLETE

Release/UAT evidence integrity hardening:
- a UAT step cannot be marked Pass without a non-empty real evidence reference
- UAT outcomes now synchronize to the corresponding manual release checklist gates
- failed/blocked UAT outcomes fail the mapped release gate
- reset-to-Pending clears mapped release evidence
- blocking N/A UAT steps no longer allow the UAT run to be treated as passed
- a fully passed UAT run records a run-level evidence reference derived from its per-step evidence
- anonymous execution of the UAT update RPC remains denied
- no UAT run or recovery drill was fabricated

Migration:
- `supabase/migrations/20261007_platform_uat_evidence_hardening.sql`

Live Supabase verification:
- migration applied successfully
- `anon` execute on `platform_update_uat_step`: false
- `authenticated` execute: true, with active-admin authorization enforced inside the RPC
- Security Advisor still reports only the existing **Leaked Password Protection Disabled** warning
- real UAT run count remains 0
- real recovery drill count remains 0

### Immediate next milestone

**Platform — Milestone 4A2B2: Admin/session security + production monitoring hardening**

Then continue with real UAT/recovery evidence and final release freeze. Real automated phone calling remains OFF.

## Platform — Milestone 4A2B2 — COMPLETE / VERIFIED

Admin/session and production-monitoring hardening:
- reusable admin session guard added across authenticated admin surfaces
- 30-minute inactivity expiry and 5-minute server-side session/admin revalidation
- inactive/deactivated admin access is revoked from long-lived tabs
- scheduled platform-health snapshots every 15 minutes with 90-day retention
- latest observed health snapshots are healthy
- production deployment for main commit `cf2440a733a1e3c24b7e79031c3d70a7a5599c8b` verified READY
- live production endpoint returned HTTP 200
- live response headers verified: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy and Cross-Origin-Opener-Policy
- no production error/fatal runtime logs were observed in the verified 30-minute window
- configuration recovery rehearsal recorded with real repository/live-state evidence
- live automated calling remains OFF; emergency stop remains ON; live adapter count remains 0

Repository parity:
- `supabase/migrations/20261007_platform_health_snapshot_monitoring.sql`
- PR #2 merged as `1be4477c2c3fa722a678e6bdf053ec6e1a7d260b`
- admin session hardening PR #3 merged as `cf2440a733a1e3c24b7e79031c3d70a7a5599c8b`

Remaining blocking release work:
- Supabase Auth leaked-password protection is still disabled. Supabase documents this as a Pro-plan-or-higher Auth setting; it cannot be changed by SQL and the connected Supabase tooling currently exposes no Auth-config mutation.
- real authenticated end-to-end UAT evidence is still required for all manual UAT gates
- responsive/mobile regression evidence is still required
- final release freeze must remain Pending until all blocking checks pass

No UAT step has been auto-passed or fabricated.

## Release-gate clarification — software release vs real telephony go-live

Verified on production:
- software deployment and telephony provider go-live are separate approval tracks
- real telephony remains disabled
- emergency stop remains enabled
- live telephony adapter count remains zero
- real bilingual speech benchmark count remains zero
- therefore no real-call or speech-quality UAT is claimed as passed

Software release must not silently enable real calling. Provider credentials, provider cost profile, bilingual STT/TTS benchmark selection and explicit telephony UAT remain future telephony go-live gates even after the non-calling software is released.

## Platform — 4A2B3 — RELEASE READINESS AUTOMATION READY

Verified final-pre-UAT state:
- current main baseline before this documentation update: `df0d8595f08afd05c5883a30e43abc6323405146`
- production Vercel deployment for that exact SHA: READY
- Production Route Smoke for that exact SHA: PASS
- open pull requests observed: 0
- recent production runtime error clusters observed: 0
- recent production error/fatal/warning logs observed: 0
- scheduled Supabase health snapshots continue every 15 minutes and latest observed snapshots are healthy
- failed outbox: 0
- open dead letters: 0
- unlinked mobile technicians: 0
- real telephony remains OFF
- telephony emergency stop remains ON
- live adapter count remains 0

Authenticated UAT automation:
- `tools/authenticated-uat.mjs`
- `.github/workflows/authenticated-production-uat.yml`
- `docs/AUTHENTICATED_PRODUCTION_UAT.md`
- real Chromium production login and protected-route smoke is ready
- credentials are accepted only from GitHub Actions secrets `UAT_ADMIN_EMAIL` and `UAT_ADMIN_PASSWORD`
- credentials are not committed
- this smoke must not be treated as business-flow UAT evidence by itself

Admin login/session regression:
- login surface intentionally uses `allowAnonymous: true`
- unauthenticated users can reach the login form without a redirect loop
- authenticated/inactive/idle session enforcement remains active after login
- fix baseline: `fce4b0c7b775953092831b0e24cc17135c4fe85f`

Release checklist remains evidence-driven:
- automated/verified checks currently Pass: 7
- manual/external checks currently Pending: 11
- Fail: 0
- do not mark a pending UAT gate Pass without real evidence
- final `release_freeze` remains Pending until every applicable blocking software-release gate is resolved

Remaining external/manual blockers:
1. real authenticated business-flow UAT evidence
2. mobile/responsive rendered regression evidence
3. Supabase Auth leaked-password protection warning (plan/config dependent)
4. final release freeze after blockers resolve

No fake customer/business data was inserted to manufacture UAT evidence. Real automated calling remains OFF and is a separate future go-live track.
