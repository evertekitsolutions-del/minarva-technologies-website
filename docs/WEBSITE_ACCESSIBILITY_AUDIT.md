# Website accessibility verification

Run a real Chromium + axe-core WCAG 2.1 A/AA check on the public website at
390px mobile and 1440px desktop across the homepage, seven services,
support, privacy, terms, and bilingual guided assistant.

- Test source: `tools/public-accessibility-audit.mjs`
- CI: `.github/workflows/public-accessibility-audit.yml`
- Test is isolated to local static source. External CDNs, Supabase and business
  APIs are blocked; no enquiries, transactions or customer records are created.
- Fail on any axe-core WCAG 2.1 A/AA violation.
- Automated checks cannot replace keyboard-only user tests, actual screen
  readers, assistive technology, accessible content review, or authenticated
  pages/real-business workflow UAT.
- Do not claim WCAG certification from this smoke test.
