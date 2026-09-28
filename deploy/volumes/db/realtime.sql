-- Vendored from supabase/supabase docker/volumes/db/realtime.sql (Apache-2.0).
-- The realtime container requires this schema to exist before it can connect.
\set pguser `echo "$POSTGRES_USER"`

create schema if not exists _realtime;
alter schema _realtime owner to :pguser;
