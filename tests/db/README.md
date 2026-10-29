# Database tests

These tests apply every migration to a throwaway database and then act as different
people (a visitor, a customer, a venue owner, a moderator, an admin) to check that
row-level security and the workflow guards allow and refuse the right things.

They need PostgreSQL 16 with PostGIS. `supabase-stub.sql` adds the few Supabase pieces
the migrations use (`auth.users`, `auth.uid()` and the `anon`, `authenticated` and
`service_role` roles). CI uses the `postgis/postgis:16-3.4` image.

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```
