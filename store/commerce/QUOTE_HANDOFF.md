# STORE-026 — CCTV-package-specific quotation handoff

The user can voluntarily click a "Ask for confirmed package quote" link on the existing Medusa product detail page. This opens WhatsApp to Minarva Technologies at +91 6235353732 with a prefilled **customer-originated** enquiry including the real product title, catalogue handle and chosen variant SKU (when available).

The message asks for exact kit components, verified latest INR price and stock, camera/recorder warranties, installation charges, and measured PIN-based final courier rate. It states that customer checkout and courier booking are currently unavailable, rather than making false offer promises.

The helper uses only known Medusa Product fields, strips control characters and caps lengths, and URL-encodes the entire text. No user phone, location, chat transcript or consent is harvested or saved. It **does not send any message**; the customer can edit or discard the WhatsApp draft. No WhatsApp Business API, mass outreach, paid AI inference, automated sales or courier booking is activated.

This helps prospective leads contact the team before commercial online payments are approved. A future automated conversion funnel requires approved CRM lead capture, privacy/consent and merchant stock/price/courier confirmation; do not conflate voluntary enquiry links with a fully automated conversion agent.
