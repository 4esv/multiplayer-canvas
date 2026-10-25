# Assets stage: minify + content-hash the static tree (needs devDependencies
# for esbuild). Output lands in dist/, which the runtime stage copies over.
FROM node:24-alpine AS assets

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY site.config.js ./
COPY primitives/ ./primitives/
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN node scripts/build-assets.mjs

# Runtime stage
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source: the site, its config and the primitives it imports by name
COPY site.config.js ./
COPY primitives/ ./primitives/
COPY src/ ./src/

# Built static assets + manifest. The server serves dist/static (and asset()
# resolves hashed names) whenever dist/asset-manifest.json exists in prod.
COPY --from=assets /app/dist/ ./dist/

# The markdown content tree. Every content surface reads it at request time
# (/work, /feed, the root-mounted experiments and photo sets, /about, plus
# /feed.xml and /sitemap.xml), so without this the content routes 500.
COPY content/ ./content/

# The runtime stores (passkeys, rooms, audit) live under data/
RUN mkdir -p /app/data && chown node:node /app/data

# Create non-root user
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start server
CMD ["node", "src/server.js"]
