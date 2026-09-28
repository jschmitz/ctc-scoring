#!/usr/bin/env bash
# Installed on the Droplet at /opt/ctc-scoring/deploy.sh. Run over SSH by
# .github/workflows/deploy.yml after a green build, and by hand to roll back:
#   /opt/ctc-scoring/deploy.sh <previous-sha>
#
# Only `pull`, `up -d`, and `ps`: the ctc-scoring user's sudo allows exactly
# `docker compose -f /opt/ctc-scoring/docker-compose.yml {pull|up -d|down|restart|ps|logs}`
# (deploy/sudoers.ctc-scoring). Migrations run in the app's entrypoint, so
# `up -d` recreating the app container is all a deploy needs.
#
# This script doesn't update docker-compose.yml or deploy/volumes/. If a change
# touches those, copy them to /opt/ctc-scoring by hand before deploying.
set -euo pipefail
TAG="${1:?usage: deploy.sh <sha>}"
COMPOSE=(sudo docker compose -f /opt/ctc-scoring/docker-compose.yml)
cd /opt/ctc-scoring

if grep -q '^IMAGE_TAG=' .env; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" .env
else
  echo "IMAGE_TAG=$TAG" >>.env
fi

"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" ps
