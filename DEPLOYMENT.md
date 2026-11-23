# LinkScope — Production Hosting & Deployment Guide

This guide provides comprehensive, step-by-step instructions for deploying LinkScope to production environments.

LinkScope is an anonymous-session Bring-Your-Own-Key (BYOK) website intelligence tool. It requires **no database, no persistent disk storage, and no shared developer API key**.

---

## 1. System Requirements & Architecture

- **Node.js Runtime:** Node.js `v20.0.0` or higher (`v22+` LTS recommended).
- **Architecture:** Unified Single-Process Express + React SPA.
  - Frontend compiled into static assets (`dist/`).
  - Backend compiled into a standalone Node.js ES module (`dist/server.js`).
- **Memory Footprint:** ~80MB – 150MB RSS (lightweight, runs easily on 512MB RAM tier).
- **CPU:** 0.5 vCPU minimum; 1 vCPU recommended.
- **Port:** Configured via `PORT` environment variable (defaults to `4000`).

---

## 2. Environment Variables Specification

Configure these environment variables in your hosting dashboard:

| Variable | Type | Mandatory? | Default | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | **Yes** | `production` | Enables production optimizations, disables stack trace leakage, enforces security headers. |
| `PORT` | Integer | Optional | `4000` | Port on which the Express server listens. |
| `GEMINI_ENCRYPTION_KEY` | Hex String | **Yes** | *None* | **Mandatory 32-byte secret (64 hex characters)** used for AES-256-GCM encryption of in-memory session credentials at rest. |
| `SESSION_KEY_TTL_SECONDS`| Integer | Optional | `86400` | Session lifetime in seconds before automatic purge (default: 24 hours). |
| `AI_PROVIDER` | String | Optional | `gemini` | AI Provider adapter (defaults to `gemini`). |
| `AI_MODEL` | String | Optional | `gemini-3.1-flash-lite` | Primary verified Gemini model for structured output generation. |
| `ALLOWED_ORIGINS` | String | Optional | `""` | Comma-separated allowed origins for CORS/CSRF validation (e.g. `https://linkscope.example.com`). |

### Generating `GEMINI_ENCRYPTION_KEY`
Run this one-liner in your terminal or build machine:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
*Never reuse or commit this key to Git.*

---

## 3. Build & Run Commands

```bash
# 1. Install all dependencies
npm ci

# 2. Compile frontend and backend
npm run build

# 3. Start production server
npm start
```

- `npm run build` runs:
  - `vite build` → outputs client assets to `dist/`
  - `esbuild server.ts --platform=node --format=esm --target=node20 --bundle --outfile=dist/server.js --packages=external` → outputs bundled backend to `dist/server.js`
- `npm start` executes: `node dist/server.js`

---

## 4. Deployment Options

### Option A: Render (Recommended Blueprint)
LinkScope includes a ready-to-use [`render.yaml`](./render.yaml).

