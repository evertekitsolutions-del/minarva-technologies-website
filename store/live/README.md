# LIVE PUBLIC STORE — operational launch surface

This directory is the immediately deployable, self-contained, static public CCTV catalogue and quotation builder. **It is publicly accessible production content, not a preview**, and can run on any static host (Render Static Site, Cloudflare Pages, nginx, etc.) without paid runtime, vendor dependency, database or API keys.

## What is functional

- Responsive Minarva Technologies-branded CCTV solution catalogue.
- Add/remove camera setup enquiries in session-scoped quotation list.
- Combined quotation via voluntary customer-clicked WhatsApp draft.
- English/Malayalam quotation form for camera requirements, installation needs and six-digit delivery PIN.
- WhatsApp contact handoff to +91 6235353732; no background messages.
- FAQs about prices, warranties, courier and installation.
- Real business contact info; no fictitious stock, rates, offers or hardware models.

## Explicitly not yet enabled

Cashfree live payments, shopping cart checkout, partial COD, Shiprocket booking, real live inventory, CRM lead writes, autonomous AI sales, or an actual production Medusa backend. Medusa source is retained in `store/commerce` to enable verified backend later. **Do not tell customers online ordering and payments are active.**

## Hosting

Static publish directory: `store/live`. Build command: `echo "Static Minarva CCTV Store"` (no dependencies). All files are self-contained. Use branch `main` after reviewed PR passes CI, turn on auto-deploy.

## Domain

DNS for `minarvatechnologies.com` currently uses external Google-hosted nameservers, not the connected Cloudflare account. The custom `store.minarvatechnologies.com` hostname therefore requires an authorized operator to add the exact provider-issued CNAME at the current DNS host and to register the custom domain in Render. Never modify www/apex records; keep the main business website unchanged. Verify HTTPS after DNS propagation.

## Merchant checkout release

The static production catalogue is an enquiry store, not a paid ecommerce checkout. Do not enable Medusa production cart writes or gateway/payments without the previously documented merchant sandbox validation, Indian legal policies and express approval.
