This app has no separate migration file to run by hand.

The schema (tables + indexes) lives in `backend/config/database.js` and is
created/updated automatically every time the server starts (see
`createTables()` and `migrateTables()` in that file, called from
`initDatabase()`). Just set `DATABASE_URL` to a Postgres connection string
and run `npm start` - the tables will be created on first boot if they
don't already exist, and any new columns get added automatically on
later versions.

(A previous `init.sql` here was hand-written and had drifted out of sync
with the actual schema - it's been removed to avoid confusion. Treat
`config/database.js` as the single source of truth for the schema.)
