# Minarva CCTV Store — independent Cloudflare visual preview

Purpose: the owner wants to **open a mobile preview now**, before paying for a permanent Medusa 2.22 Node + PostgreSQL + Redis runtime. This is a single-file, accessible and responsive **visual layout preview** (not the actual deployed Next.js/Medusa app).

- Source: `store/preview/cloudflare-worker.mjs`; test: `store/tests/cloudflare-preview.test.mjs`
- Dedicated Workers staging address: `https://minarva-cctv-store-preview.anilalbert7.workers.dev/in` (only cite this as live once verified via HTTP).
- Layouts: branded hero, 2/4/8-camera illustrative cards, Malayalam and English labels, site/PIN/camera-count quotation form, self-initiated WhatsApp draft, service support, FAQ, contact and disabled cart.
- ALL displayed camera cards are clearly labeled *illustrative category layouts*, with NO genuine price, inventory, GST, real kit photo or courier-rate claims.
- No Cloudflare paid AI / KV / D1 / Durable Objects / analytics / cron / storage bindings; GET/HEAD-only static HTML, no database API, all other paths 404, strict Content Security Policy / noindex. Zero payment/courier booking.
- No production DNS change, existing Minarva Biz Worker modification, website Vercel project modification or CRM schema change. The preview is separate and can be deleted independently.

**Crucial limitation:** An independent static visual mock is NOT the production Next.js storefront. To preview the real interactive Medusa catalogue and admin/checkout requires a persistent isolated backend and approved products/regions; do not link a free static preview to live merchant payments. The URL is NOT `store.minarvatechnologies.com`.

Test with:
```bash
node --test store/tests/cloudflare-preview.test.mjs
```

Deploy workflow: review commit + CI before push, then upload the unchanged reviewed module to a *dedicated* Cloudflare Worker and enable `workers.dev` on that script. Confirm real HTTPS status and content before sharing link.
