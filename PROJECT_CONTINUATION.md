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

## Immediate next milestone

**Operations — Milestone 3A2: Job Sheet / Visit Execution**

Add the next service-operation layer:
- professional service job-sheet detail view
- A4 job-sheet Print / Save PDF
- technician visit start / arrival / work-start / work-complete timestamps
- diagnosis / work-performed
- parts/materials used
- service charge + parts actual amounts
- customer acknowledgement / signature foundation
- before/after photo attachment foundation
- resolution / unresolved reason
- next visit / callback requirement
- completion checklist
- warranty / AMC reference foundation
- convert completed service work to billing/invoice preparation without retyping

Keep full technician mobile/PWA workflow and advanced route/schedule optimization for later milestones.
