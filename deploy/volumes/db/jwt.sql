-- Vendored from supabase/supabase docker/volumes/db/jwt.sql (Apache-2.0).
-- Makes JWT_SECRET available to Postgres functions (e.g. pgjwt) via GUCs.
\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
