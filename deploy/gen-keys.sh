#!/usr/bin/env bash
# Generates the three secrets a self-hosted Supabase stack needs: JWT_SECRET,
# and the ANON_KEY/SERVICE_ROLE_KEY JWTs signed with it (role: anon /
# service_role). Run once during first-time setup and paste the output into
# /opt/ctc-scoring/.env — see docs/DEPLOYMENT.md "First-time setup". Copied from food-shopper.
#
# Needs only openssl, which is on every Droplet base image. No Supabase CLI,
# no network call — these keys are self-issued, exactly like the ones the
# Supabase CLI generates for local dev.
set -euo pipefail

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

JWT_SECRET="$(openssl rand -hex 32)"
REALTIME_SECRET_KEY_BASE="$(openssl rand -hex 64)"
IAT=$(date +%s)
EXP=$((IAT + 10 * 365 * 24 * 60 * 60)) # 10 years — self-hosted, no rotation ceremony

make_jwt() {
  local role="$1" header payload signature
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$IAT" "$EXP" | b64url)
  signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

cat <<EOF
JWT_SECRET=$JWT_SECRET
ANON_KEY=$(make_jwt anon)
SERVICE_ROLE_KEY=$(make_jwt service_role)
REALTIME_SECRET_KEY_BASE=$REALTIME_SECRET_KEY_BASE
EOF
