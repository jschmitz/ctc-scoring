-- Vendored from supabase/supabase docker/volumes/db/roles.sql (Apache-2.0).
-- The supabase/postgres image ships these roles pre-created; this just sets
-- their passwords from POSTGRES_PASSWORD on first boot.
--
-- No supabase_functions_admin line: that role only exists when upstream's
-- webhooks.sql runs first, and this stack doesn't include it. The failed ALTER
-- aborts the image's remaining init scripts, including the one that gives
-- supabase_auth_admin ownership of auth.uid() etc., so GoTrue then can't migrate.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
