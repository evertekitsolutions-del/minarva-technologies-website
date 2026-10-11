# Minarva Technologies website imagery

Website-only asset set. This repository is NOT Minarva Biz.

Six optimized WebP files live under `assets/site/`:
- `hero.webp`: integrated security, solar, IT and home/office photography
- `cctv.webp`: CCTV installation
- `it.webp`: computer and networking support
- `solar.webp`: solar panels and inverter backup
- `automation.webp`: home automation
- `software.webp`: customized software and web development

These are AI-generated **illustrative** visual assets, not documentary photographs of actual customer projects. They have no overlaid advertisement text/prices. The official Minarva logo is preserved and is not replaced by any generated logo. All images are under 200 KB each, served from the same site, and have descriptive alt text.

The website source formerly referenced three advertisement JPEGs in a CloudFront folder. Those are no longer used. Hero's fictitious "Systems Online" dashboard has been replaced by a representative photo.

Verification: `node tools/website-image-integrity.mjs` plus Production Route Smoke, Public Browser Runtime Smoke, and review of live `/assets/site/*.webp` responses after deployment.
