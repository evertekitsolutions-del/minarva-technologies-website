# STORE-027 — Kerala CCTV ad-to-quotation landing

The real launch goal is to convert social-media ad interest into verified CCTV package enquiries, without pretending merchant payments, stock, or shipping are already active.

We use the existing Next.js 16 + Medusa 2.22 OSS storefront; no WooCommerce, no new lead SaaS, no paid AI or SMS/WhatsApp API.

## What is implemented

- Mobile-friendly bilingual landing at **`/{countryCode}/cctv-quote`**, only available when the region is **India (`in`) / INR**, as initialized in approved staging by STORE-025.
- Basic requirement selector: home/shop/office/warehouse/other, 2/4/8/16/not-sure cameras, installation required/not-required/need-advice, Kerala delivery PIN.
- Validates PIN as a six-digit numeric code starting 1–9; **format acceptance is not courier serviceability**. No carrier quote, shipping charge or ETA is invented.
- Builds a WhatsApp **draft** with the prospect's chosen needs, asks for real price/stock/BOM/warranty/installation/final freight; customer reviews and sends it. The app does not auto-send messages.
- Allows only a small allowlisted `utm_source` campaign value (instagram/facebook/google/whatsapp/direct) to be included as an **optional** text channel in that voluntarily-sent message. No cookies, backend analytics, device fingerprinting or invisible personal-data capture.
- Adds "Get a Verified CCTV Quote" CTA to the existing homepage. Existing product lists, FAQ widget and package-specific quote link remain intact.
- Does NOT create a CRM record, invoice/order, courier booking, payment session, shipping estimate, or capture customer contact data.

## Example marketing URLs (only AFTER deployment and domain approval)

```text
https://store.minarvatechnologies.com/in/cctv-quote?utm_source=instagram
https://store.minarvatechnologies.com/in/cctv-quote?utm_source=facebook
https://store.minarvatechnologies.com/in/cctv-quote?utm_source=google
```

**These are target URLs, not links confirmed live.** Customer enquiries only enter the business if the customer explicitly sends the WhatsApp message. Until a privacy-reviewed CRM integration exists, the funnel must not claim automatic lead capture or conversion.

## Needed next

1. Verify the existing Minarva Technologies website CRM enquiry API and its consent/deduplication rules; reuse it rather than inventing a second contact database.
2. Get actual approved products and measured kit weights/photos, pricing, warranties, installation terms; show only verified offers.
3. Validate real Cashfree merchant sandbox lifecycle and Shiprocket all-in freight/residual COD contract before enabling checkout.
4. Host Medusa Node + Postgres + Redis and Next storefront within the agreed no-surprise-cost policy; test DNS and customer devices; approve production launch separately.

A conversion workflow can reduce friction but cannot guarantee that all ad leads will buy.
