# Production image: Next.js standalone server plus psql for migrate-on-boot.
# Built by .github/workflows/deploy.yml for linux/amd64; see docs/DEPLOYMENT.md.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_ values are inlined into the browser bundle, so they must be
# present at build time. The key is the self-hosted ANON_KEY (a public value).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# bash + psql for deploy/migrate.sh, which the entrypoint runs on every start.
# The deploy user's sudo allows `compose up -d` but not `compose run`, so
# migrating on boot is how "migrate before serving" happens in production.
RUN apk add --no-cache bash postgresql17-client
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY deploy/migrate.sh deploy/docker-entrypoint.sh ./
COPY supabase/migrations ./migrations
# The server runs as `node` and writes its runtime cache under .next/cache.
RUN chmod +x ./migrate.sh ./docker-entrypoint.sh \
 && mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
