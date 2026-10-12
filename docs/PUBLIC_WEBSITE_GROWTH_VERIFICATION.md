# Minarva Technologies public website: SEO and verification

**Correct project:** `evertekitsolutions-del/minarva-technologies-website`. Not Minarva Biz.

Production entry: https://www.minarvatechnologies.com/

## Already built and verifiable
- Seven dedicated service pages at `/services/{slug}`.
- Enquiries reuse `public-enquiry-submit`, with existing Supabase origin allowlist, honeypot and rate limiting.
- Contact preference date is a *request*, not a confirmed booking.
- `/support` offers human support, never public private-job lookup.
- `/assistant` is a privacy-preserving deterministic guide, **not** an AI model.
- `/privacy`, `/terms`, `/robots.txt` and `/sitemap.xml`.
- Local Chromium regression `tools/public-site-browser-qa.mjs` checks all public routes on desktop and mobile, without submitting records.
- Hero and service photography is illustrative, not a portfolio of actual customer work.
- Existing admin, invoice, service and technician modules remain separate and protected.

## Google Search Console: owner action required
1. Open https://search.google.com/search-console/welcome and sign in with the authorized Google account.
2. Add `https://www.minarvatechnologies.com/` as a **URL-prefix** property. If the custom domain is already verified through Google Domains/Workspace, Google may offer an automatic verification path.
3. Follow the *exact* ownership method Google provides. Do not delete existing Squarespace DNS records, Workspace MX/SPF/DKIM/DMARC, or change nameservers.
4. Submit sitemap: `https://www.minarvatechnologies.com/sitemap.xml`.
5. Use URL inspection for the homepage and all seven service routes. Record actual indexed/not-indexed outcomes and fix causes; do not claim instant rankings.

## Google Business Profile: owner action required
Open https://business.google.com/ and confirm ownership of the actual Minarva Technologies profile. Add the verified website, real service area and genuine business details. Do not fabricate physical premises, opening hours or customer reviews.

## Analytics and privacy
Do not inject tracking pixels or Google Analytics without verifying ownership, configuration, applicable consent requirements and ongoing free-tier suitability. No pageview or conversion-count result has been claimed. Measure before implementing performance thresholds.

## Portfolio, customer review and real AI blockers
- Public customer project gallery: wait for actual project photos and permission from project owners.
- Reviews: use verifiable customer-provided feedback, never generated testimonials.
- AI assistant: the existing voice sandbox is not a production-ready public LLM. Keep real phone calls OFF. A real web AI service requires verified budget, privacy, abuse protection, model choice and data-handling approval before rollout.
- Customer job tracking must require real customer authorization and server-side permission checks. Do not expose records by reference number or phone number alone.
- Final live authenticated UAT and business data flows remain evidence-dependent.

## Public enquiry live API negative smoke

The `tools/live-public-enquiry-negative-smoke.mjs` workflow makes only deliberately invalid requests to the public Edge endpoint: consent omitted, explicit false consent, invalid name with consent, and disallowed origin. It asserts HTTP status and the specific rejection reason. Names and phone numbers are empty in every request, so no customer/enquiry record can be created even if consent enforcement regresses. It uses the existing frontend **publishable** key, never privileged secrets, and runs in GitHub Actions.

This is a production *negative-path* test, not an authenticated UAT run, nor proof that a valid live lead would be recorded successfully. A production network outage causes a test failure rather than a fabricated PASS.
