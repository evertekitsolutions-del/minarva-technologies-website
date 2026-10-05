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

## Immediate next milestone

**Billing Foundation — Milestone 2C1: Product / Service Catalogue UI**

Add secure catalogue management:
- list/search catalogue items
- create/edit Product or Service
- SKU
- HSN/SAC
- unit
- unit price
- GST/tax rate
- active/inactive status
- fast reuse of the standardized Minarva service categories
- prepare catalogue selection for quotation line items

Keep quotation creation for the following small milestone after Catalogue UI is completed and verified.
