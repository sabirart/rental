# Audit response – requirement-by-requirement

Sources: **Report 1** (source-level audit, findings F-01…F-12) and **Report 2** (runtime audit, C-01, H-01…H-06, M-01…M-15, L-01…L-10).
Status: ✅ done and covered by an automated test · 🟡 partly done (what remains is stated) · ⬜ not done.
Test files are in `backend/tests/`.

## Critical / High
| ID | Status | What was done |
|---|---|---|
| C-01 payment amount/status ignored | ✅ | Server stores the validated `amountPaid` (0 ≤ x ≤ total), derives status from it; status-only clients handled; omitted flags fail **closed**; stale comment removed. `business.test.js` |
| F-01 deletion by folder name | ✅ | Folders/files are stamped with `appProperties` ownership markers; legacy folders adopted once; deletion acts only on tracked IDs, trashes by default (recoverable), skips and reports foreign files, keeps folders that still hold foreign files; preview endpoint + preview text in the delete dialog; look-alike folder fixtures tested. `storage.test.js` |
| F-02 / H-04 concurrency & storage | 🟡 | Per-user lock + Drive `version` pre-condition + automatic retry on fresh data (competing-writer test); folder/file id and parsed-file cache (repeat read = 1 metadata call, was 3); daily snapshot folded into the same write. **Remaining:** Drive has no atomic compare-and-swap, so a very small check→write window exists; run **one instance**. Images/documents are still inside the JSON file and the canonical store is still Drive (moving to a database/separate files is a larger redesign). |
| F-03 / M-02 import validation | ✅ | `services/backupSchema.js`: allow-listed fields, types/ranges, ids, duplicates, relationships, image/document data-URI checks, size/count caps; preview (`?preview=1`) → pre-import snapshot → replace. Same validator for restore and legacy migration. `backup.test.js` |
| H-01 GET writes / 400 on parallel loads | ✅ | GETs are read-only; idempotent single-write `POST /payments/rollover`; client `loadData` is single-flight with one follow-up. |
| H-02 zero rows shown "Paid" | ✅ | New `unbilled` status; placeholders are prefilled with last/room rent; counted correctly in stats; UI badge. |
| H-03 inactive tenant keeps room | ✅ | Room assignment lives only in `Tenant` model and is status-aware; inactive tenants can be edited after the room is re-let; re-activation into an occupied room is refused. |
| H-05 destructive paths without snapshot | ✅ | Restore, import, reset, clear-all and `payments/clear` snapshot first; `payments/clear` needs `confirm=yes`; "Clear all data" is one atomic server call. |
| H-06 no tests/CI/lockfile | 🟡 | 114 tests, `npm test`, `package-lock.json`, `npm ci` in render.yaml, `lint:syntax`. **Not included:** a hosted CI workflow (depends on your Git host) – run `npm test` + `npm run lint:syntax` in CI. |

