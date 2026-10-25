# STORE-029 — Approved product → consented Minarva CRM enquiry

This reuses **both** existing pieces: Medusa's published, merchant-approved product catalogue from STORE-020/024/025 and the original Minarva Technologies CRM's consent/rate-limited `public-enquiry-submit` Supabase Edge API introduced to the store in STORE-028/PR #80.

A customer viewing a genuine approved CCTV product can choose "Request this package through Minarva CRM" without calling checkout. This opens the existing `/in/cctv-quote` landing with **only** a product handle and selected variant ID in the URL—no customer PII, price or stock.

The quote page **re-resolves the product on the server** through Medusa's approved `listProducts` filter; it accepts an exact matching product handle and a variant that belongs to that product. Manipulated or unknown product/variant parameters are ignored. It passes a limited title, handle and SKU to the existing optional CRM consent form and voluntary WhatsApp draft.

The CRM enquiry stores *only* a customer-submitted enquiry message referring to that selected SKU and the customer's manually entered contact details **after explicit contact-only consent and manual submission**. The existing Supabase Edge function retains its origin allowlist, anti-bot honeypot, timing/rate limits and admin-managed enquiry database. This PR does NOT add any public table permissions, service-role key, new tables, migrations or automatic follow-up.

No verified merchant stock, live INR product price, delivery charge or warranty is copied from URL parameters or presented as an accepted transaction. Customer checkout and payments stay disabled.

## How to verify after an approved staging deployment

Open an approved, published Medusa product in an isolated India INR staging region, choose a variant, then click "Request this package through Minarva CRM". Confirm the quote page displays exactly that approved product/SKU. Test invalid URL handles and variant IDs—they must not forge package details. Try the optional contact form with consent unchecked—it must not contact the Edge API. With a separately approved publishable key, test a synthetic consented enquiry in an isolated UAT environment, verify it appears once in the existing CRM, and confirm no unsolicited outbound WhatsApp or phone call occurs.

This code is not deployed or certified against the real merchant Edge API in this PR.