1. Connect your Git repository to [Render](https://dashboard.render.com).
2. Select **New > Blueprint** and choose your repository.
3. Render automatically reads `render.yaml` and provisions a Web Service using Docker.
4. Render automatically generates a secure `GEMINI_ENCRYPTION_KEY`.
5. Health checks are automatically mapped to `/api/health`.

#### Manual Render Web Service Setup (Alternative without Blueprint):
- **Runtime:** `Node` or `Docker`
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `node dist/server.js`
- **Health Check Path:** `/api/health`
- **Environment Variables:** Set `NODE_ENV=production`, `PORT=4000`, `GEMINI_ENCRYPTION_KEY=<generated_key>`.

---

### Option B: Google Cloud Run / AWS ECS / Container Platforms

Use the optimized multi-stage [`Dockerfile`](./Dockerfile) included in the repository.

1. **Build Container Image:**
   ```bash
   docker build -t linkscope:latest .
   ```

2. **Run Container Locally:**
   ```bash
   docker run -d \
     -p 4000:4000 \
     -e NODE_ENV=production \
     -e PORT=4000 \
     -e GEMINI_ENCRYPTION_KEY="<your_64_char_hex_key>" \
     --name linkscope \
     linkscope:latest
   ```

3. **Deploy to Google Cloud Run:**
   ```bash
   gcloud run deploy linkscope \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars NODE_ENV=production,PORT=4000,GEMINI_ENCRYPTION_KEY=<your_64_char_hex_key>
   ```

4. **Health Check Config:**
   - Protocol: HTTP
   - Path: `/api/health`
   - Port: 4000
   - Interval: 30s

---

### Option C: Self-Hosted Linux VPS (Ubuntu / Debian + Nginx + Systemd)

1. **Prepare Server & Node.js 22:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx git
   ```

2. **Clone & Build:**
   ```bash
   cd /var/www
   sudo git clone <repo_url> linkscope
   cd linkscope
   sudo npm ci
   sudo npm run build
   ```

3. **Configure Environment:**
   Create `/var/www/linkscope/.env`:
   ```env
   NODE_ENV=production
   PORT=4000
   GEMINI_ENCRYPTION_KEY="<your_64_char_hex_key>"
   AI_MODEL="gemini-3.1-flash-lite"
   ALLOWED_ORIGINS="https://yourdomain.com"
   ```

4. **Create Systemd Service (`/etc/systemd/system/linkscope.service`):**
   ```ini
   [Unit]
   Description=LinkScope Website Intelligence Platform
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/linkscope
   ExecStart=/usr/bin/node dist/server.js
   Restart=always
   RestartSec=5
   EnvironmentFile=/var/www/linkscope/.env

   [Install]
   WantedBy=multi-user.target
   ```
   Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable linkscope
   sudo systemctl start linkscope
   ```

5. **Configure Nginx Reverse Proxy (`/etc/nginx/sites-available/linkscope`):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name yourdomain.com;

       ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:4000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 60s;
           proxy_connect_timeout 15s;
       }
   }
   ```
   Enable and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/linkscope /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## 5. Reverse Proxy & Cookie Requirements

- **Trust Proxy:** Express is configured with `app.set("trust proxy", 1)`. When running behind Render, Nginx, Cloudflare, or AWS ALB, Express correctly reads `req.secure` and `req.ips` from `X-Forwarded-*` headers.
- **SSL / HTTPS Required in Production:** The session cookie (`linkscope_session`) uses `SameSite=Lax; HttpOnly; Path=/`. When accessed over HTTPS, the browser securely transmits the cookie.
- **CSRF Defense:** State-modifying endpoints (`POST /api/v1/session/activate`, `POST /api/analyze`, `POST /api/v1/session/logout`) validate incoming `Origin` and `Host` headers. If running on a custom domain, provide it in `ALLOWED_ORIGINS` (e.g. `ALLOWED_ORIGINS="https://linkscope.example.com"`).

---

## 6. Single-Instance & In-Memory Session Limitations

LinkScope intentionally operates with **zero database persistence**:
1. **Server Restarts & Redeploys:**
   - Active sessions are kept in volatile server RAM.
   - When a new deployment is promoted or the server restarts, existing active sessions expire immediately.
   - Users simply re-enter their Gemini API key on the activation screen to resume.
2. **Horizontal Scaling (Multi-Instance):**
   - By default, in-memory sessions are bound to a single Node.js process.
   - If deploying multiple instances behind a load balancer, **sticky sessions** (session affinity based on cookies or client IP) must be enabled.
   - Alternatively, the `ISessionStore` interface (`server/services/sessionStore.ts`) can be backed with Redis without modifying application routes.

---

## 7. Post-Deployment Verification Checklist

Follow this checklist immediately after deployment:

1. **Health Check Probe:**
   ```bash
   curl -I https://yourdomain.com/api/health
   ```
   Expected response:
   - HTTP status `200 OK`
   - Content-Type `application/json`
   - Body contains `"status": "healthy"`, `"model": "gemini-3.1-flash-lite"`

2. **Security Headers Check:**
   Verify the response contains:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Strict-Transport-Security` (on HTTPS)

3. **Unauthenticated API Access Rejection:**
   ```bash
   curl -X POST https://yourdomain.com/api/analyze \
     -H "Content-Type: application/json" \
     -d '{"url":"https://stripe.com"}'
   ```
   Expected response:
   - HTTP status `401 Unauthorized`
   - Body: `{"error":"Unauthorized","message":"Active session required..."}`

4. **Frontend Asset Serving:**
   Open `https://yourdomain.com` in a browser. Confirm that the Activation Landing page renders smoothly with no 404s in DevTools Console or Network tabs.

5. **Full End-to-End Test:**
   - Enter a valid Google Gemini API key.
   - Click **Activate LinkScope**. Confirm that the dashboard unlocks and an `HttpOnly` cookie is set.
   - Analyze a sample URL (`https://stripe.com`).
   - Confirm all 5 intelligence sections render within ~10–18 seconds.
   - Click **Export PDF** and **Export JSON** to verify browser exports.
   - Click **End Session** and confirm you are returned to the activation landing page.

---

## 8. Rollback Procedures

If an issue occurs after deploying a new release:
1. **Render / Cloud Run:** Revert to the previous build or image tag in the dashboard.
2. **Docker:**
   ```bash
   docker stop linkscope
   docker run -d -p 4000:4000 --env-file .env linkscope:<previous_tag>
   ```
3. **VPS Systemd:**
   ```bash
   cd /var/www/linkscope
   sudo git checkout <previous_commit>
   sudo npm ci
   sudo npm run build
   sudo systemctl restart linkscope
   ```