## Medium
| ID | Status | Notes |
|---|---|---|
| M-01 PII cache after sign-out | ✅ | Caches cleared on logout/clear, scoped to the account (`cache_owner`), images/document bodies never cached. |
| F-05 / M-03 CSP | 🟡 | `script-src 'self'` (no inline), `script-src-attr 'none'`, no third-party hosts, Font Awesome self-hosted (no SRI needed). **Remaining:** `style-src 'unsafe-inline'` (≈120 inline style attributes); `innerHTML` templates remain – values go through the now attribute-safe `escapeHTML`, but a sink-by-sink audit of all ~70 assignments was not performed. |
| M-04 session lifecycle | 🟡 | Public logout always clears cookies; session ids revocable on logout; refresh token encrypted (AES-256-GCM); Origin/`Sec-Fetch-Site` CSRF guard. **Remaining:** revocation list is in memory (lost on restart); no double-submit CSRF token. |
| F-04 / L-03 schemaVersion | ✅ | One constant, migrate-on-read, never downgraded; newer files refused. |
| M-05 / F-09 errors | ✅ | Unknown → 500 with generic text + correlation id; Google 401/403/429 mapped; model messages are typed `AppError`s; stacks only for 5xx. |
| M-06 client ids | ✅ | Ids generated server-side (`crypto.randomUUID`). |
| M-07 double encoding | ✅ | `.escape()` removed; output escaping only. (Existing already-encoded values are not rewritten.) |
| M-08 middle-room removal | ✅ | Validation by real room numbers; `total_rooms` = highest number, `room_count` separate. |
| M-09 / F-10 bounds & uploads | ✅ | Money ≤ 1e9, `days` 1–3650, image/document data-URI allow-list and size/count caps, friendly 413. |
| M-10 backup retention | ✅ | Newest 30 kept (`MAX_BACKUPS`), paginated listing. |
| M-11 accessibility | 🟡 | Labels, skip link, global `:focus-visible`, `prefers-reduced-motion`, dialog focus move/trap/restore (`a11y.js`). **Not measured:** colour contrast, screen-reader behaviour, real devices. |
| M-12 / F-11 frontend structure | ⬜ | Not refactored (no bundler/ES modules); duplicate/dead code removed where found. |
| M-13 static delivery | 🟡 | gzip compression, ETag revalidation for HTML/JS/CSS, 7-day caching for images/fonts, meta no-store removed. Not minified/bundled. |
| M-14 export omits recycle bin | ✅ | UI export uses the server export; one import path with preview. |
| M-15 reset day | ✅ | Rollover and "current period" (server and UI) honour `monthly_reset_day`; default 31 = calendar month. |
| F-07 / L-01 legacy code | ✅ | Unused SQL models, DB stubs, migrations README removed; migration kept (validated, TLS verified by default). |
| F-08 tests | ✅ | See above. |
| F-12 | 🟡 | See M-11. |

## Low
L-02 ✅ comments/docs rewritten (README) · L-04 ✅ shared id util · L-05 ✅ drive-status route fixed (tested) · L-06 ✅ console debug logs and echoed values removed · L-07 🟡 Node pinned, one CORS variable documented, `/api/ready` added; **free plan left** (change it yourself for production) · L-08 🟡 `googleapis` 144→185 (`npm audit`: 0 vulnerabilities); Express 5 / helmet 8 / rate-limit 8 / dotenv 18 majors **not** upgraded, Dependabot not configured · L-09 ✅ demo PNGs 1.6 MB→0.57 MB, `dashboard.html` stub removed (server still maps the URL) · L-10 ✅ dead hook removed.

Other defects found and fixed while testing: editing a room's name/rent wiped its tenant link; tenant edits that omitted photo/documents erased them; POST/PUT/DELETE were auto-retried after a network error (risk of duplicates); `/api/payments/rollover` race; demo mode failed to load rooms; Font Awesome v4-compat font was referenced but not shipped; receipts printed via inline `onload` (blocked by the new CSP).

## Not implemented from "missing features" (Report 2 §7)
Payment audit trail, server-side search/pagination, restore preview of a *Drive snapshot* (import has a preview).

## Verification summary
**Verified by execution:** 114 automated tests pass (`npm test`) – API, validation, account isolation, payments/rollover, rooms/tenants, recycle bin, storage/concurrency/caching, backups/retention/restore, account-deletion boundary, OAuth callback/refresh (Google endpoints mocked), error mapping, import validation (13 malicious/malformed backup cases plus preview, orphan, legacy-format and round-trip tests), frontend CSP-readiness, escaping, accessibility contracts, and a jsdom boot of the real served site in demo mode through every view; `node --check` on all 67 JS files; clean `npm ci --omit=dev` install; production-mode server started and probed over HTTP (health, readiness, CSP header, caching, auth 401); `npm audit --omit=dev` = 0.
**Not verified (needs your environment):** real Google OAuth consent / token refresh / Drive quotas and latency (Drive is simulated by an in-memory fake that mimics the API shape); real browsers, mobile devices, responsive layout and visual rendering (jsdom has no layout engine); screen readers; load testing; the upgraded `googleapis` 185 against live Drive (only API-surface and mocked flows were exercised); legacy PostgreSQL migration against a real database (mocked `pg`).
