# Rental Manager — Production Readiness

This document separates code changes from checks that require a deployed Google account, database, or real browser. Automated tests do not by themselves prove that the live service is production-ready.

## Implemented in this update

- Session revocation is stored in the canonical account data and, when `DATABASE_URL` is configured, a SHA-256 hash of the session ID is also stored in PostgreSQL and checked during authentication. If a configured PostgreSQL revocation store cannot be checked, authentication fails closed with `503`.
- Schema version 4 explicitly covers the payment audit and session-revocation arrays. Migration adds missing arrays without dropping existing tenant/property/payment records.
- Owner profile photo updates accept supported raster data URLs or HTTPS Google profile-image URLs only. Profile-image rendering uses an allow-list in tenant, payment, settings, mobile, and owner-profile views.
- Document preview and download links accept only supported raster-image/PDF data URLs and the app's demo plain-text URL. Unsupported document sources are shown as unavailable.
- When PostgreSQL is configured, per-account advisory locks coordinate cooperating app instances. `/api/ready` warns in production when `DATABASE_URL` is absent; setting `REQUIRE_DISTRIBUTED_LOCK=true` makes readiness fail without it.
- The payment audit trail, account-scoped audit API, CI workflow, backup/import validation, and existing source-level checks from the previous update remain included.

## Still requires deployment or real-browser verification

### Authentication and Google integration

- [ ] Verify Google OAuth consent/callback and refresh-token renewal on the deployed domain with a dedicated test account.
- [ ] Verify durable logout revocation across a real process restart, both with PostgreSQL configured and when Drive is temporarily unavailable.
- [ ] Keep `JWT_SECRET` stable and private; use a strong secret of at least 32 characters.
- [ ] Confirm production CSRF/CORS origins match the deployed domain exactly.

### Data consistency and recovery

- [ ] For production, configure a reachable PostgreSQL `DATABASE_URL` on every instance. PostgreSQL is the canonical account-data store when configured; first access imports existing Google Drive JSON once and keeps the source file. Set `REQUIRE_DISTRIBUTED_LOCK=true` in production after provisioning PostgreSQL so readiness fails closed if it is missing.
- [x] Added a PostgreSQL JSONB primary account-data store when `DATABASE_URL` is configured. Existing Drive JSON is imported once per account using `INSERT ... ON CONFLICT DO NOTHING`; the source file is retained. Per-account PostgreSQL advisory locks serialize mutations across cooperating instances, and database failures fail closed instead of falling back to stale Drive data. [ ] Still verify this migration and recovery flow against a real non-production PostgreSQL instance before production rollout.
- [ ] Test two browser sessions editing the same account with PostgreSQL enabled and inspect conflict/retry behavior on the live service.
- [ ] Verify the first-use Drive-to-PostgreSQL import on a copied test account before enabling it for real accounts.
- [ ] Test restore from a real Google Drive snapshot, imports, recycle-bin restore, and account deletion with non-production data.
- [ ] Test representative data volumes and large image/document uploads.

### Security and accessibility

- [ ] Image/document URL sinks are tightened and regression tests added, but a complete sink-by-sink review of every frontend `innerHTML` assignment has **not** been completed. Continue reviewing each dynamic HTML sink and prefer DOM text APIs for untrusted values.
- [ ] CSP still permits inline styles. Move inline style attributes to CSS classes before removing `unsafe-inline` from `style-src`.
- [ ] Test keyboard-only navigation, focus management, screen-reader labels, reduced motion, contrast, and responsive layouts in real Chrome/Firefox and iOS/Android browsers with accessibility tooling. jsdom tests cannot measure visual contrast or actual layout.
- [ ] Run a dependency review and an authorized security assessment before a public launch.

### Business and payment verification

- [x] Added automated regression coverage for money rounding, payment status/received-amount rules, duplicate periods, rollover idempotency, and outstanding-balance carry-forward calculation.
- [ ] Reconcile dashboard totals, payment history, and exported receipts against hand-calculated examples in a deployed browser, including unchecked charges, corrections, and deletions.
- [ ] Verify audit history after restore/import and under concurrent edits on a real account.

## Verification status for this package

- JavaScript syntax checks: **passed** for 73 JavaScript files.
- Standalone safe-image/document URL cases: **passed** for six unsafe/safe inputs.
- Schema smoke check: **passed** for migrating a v3 document to v4 while preserving an existing property and initializing operational logs.
- Full Jest suite: **not run in this environment** because dependency installation timed out and Jest/runtime dependencies were unavailable in the active workspace. New regression tests are included but not execution-verified here.
- Live Google OAuth/Drive, deployed PostgreSQL, real-browser/mobile/accessibility, load, and recovery checks: **not run**.

Do not describe the live service as fully production-verified until the environment-dependent checks above are completed.
