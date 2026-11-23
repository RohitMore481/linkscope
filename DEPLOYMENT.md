# LinkScope — Production Hosting & Deployment Guide

This guide provides comprehensive, step-by-step instructions for deploying LinkScope to production environments.

LinkScope is an anonymous-session Bring-Your-Own-Key (BYOK) website intelligence tool. It requires **no database, no persistent disk storage, and no shared developer API key**.

LinkScope supports dual backends:
1. **Python FastAPI Backend (`backend/main.py`):** The primary practical test implementation powering `POST /link-analysis`, `/docs` (Swagger UI), `/redoc`, and the unified single-container Docker setup.
2. **Node.js Express Backend (`server.ts`):** The preserved full-featured Node.js backend.

---

## 1. System Requirements & Architecture

- **Runtimes:**
  - Python `3.12+` (for FastAPI backend).
  - Node.js `20+` LTS (for building the React 19 SPA and running the Node backend).
- **Architecture:** Unified Single-Container Python FastAPI + React SPA.
  - Frontend compiled into static assets (`dist/`).
  - Python FastAPI serves static files, SSRF scraper, and Gemini structured output analysis.
- **Memory Footprint:** ~80MB – 160MB RSS (lightweight, runs easily on 512MB RAM tier).
- **CPU:** 0.5 vCPU minimum; 1 vCPU recommended.
- **Port:** Configured via `PORT` environment variable (defaults to `4000`).

---

## 2. Environment Variables Specification

Configure these environment variables in your hosting dashboard:

| Variable | Type | Mandatory? | Default | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | **Yes** | `production` | Enables production optimizations, disables stack trace leakage, enforces security headers. |
| `PORT` | Integer | Optional | `4000` | Port on which the server listens. |
| `GEMINI_ENCRYPTION_KEY` | Hex String | **Yes** | *None* | **Mandatory 32-byte secret (64 hex characters)** used for AES-256-GCM encryption of in-memory session credentials at rest. |
| `SESSION_KEY_TTL_SECONDS`| Integer | Optional | `86400` | Session lifetime in seconds before automatic purge (default: 24 hours). |
| `AI_PROVIDER` | String | Optional | `gemini` | AI Provider adapter (defaults to `gemini`). |
| `AI_MODEL` | String | Optional | `gemini-3.1-flash-lite` | Primary verified Gemini model for structured output generation. |
| `ALLOWED_ORIGINS` | String | Optional | `""` | Comma-separated allowed origins for CORS/CSRF validation (e.g. `https://linkscope.example.com`). |

### Generating `GEMINI_ENCRYPTION_KEY`
Run either one-liner in your terminal:
```bash
# Using Python
python -c "import secrets; print(secrets.token_hex(32))"

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
*Never reuse or commit this key to Git.*

---

## 3. Local Execution

### Option A: Python FastAPI Backend (Recommended for Dxora Assessment)

```bash
# 1. Install frontend dependencies and build SPA
npm install
npm run build

# 2. Install Python dependencies
pip install -r backend/requirements.txt

# 3. Run FastAPI backend (with reload for development)
uvicorn backend.main:app --host 0.0.0.0 --port 4000 --reload
```
Access the application:
- Interactive Web App: `http://localhost:4000`
- Swagger UI Documentation: `http://localhost:4000/docs`
- ReDoc Documentation: `http://localhost:4000/redoc`
- Health Endpoint: `http://localhost:4000/api/health`

### Option B: Node.js Express Backend

```bash
# 1. Install all dependencies
npm ci

# 2. Compile frontend and backend
npm run build

# 3. Start production server
npm start
```

---

## 4. Docker Deployment (Single Container)

LinkScope includes a multi-stage `Dockerfile` that builds the React 19 frontend and packages it into a lightweight, non-root Python 3.12 slim container:

### Build & Run Locally with Docker
```bash
# Build Docker image
docker build -t linkscope:latest .

# Run container on port 4000
docker run -d \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e GEMINI_ENCRYPTION_KEY=$(python -c "import secrets; print(secrets.token_hex(32))") \
  --name linkscope \
  linkscope:latest

# Check container health
curl http://localhost:4000/api/health
```

---

## 5. Render Deployment Guide (Cloud Hosting)

LinkScope is pre-configured with a root `render.yaml` blueprint for 1-click deployment on [Render](https://render.com).

### Step-by-Step Render Setup:
1. Fork or push the LinkScope repository to your GitHub account.
2. Log in to [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your LinkScope repository.
5. Render detects `render.yaml` automatically:
   - **Service Name:** `linkscope`
   - **Environment:** `Docker`
   - **Plan:** `starter` (or free tier)
   - **Health Check Path:** `/api/health`
6. `GEMINI_ENCRYPTION_KEY` is automatically generated securely by Render (`generateValue: true`).
7. Click **Apply**.
8. Once built, open your Render URL (e.g. `https://linkscope.onrender.com`).
9. Verify interactive docs at `https://linkscope.onrender.com/docs`.

---

## 6. Verification & Health Monitoring

### Health Check Endpoint
```bash
curl http://localhost:4000/api/health
```
Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-11-24T02:45:00.000Z",
  "version": "2.0.0",
  "runtime": "python-fastapi",
  "model": "gemini-3.1-flash-lite",
  "activeSessions": 0
}
```

### Analysis API Verification (Direct via cURL)
```bash
curl -X POST "http://localhost:4000/link-analysis" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_GEMINI_API_KEY" \
  -d '{"url": "https://example.com"}'
```
