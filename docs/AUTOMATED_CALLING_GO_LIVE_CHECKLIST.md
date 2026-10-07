# Automated Calling — Production Go-Live Checklist

This checklist is deliberately conservative. Passing the code milestones does **not** enable real phone dialing.

## Hard blockers

- [ ] Real Malayalam + English STT benchmark evidence recorded.
- [ ] Primary STT selected through the benchmark evidence gate.
- [ ] Real Malayalam + English TTS quality evidence recorded.
- [ ] Primary TTS selected through the benchmark evidence gate.
- [ ] Exact speech model / voice licenses approved for commercial use.
- [ ] Real telephony provider selected.
- [ ] Provider contract, pricing, billing increment and taxes recorded.
- [ ] Provider API credentials stored only in server-side secrets.
- [ ] Provider webhook signature/authentication implemented.
- [ ] Webhook replay/idempotency UAT passed.
- [ ] Call consent and Do Not Call audit reviewed.
- [ ] Duplicate/invalid/review phone numbers excluded from outbound campaigns.
- [ ] Quiet-hours/timezone behavior verified.
- [ ] No-answer retry policy verified.
- [ ] Busy retry policy verified.
- [ ] Voicemail behavior verified.
- [ ] Callback scheduling verified.
- [ ] Customer opt-out immediately blocks future automated calls.
- [ ] Human escalation verified.
- [ ] Wrong-number outcome suppresses future automated calling until data correction.
- [ ] Invoice “already paid” outcome does not silently change accounting.
- [ ] Per-call duration and cost accounting reconciles with provider records.
- [ ] Daily/weekly call-volume caps defined before scale-up.
- [ ] Emergency stop tested.
- [ ] Supabase leaked-password protection enabled before final production sign-off.
- [ ] Full end-to-end UAT completed.
- [ ] Explicit owner approval recorded before turning Live Telephony ON.

## Release rule

Real dialing remains OFF until every blocking item above is reviewed and an explicit go-live decision is made. No code milestone alone is permission to contact customers automatically.
