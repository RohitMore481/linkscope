# Multi-stage production Dockerfile for LinkScope BYOK

# Stage 1: Dependencies & Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json* ./

# Install all dependencies for build
RUN npm ci || npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Build frontend and backend bundles (Vite outputs to /app/dist, esbuild outputs to /app/dist/server.js)
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy package descriptors
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev || npm install --omit=dev --legacy-peer-deps

# Copy built distribution from builder (includes client assets and bundled server.js)
COPY --from=builder /app/dist ./dist

# Run as non-root user for security
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

# Start LinkScope unified production server
CMD ["node", "dist/server.js"]
