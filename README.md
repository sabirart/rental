# Rental Manager

Property, tenant and rent-payment manager. Express API + vanilla-JS single-page frontend served by the same
service. Sign-in is Google OAuth only; each landlord's data is one JSON document in **their own Google Drive**
(least-privilege `drive.file` scope).

## Run locally
```bash
cd backend
cp .env.example .env      # fill in Google OAuth credentials and a 32+ char JWT_SECRET
npm ci
npm start                 # http://localhost:5000
npm test                  # 114 tests (API, storage, OAuth, import validation, frontend/jsdom)
npm run lint:syntax       # node --check on every backend + frontend .js file
```
The landing page has a **demo mode** (sample data, no sign-in) that needs no configuration.

## Architecture
| Layer | Notes |
|---|---|
| Frontend `frontend/` | Static HTML/CSS/JS, no build step. No inline scripts or handlers (delegated `data-rm-action`, `js/actions.js`). Font Awesome is self-hosted in `vendor/`. |
| API `backend/` | Express 4, route groups: auth, tenants, properties, payments, recycle, settings. Validators in `middleware/validation.js`. |
| Storage `services/driveStore.js` | One JSON doc per user + snapshots in "Rental Manager Backups". Ownership-marked folders/files (`appProperties`), per-user write lock, Drive `version` pre-condition with retry, per-user cache revalidated by one metadata call. |
| Schema `services/schema.js` | Single `SCHEMA_VERSION` (3); `migrate()` runs on every read. |
| Backup import `services/backupSchema.js` | Allow-list validation of every record before anything is written. |
| Auth | HMAC-signed 7-day session cookie (with session id, revocable on logout), Drive access token cookie, **AES-256-GCM encrypted** refresh-token cookie, origin/`Sec-Fetch-Site` CSRF guard. |

## Deployment (Render or any Node 18+ host)
1. Google Cloud Console: OAuth client (Web). Authorized redirect URI = `https://<host>/api/auth/google/callback`
   (must equal `GOOGLE_REDIRECT_URI`). Consent screen scope: `drive.file`, `openid`, `email`, `profile`.
2. Environment variables: see `backend/.env.example` and `render.yaml`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `JWT_SECRET`; `CORS_ORIGINS` only for extra origins).
3. Build `cd backend && npm ci --omit=dev`, start `npm start`, health check `/api/health`, readiness `/api/ready`.
4. **Run exactly one instance** (see limitations).
5. Existing deployments: `JWT_SECRET` must stay unchanged or users must sign in again. Old plaintext refresh-token cookies keep working and are re-encrypted on next refresh.

## Operational notes
* Backups: a snapshot is written before the first change of each UTC day and before every destructive action (restore, import, reset, clear). The newest `MAX_BACKUPS` (default 30) are kept.
* Account deletion moves only app-tracked files to the Google Drive **trash** (recoverable ~30 days) unless `permanent:true` is sent; foreign files in those folders are never touched.
* Monthly rollover: `POST /api/payments/rollover` (called by the client on load) creates the period's rows once, prefilled with the last/room rent. GET endpoints never write.

## Known limitations
See `AUDIT_RESPONSE.md` ("Not done / partially done").
