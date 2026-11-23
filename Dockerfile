# Multi-stage production Dockerfile for LinkScope (React 19 + Python FastAPI)

# Stage 1: Build Frontend Assets
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Production Python Runtime
FROM python:3.12-slim AS runner
WORKDIR /app

# Prevent Python from buffering stdout/stderr and from writing pyc files
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=4000
ENV NODE_ENV=production

# Install system dependencies for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy built frontend assets from builder
COPY --from=frontend-builder /app/dist ./dist

# Copy Python backend code
COPY backend ./backend

# Create a non-privileged user and switch to it
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-4000}/api/health || exit 1

# Start LinkScope unified FastAPI production server
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-4000}"]
