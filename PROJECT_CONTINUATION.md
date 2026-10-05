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

Latest known website/admin commit before this continuation document:
`c369cfade73947b4a64f7d4c66baf3cf2a8bc764`

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

## Immediate next milestone

**Billing Foundation — Milestone 1**

Create secure Supabase schema for:
- business billing settings
- customers
- catalogue items/services
- quotations
- quotation items

The customer foundation must already be **voice-ready** for future automatic calling, including:
- preferred_language
- preferred_contact_channel
- call_consent
- call_consent_at
- call_consent_source
- do_not_call

Requirements:
- RLS from day one
- Admin-only management
- GST fields optional
- No fake production data
- Existing enquiries remain untouched
- Design conversion path from enquiry → customer → quotation
- Run security/performance advisors after migration

After this milestone is verified, add the first Billing/Quotations section to the existing admin UI.
