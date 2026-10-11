# Rental Manager — Follow-up update

## Changes in this package

1. Added PostgreSQL as the canonical account-data store when `DATABASE_URL` is configured. The server creates a per-account JSONB table, imports the existing Drive JSON once without overwriting an existing PostgreSQL row, and serializes mutations with per-account PostgreSQL advisory locks. If PostgreSQL is configured but unavailable, reads/writes fail closed. Without `DATABASE_URL`, legacy Drive JSON mode remains for single-instance deployments.
2. Added `safeImageSource()` and `safeDocumentSource()` URL allow-lists. Applied them to tenant list/detail/edit views, payment views, settings, mobile account UI, owner-profile UI, and document preview/download links.
3. Added backend validation for owner profile image updates: supported raster data URLs and HTTPS Google profile-image URLs are accepted; arbitrary external hosts and SVG data URLs are rejected.
4. Added optional PostgreSQL session revocation storage using SHA-256 hashes of session IDs. The auth middleware checks this shared store when `DATABASE_URL` is configured and fails closed if the configured store cannot be checked. Drive persistence remains a second revocation path.
5. Corrected the schema version to v4 and added a migration regression test that verifies existing records are retained while payment audit and session-revocation arrays are initialized.
6. Enhanced `/api/ready` with a warning when production has no shared PostgreSQL store. Set `REQUIRE_DISTRIBUTED_LOCK=true` to fail readiness without `DATABASE_URL`.
7. Updated the production readiness guide and deployment notes to clearly separate implemented changes from work requiring a real deployment/browser.
8. Preserved the existing UI and the previous package's payment audit implementation, CI workflow, validation, and business logic changes.

## Checks actually performed

- `node scripts/check-syntax.js`: passed after all edits (71 JavaScript files, zero syntax errors).
- Standalone runtime checks passed for six safe-image/document URL cases (reject JavaScript/SVG/HTML sources; accept PNG, PDF, and the app's demo text URL).
- Schema migration smoke check passed: a v3 document migrated to v4, kept its existing property, and initialized both operational-log arrays.
- Full Jest suite: **not run**. Dependency installation timed out and Jest plus runtime dependencies are unavailable in the active workspace. New API/frontend regression tests are included but have not been executed here.
- Live Google OAuth/Drive, deployed PostgreSQL locking/revocation, full frontend XSS review, real mobile/accessibility, and production recovery tests: not run.

## Architecture and rollout limitation

With `DATABASE_URL`, PostgreSQL is the canonical store for tenant, property, room, payment, settings, recycle-bin, payment-audit, and session-revocation data; Google Drive is retained as the one-time import source and backup destination. Without `DATABASE_URL`, the legacy Drive JSON store remains active and must run as one application instance. The primary-store migration has passed syntax checks but still needs verification against a real PostgreSQL instance and a copied Google Drive account before it should be treated as production-verified.

## Additional changes in this delivery

- PostgreSQL now stores each account's complete application data as a JSONB record when `DATABASE_URL` is configured. The first access imports the existing Drive JSON only when no PostgreSQL record exists; subsequent app reads/writes use PostgreSQL. Drive snapshots remain the recovery layer.
- Per-account PostgreSQL advisory locks now wrap the complete mutation path. A configured but unavailable database returns a service-unavailable error rather than falling back to potentially stale Drive data. `/api/ready` checks configured PostgreSQL availability.
- Monthly rollover now carries forward the most recent earlier payment's outstanding balance as `previous_dues`; the calculation clamps invalid/overpaid balances and is covered by unit/regression tests.
- Receipt calculations now treat a recorded `amount_paid` as authoritative instead of replacing it with the total merely because a legacy status says `paid`.
- Added `.env.example`, corrected the README schema version to v4, and documented the PostgreSQL migration and production rollout steps.

## Verification after these additional changes

- `node scripts/check-syntax.js`: passed, 73 JavaScript files, zero syntax errors.
- `node --check` on the changed backend files and new tests: passed.
- Standalone payment arithmetic smoke checks: passed for money rounding, statuses, outstanding balances, and prior-period due calculations.
- Full Jest/API suite and actual PostgreSQL/Google Drive integration: not verified in this environment. Dependency installation did not complete, and no live PostgreSQL or Google OAuth test environment was available. Do not skip the deployment checklist before enabling PostgreSQL for real accounts.


## Google login session follow-up fix (2026-10-11)
- Fixed OAuth return handling so an old demo-mode browser session cannot skip the real server session check after Google sign-in.
- Cleared the demo-mode flag when returning from the Google OAuth callback.
- Bumped the site-controller cache version so browsers fetch the corrected script.
- This patch does not change database settings or disable certificate verification.
