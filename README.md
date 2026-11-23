# LinkScope

> **See Beyond the Website.**

LinkScope is an AI-powered website intelligence platform that transforms any public website URL into actionable, structured business intelligence in seconds. By combining targeted web scraping, intelligent content extraction, and Google's Gemini models, LinkScope reveals competitor positioning, high-intent search queries, SEO strategies, core offerings, and target audience segments.

Built for the **Dxora Technologies Python Practical Test**, LinkScope features a modern **Python 3.12 + FastAPI** backend alongside a sleek **React 19 + TypeScript + Tailwind CSS** frontend, deployed together in a single lightweight production container.

LinkScope operates on an **anonymous Bring-Your-Own-Key (BYOK)** architecture requiring **zero user accounts, zero passwords, and zero database infrastructure**. Users activate the platform with their own Google Gemini API key (or authenticate directly via HTTP header), which is encrypted at rest in server memory with AES-256-GCM and wiped automatically on session expiration.

---

## Table of Contents

- [Core Capabilities & Analysis Sections](#core-capabilities--analysis-sections)
- [API Documentation & Dxora Specifications](#api-documentation--dxora-specifications)
- [Technology Stack](#technology-stack)
- [LLM Model Selection & Comparative Research](#llm-model-selection--comparative-research)
- [System Architecture](#system-architecture)
- [Local Installation & Setup](#local-installation--setup)
- [Running Automated Tests](#running-automated-tests)
- [Docker & Production Deployment](#docker--production-deployment)
- [Environment Variables](#environment-variables)
- [Security Architecture](#security-architecture)
- [License](#license)

---

## Core Capabilities & Analysis Sections

LinkScope structures its analysis into five comprehensive, production-grade business intelligence sections:

### 1. Competitor vs. Your Brand Analysis
- **Brand Identification:** Extracted brand name, unique positioning, and core value propositions.
- **Detailed Competitor Profiles:** Identifies at least three credible industry competitors.
- **Fact vs. Inference Tagging:** Explicitly distinguishes **researched facts** (sourced from actual page copy) from **AI inferences** via `is_inferred` and `source` tags.
- **Market Dynamics:** Competitor strengths, competitor weaknesses, and strategic whitespace opportunities for the analyzed brand.

### 2. Top 5 Target Search Queries Across Major Platforms
- **Multi-Platform Coverage:** Generates high-intent queries tailored for **Google, Facebook, Instagram, LinkedIn, and X (Twitter)**.
- **Search Intent Classification:** Categorizes intent as *Informational*, *Commercial*, *Navigational*, or *Transactional*.
- **Business Relevance & Audience:** Documents exact strategic business relevance and the target persona searching for each query.
- **Rationale:** Clear rationale explaining why the query captures demand.

### 3. SEO Strategy & Content Improvements
- **Keyword Clustering:** Primary keywords, secondary keyword variations, and targeted **long-tail keywords**.
- **Page Optimization:** Optimized SEO title tag (under 60 characters) and meta description (under 160 characters).
- **High-Impact Content Ideas:** Recommended content topics designed to rank for identified search queries.

### 4. Top 5 Products / Services Catalog
- **Structured Offerings:** 5 core services or products extracted directly from the website.
- **Audience & Market Mapping:** Target industry and specific target customer profile for each service.
- **Value Proposition:** Main tangible business benefit provided.

### 5. Target Audience & Market Segmentation
- **Tiered Personas:** Primary target audience and secondary target audience.
- **B2B & B2C Dimensions:** Industry segments, business types, customer profiles, and geographical focus.
- **Needs & Interests:** Specific customer pain points/needs, behavioral interests, and recommended actionable target segments.

---

## API Documentation & Dxora Specifications

The LinkScope FastAPI backend exposes standard, fully interactive OpenAPI documentation:

- **Swagger UI:** [`http://localhost:4000/docs`](http://localhost:4000/docs)
- **ReDoc:** [`http://localhost:4000/redoc`](http://localhost:4000/redoc)
- **OpenAPI Schema:** `http://localhost:4000/openapi.json`

### Primary Endpoint: `POST /link-analysis`
*Aliases:* `/api/analyze`, `/api/link-analysis`, `/api/v1/analyze`

#### Authentication Modes:
1. **Direct API Header (Swagger UI / Automated Scripts):**
   ```http
   POST /link-analysis HTTP/1.1
   Host: localhost:4000
   X-API-Key: AIzaSy...
   Content-Type: application/json

   {
     "url": "https://example.com"
   }
   ```
   *(Also accepts `Authorization: Bearer AIzaSy...`)*

2. **Anonymous Browser Session (Web UI):**
   Activate session via `POST /api/v1/session/activate` with `{"apiKey": "AIzaSy..."}`. The server responds with an encrypted `HttpOnly` session cookie (`linkscope_session`) valid for subsequent requests.

#### Example Request:
```bash
curl -X POST "http://localhost:4000/link-analysis" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_GEMINI_API_KEY" \
  -d '{"url": "https://stripe.com"}'
```

#### Health Check: `GET /api/health`
```bash
curl http://localhost:4000/api/health
```
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

---

## Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons | Responsive single-page application dashboard |
| **Backend (Primary)** | Python 3.12, FastAPI, Uvicorn, Pydantic v2, HTTPX, BeautifulSoup4 | High-performance asynchronous API, SSRF validation, schema enforcement |
| **Backend (Preserved)** | Node.js 20+, Express 4, esbuild | Preserved reference implementation with 116 regression tests |
| **AI Integration** | `google-genai` SDK, Google Gemini 3.1 Flash Lite | High-speed structured JSON generation via strict Pydantic schemas |
| **Security** | AES-256-GCM (`cryptography`), sliding-window rate limiting | Memory-only BYOK encryption, CSRF and SSRF defense |
| **Testing** | `pytest`, `pytest-asyncio`, Node.js native test runner | 140 automated tests across both Python and Node suites |
| **Deployment** | Multi-Stage Docker (Node builder + Python 3.12 slim runner), Render | Production single-container web deployment |

---

## LLM Model Selection & Comparative Research

For this implementation, an in-depth comparative benchmark was conducted across leading foundational models:
1. **Google Gemini 3.1 Flash Lite** *(Selected)*
2. **OpenAI GPT-4o-mini**
3. **Anthropic Claude 3.5 Haiku**
4. **DeepSeek V3**

### Comparison Summary:
| Model | Context Window | Input / 1M | Output / 1M | Structured Output Support | Typical Latency | Free Tier Available? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.1 Flash Lite** | **1,048,576 tokens** | **\$0.075** | **\$0.30** | **Native JSON Schema (`response_schema`)** | **1.2s – 2.4s** | **Yes (Google AI Studio)** |
| GPT-4o-mini | 128,000 tokens | \$0.150 | \$0.60 | Strict JSON Mode | 2.0s – 3.5s | No (Paid credits only) |
| Claude 3.5 Haiku | 200,000 tokens | \$0.800 | \$4.00 | Tool Calling / System Prompt | 2.5s – 4.0s | No (Paid credits only) |
| DeepSeek V3 | 64,000 tokens | \$0.140 | \$0.28 | JSON Mode (Prompt-based) | 3.5s – 6.0s | No (Credit-based) |

> **Comprehensive Research Document:** For complete pricing breakdowns, architectural trade-offs, and reasoned recommendation justification, see [docs/LLM_RESEARCH.md](./docs/LLM_RESEARCH.md).

---

## System Architecture

```
[User Browser / Client]
       │
       ▼
[FastAPI Application (Port 4000)]
       │
       ├─► Static SPA Middleware: Serves React 19 Frontend from dist/
       ├─► Security Middleware: CSRF check, Security Headers, UUID request tracing
       ├─► Auth Dependency: Dual-mode (Session Cookie or X-API-Key / Bearer header)
       │
       ├─► Scraper Service:
       │     ├─ Validate URL scheme (http/https)
       │     ├─ DNS Resolution & SSRF / RFC 1918 Private IP Filter
       │     ├─ HTTPX client with per-redirect DNS re-validation
       │     └─ BeautifulSoup4 HTML extraction & heuristic token reduction
       │
       └─► Gemini Service:
             ├─ Google GenAI SDK (gemini-3.1-flash-lite)
             ├─ Strict Pydantic JSON Schema enforcement
             └─ Bounded transient retry logic (503 UNAVAILABLE handling)
```

---

## Local Installation & Setup

### Prerequisites
- Python `3.12+`
- Node.js `20+` LTS
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd <repository-directory>
```

### 2. Install Dependencies & Build Frontend
```bash
# Install frontend packages and build React SPA
npm install
npm run build
```

### 3. Set Up Python Environment
```bash
# Create and activate a virtual environment (optional but recommended)
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install Python requirements
pip install -r backend/requirements.txt
```

### 4. Configure Environment
Create a `.env` file in the project root:
```env
PORT=4000
NODE_ENV=development
GEMINI_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
AI_MODEL=gemini-3.1-flash-lite
```
*(Generate a secure 32-byte key: `python -c "import secrets; print(secrets.token_hex(32))"`)*

### 5. Launch the Application
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 4000 --reload
```
Open **`http://localhost:4000`** in your browser to access LinkScope.

---

## Running Automated Tests

LinkScope features comprehensive test suites for both Python and Node.js:

### Python Backend Suite (`pytest`):
```bash
python -m pytest backend/tests -v
```
- **24 automated tests** covering:
  - AES-256-GCM encryption/decryption lifecycle and tampering rejection.
  - Session creation, TTL expiration, and safe metadata status.
  - SSRF defense, RFC 1918 blocking, carrier NAT blocking, IPv6 mapping, and DNS rebinding rejection.
  - API key format validation and mock Gemini structured analysis generation.
  - Full HTTP integration tests for `/api/health`, `/api/v1/session/*`, and `POST /link-analysis`.

### Preserved Node.js Backend Suite (`npm test`):
```bash
npm test
```
- **116 automated tests** covering Express routing, security middleware, and regression testing.

---

## Docker & Production Deployment

### Local Docker Build
```bash
# Build multi-stage image
docker build -t linkscope:latest .

# Run container
docker run -d -p 4000:4000 \
  -e NODE_ENV=production \
  -e GEMINI_ENCRYPTION_KEY=$(python -c "import secrets; print(secrets.token_hex(32))") \
  linkscope:latest
```

### Render Cloud Deployment
The repository includes `render.yaml` for 1-click cloud deployment. See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment instructions.

---

## Security Architecture

1. **Memory-Only BYOK:** API keys provided by users are encrypted with AES-256-GCM using a server-side 256-bit encryption key. Decryption occurs only in memory at the exact instant an upstream Gemini call is executed.
2. **Zero Persistent Storage:** Zero database dependencies. Volatile sessions reside strictly in RAM with automated TTL expiration sweeps.
3. **Comprehensive SSRF Prevention:** Destination hostnames are resolved before connection. Non-public IP ranges (RFC 1918, loopbacks `127.0.0.0/8`, link-local `169.254.0.0/16`, CGNAT `100.64.0.0/10`, multicast, and documentation ranges) are strictly blocked.
4. **DNS Rebinding Prevention:** Redirects are intercepted and re-validated per-hop to prevent TOCTOU DNS rebinding attacks.
5. **Rate Limiting:** Sliding-window rate limiter prevents abuse of scraping and analysis endpoints.

---

## License

This project is prepared for the Dxora Technologies Python Practical Test. All rights reserved.
