# Data-store migration

## PostgreSQL primary store

Set `DATABASE_URL` to a reachable PostgreSQL connection string. On the first authenticated request for an account, the server creates the `rental_manager_account_data` table and imports that account's existing Google Drive JSON document if no PostgreSQL row exists. The source Drive file is retained; the import does not delete or overwrite it. Future reads and writes use the PostgreSQL JSONB record. Recovery snapshots continue to be stored in Google Drive.

The same `DATABASE_URL` must be configured on every application instance. The application acquires a per-account PostgreSQL advisory lock for mutations. If PostgreSQL is configured but unavailable, account reads/writes fail closed rather than falling back to the older Drive copy, which could cause split-brain data.

For a single-instance legacy deployment, omit `DATABASE_URL` to continue using Drive JSON storage. Do not run multiple instances in this mode.

## Before enabling in production

1. Take a fresh Google Drive backup from Settings.
2. Provision PostgreSQL and configure `DATABASE_URL` and SSL settings.
3. Deploy the same configuration to all instances.
4. Confirm `/api/ready` reports `READY` and that `DATABASE_URL` is not listed as missing.
5. Sign in with a test account and compare tenant/property/payment counts with the pre-migration Drive data.
6. Create/edit a test payment, reload, and verify it persists; test restore from a Drive snapshot.
7. Take a PostgreSQL backup before opening the service to normal users.

The schema is created automatically by the runtime store. No hand-written SQL file is required.
