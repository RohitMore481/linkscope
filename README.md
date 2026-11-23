# LinkScope

> **See Beyond the Website.**

LinkScope is an AI-powered website intelligence platform that transforms any public website URL into actionable, structured business intelligence in seconds. By combining targeted web scraping, intelligent content extraction, and Google's Gemini models, LinkScope reveals competitor positioning, high-intent search queries, SEO strategies, core offerings, and target audience segments.

Built on an **anonymous Bring-Your-Own-Key (BYOK)** architecture, LinkScope requires **zero user accounts, zero passwords, and zero database infrastructure**. Users activate the platform with their own Google Gemini API key, which is encrypted at rest in server memory, utilized during an anonymous session, and wiped automatically on logout or expiration.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Analysis Sections](#analysis-sections)
- [BYOK & Privacy Model](#byok--privacy-model)
- [Local Installation](#local-installation)
- [Environment Variables](#environment-variables)
- [Available Commands](#available-commands)
- [Security Architecture](#security-architecture)
- [Deployment Overview](#deployment-overview)
- [Limitations](#limitations)
- [License & Contributions](#license--contributions)
- [Repository & Links](#repository--links)

---

## Features

LinkScope delivers eleven core capabilities:

1. **Website Intelligence Analysis:** Fetches and analyzes any publicly accessible website URL, extracting semantic page layout, headings, and body content.
2. **Competitor vs. Brand Positioning:** Identifies the underlying brand name, core value propositions, direct competitor strengths and weaknesses, and market opportunities.
3. **Top 5 Multi-Platform Search Queries:** Uncovers high-intent commercial and discovery search queries mapped across Google, LinkedIn, Instagram, and X (Twitter).
4. **Actionable SEO Recommendations:** Generates optimized title tags, meta descriptions, primary and secondary target keyword lists, and strategic content topic recommendations.
5. **Top 5 Service & Product Identification:** Discovers and summarizes the primary services, features, or product lines offered on the target website.
6. **Target Audience Profiling:** Determines primary and secondary target buyer personas, industry verticals, customer pain points, and market segments.
7. **Structured Schema Validation:** Enforces a rigid JSON schema contract with Gemini structured outputs, guaranteeing consistent report structure with zero markdown parsing errors.
8. **JSON Export:** Download full analysis data in standardized, pretty-printed JSON for downstream tooling and custom pipelines.
9. **Executive PDF Export:** Generate client-ready, multi-page PDF intelligence reports with dedicated styling, headers, and formatted tables directly in the browser.
10. **Session-Based BYOK Security:** Users supply their own Gemini API key; keys are encrypted with AES-256-GCM in server memory, never stored in a database, and never returned to the client.
11. **Responsive User Interface:** Clean, modern interface built with React 19 and Tailwind CSS v4, featuring a 3-zone header layout, platform filtering chips, and one-click query copying.

---

## Screenshots

Visual documentation and interface captures are organized in [`docs/screenshots/`](./docs/screenshots/README.md).

| View | Purpose | File Location |
| :--- | :--- | :--- |
| **BYOK Activation** | Clean activation landing page with API key input, Google AI Studio shortcut, and session notice. | `docs/screenshots/01-activation-landing.png` |
| **Intelligence Dashboard** | Main operational view showing the URL input, sample target URL chips, and live status. | `docs/screenshots/02-dashboard-overview.png` |
| **Competitor vs. Brand** | Positioning card displaying brand identification, competitor strengths, weaknesses, and opportunities. | `docs/screenshots/03-competitor-analysis.png` |
| **Multi-Platform Queries** | Search query matrix with interactive platform filter tabs (All, Google, LinkedIn, Instagram, X). | `docs/screenshots/04-search-queries.png` |
| **SEO Recommendations** | Title tag and meta description recommendations, keyword tags, and content ideas. | `docs/screenshots/05-seo-improvements.png` |
| **Services & Audience** | Catalog of top 5 offerings and detailed target buyer persona segments. | `docs/screenshots/06-services-audience.png` |
| **Executive PDF Export** | Formatted multi-page PDF report preview generated directly via jsPDF. | `docs/screenshots/07-export-modal-pdf.png` |

> *To capture and contribute updated screenshots, refer to the guidelines in [docs/screenshots/README.md](./docs/screenshots/README.md).*

---

## Technology Stack

### Frontend
- **Framework:** [React 19](https://react.dev/) (`react`, `react-dom`)
- **Language:** [TypeScript](https://www.typescriptlang.org/) (strict mode)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Document Export:** [jsPDF](https://github.com/parallax/jsPDF)
- **Build Tooling:** [Vite 8](https://vitejs.dev/)

### Backend
- **Runtime:** [Node.js 20+](https://nodejs.org/) (ES modules)
- **Web Framework:** [Express 4](https://expressjs.com/)
- **Production Bundler:** [esbuild](https://esbuild.github.io/) (compiles server to standalone `dist/server.js`)
- **Cookie Parsing:** `cookie-parser`
- **Environment Management:** `dotenv`

### AI Integration
- **Provider SDK:** [`@google/genai`](https://www.npmjs.com/package/@google/genai)
- **Configured Model:** `gemini-3.1-flash-lite`
- **Output Mode:** Native Structured JSON Schema (`responseSchema`)

### Scraping & Content Processing
- **HTML Parsing:** [Cheerio](https://cheerio.js.org/)
- **HTTP Client:** Node.js native `fetch` with custom DNS resolution & redirect interception
- **Content Reducer:** Custom heuristic cleaner removing scripts, styles, navigational chrome, and SVGs while preserving headings, metadata, and core copy

### Security & Cryptography
- **In-Memory Encryption:** Node.js native `crypto` (AES-256-GCM with 96-bit random nonces)
- **Session Identification:** 256-bit cryptographically secure random session tokens
- **Cookie Policy:** `HttpOnly`, `SameSite=Lax`, `Path=/` (and `Secure` on HTTPS)
- **Network Defense:** SSRF IP address validation, RFC 1918 filter, cloud metadata guard (`169.254.169.254`), DNS rebinding prevention, and CSRF origin checks

### Build & Deployment
- **Containerization:** Multi-stage Docker Alpine build
- **Cloud Hosting Support:** Render Web Service blueprint (`render.yaml`), Google Cloud Run, AWS ECS, Linux VPS

---

## System Architecture

### Request & Processing Flow

The LinkScope lifecycle operates through eleven distinct stages:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Server as Express Server
    participant Memory as In-Memory Store
    participant Scraper as Hardened Scraper
    participant Target as Target Website
    participant Gemini as Google Gemini API

    User->>Server: 1. Opens LinkScope Landing Page
    User->>Server: 2. Submits Gemini API Key (POST /api/v1/session/activate)
    Server->>Gemini: 3. Validates key & schema support with live probe
    Gemini-->>Server: Key validated successfully
    Server->>Server: 4. Encrypts API key using AES-256-GCM
    Server->>Memory: 5. Stores encrypted key with 24h TTL; sets HttpOnly session cookie
    Server-->>User: Returns 200 OK (Dashboard Unlocked)
    
    User->>Server: 6. Submits Target URL (POST /api/analyze)
    Server->>Memory: Verifies cookie & retrieves encrypted key
    Server->>Scraper: 7. Validates URL against SSRF / private IP filters
    Scraper->>Target: Fetches HTML (re-validates DNS on every redirect)
    Target-->>Scraper: Returns raw HTML
    Server->>Server: 8. Cleans HTML & extracts structured text content
    Server->>Gemini: 9. Requests structured analysis with gemini-3.1-flash-lite
    Gemini-->>Server: Returns validated 5-section JSON payload
    Server-->>User: 10. Delivers normalized intelligence report to Dashboard
    User->>User: 11. Explores interactive cards, filters queries, or exports PDF/JSON
```

---

## Analysis Sections

LinkScope structures all AI responses according to five canonical sections matching the formal JSON schema:

### 1. `competitor_vs_your_brand`
- `brand_name`: The identified company, organization, or product name.
- `brand_summary`: High-level summary of what the brand does and its primary positioning.
- `competitors`: Detailed breakdown of key direct and indirect market competitors, covering:
  - `competitor_name`: Name of competitor.
  - `strengths`: Verified capabilities, advantages, or differentiators.
  - `weaknesses`: Known gaps, limitations, or vulnerabilities.
- `market_opportunities`: Concrete actionable opportunities where the target brand can win market share.

### 2. `top_5_target_search_queries`
An array of five targeted search queries designed to capture commercial intent across search engines and social platforms:
- `query`: Exact search query string.
- `intent`: Search intent classification (e.g., *Commercial*, *Informational*, *Transactional*).
- `platform`: Primary platform target (`Google`, `LinkedIn`, `Instagram`, or `X`).
- `rationale`: Why this query is valuable for acquiring high-intent traffic or prospective buyers.

### 3. `seo_improvement`
- `current_assessment`: Analysis of current on-page SEO strengths and visible gaps.
- `title_tag_recommendation`: Optimized title tag under 60 characters.
- `meta_description_recommendation`: Compelling meta description between 140–160 characters.
- `primary_keywords`: Top-priority high-intent search keywords.
- `secondary_keywords`: Long-tail and supporting contextual keywords.
- `content_ideas`: Strategic blog posts, guides, and comparison topics to build topical authority.

### 4. `top_5_services`
An array of up to five distinct service or product offerings identified from the website copy:
- `service_name`: Offering title or product tier.
- `description`: Plain-language explanation of what is included and who it serves.

### 5. `target_audience_identification`
- `primary_audience`: Core ideal customer profile (ICP) and decision-makers.
- `secondary_audience`: Secondary stakeholders, influencers, or end-users.
- `vertical_industries`: Industry verticals that benefit most from the offering.
- `customer_pain_points`: Specific operational, economic, or technical frustrations solved.
- `target_segments`: Distinct segment profiles categorizing buyers by company size or role.

---

## BYOK & Privacy Model

LinkScope operates on an explicit **Bring-Your-Own-Key (BYOK)** model:

- **User-Provided Keys:** Users provide their personal Google Gemini API key generated via [Google AI Studio](https://aistudio.google.com/app/apikey).
- **Billing Relationship:** Users pay Google directly for API usage according to their Google Cloud / Google AI Studio account tier and pricing. LinkScope does not markup or broker API calls.
- **No Developer Key:** The server does not maintain or require a shared developer Gemini API key.
- **Server-Side In-Memory Encryption:** Keys are encrypted upon receipt using **AES-256-GCM** with a dedicated 32-byte server secret (`GEMINI_ENCRYPTION_KEY`) and unique 96-bit nonces. The plaintext key exists only ephemerally during active outbound calls to Google.
- **Anonymous Sessions:** Sessions are identified by high-entropy, 256-bit random tokens stored in an `HttpOnly` cookie. Sessions reside strictly in volatile server RAM and are automatically purged after the configured TTL (default: 24 hours) or when the user clicks **End Session**.
- **No Key Reflection:** The API key is never returned to the browser or echoed in responses after activation.
- **Sanitized Logging:** Application logging explicitly excludes request bodies, decrypted keys, authorization headers, and cookie values.
- **Third-Party Data Transmission:** When analysis is requested, extracted website content is transmitted to Google's Gemini API endpoints for processing. LinkScope does not provide end-to-end privacy from the upstream AI provider. Google's data processing and retention policies apply to data processed by the Gemini API.
- **No Unverifiable Guarantees:** LinkScope does not claim impossible guarantees such as zero-residual memory remanence or host-level cryptographic erasure beyond standard Node.js garbage collection and buffer overwrites.

---

## Local Installation

### Prerequisites
- **Node.js:** `v20.0.0` or higher (`v22+` LTS recommended).
- **npm:** `v10.0.0` or higher.
- A valid **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/linkscope.git
cd linkscope
```

### 2. Install Dependencies
```bash
npm install
```
*(On Windows PowerShell, use `npm.cmd install` if script execution policies prevent running `.ps1` wrappers).*

### 3. Configure Environment Variables
Copy the example environment configuration template:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Windows (CMD):**
```cmd
copy .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```

Generate a secure, random 32-byte master encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `.env` in your editor and paste the generated 64-character hex string into `GEMINI_ENCRYPTION_KEY`:
```env
NODE_ENV=development
PORT=4000
GEMINI_ENCRYPTION_KEY="paste_your_64_character_hex_key_here"
AI_PROVIDER="gemini"
AI_MODEL="gemini-3.1-flash-lite"
SESSION_KEY_TTL_SECONDS=86400
```
*(LinkScope uses local port `4000` by default).*

### 4. Start the Local Development Server
```bash
npm run dev
```

Open `http://localhost:4000` in your browser. Enter your Gemini API key on the activation landing page to begin.

---

## Environment Variables

All configuration is managed through environment variables loaded in [`server/config.ts`](./server/config.ts):

| Variable | Required? | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_ENCRYPTION_KEY` | **Yes (in prod)** | *None* | 32-byte secret (64 hex characters) used for AES-256-GCM encryption of in-memory session keys. Mandatory when `NODE_ENV=production`. |
| `PORT` | Optional | `4000` | The HTTP port on which the Express server listens. |
| `NODE_ENV` | Optional | `development` | Runtime environment mode (`development`, `production`, or `test`). |
| `AI_PROVIDER` | Optional | `gemini` | AI provider identifier (bound to Google Gemini). |
| `AI_MODEL` | Optional | `gemini-3.1-flash-lite` | Single verified model identifier used for analysis generation. |
| `SESSION_KEY_TTL_SECONDS` | Optional | `86400` (24h) | Session duration in seconds before automatic purge from server memory. Minimum: 60s. |
| `ALLOWED_ORIGINS` | Optional | *Localhost list* | Comma-separated list of additional allowed origins for CORS and CSRF validation. |

---

## Available Commands

Scripts defined in [`package.json`](./package.json):

| Command | Action | Execution Description |
| :--- | :--- | :--- |
| `npm run dev` | Development Server | Starts the backend via `tsx server.ts` with Vite development middleware attached for fast hot-module reloading (HMR) on port 4000. |
| `npm test` | Automated Tests | Runs the full 116-test suite using Node.js's native test runner (`tsx --test tests/**/*.test.ts`). Runs offline with zero API quota consumption. |
| `npm run lint` | TypeScript Check | Executes `tsc --noEmit` to verify type safety across frontend and backend codebases without emitting files. |
| `npm run build` | Production Build | 1. Runs `vite build` to bundle client SPA assets into `dist/`.<br>2. Runs `esbuild` to compile `server.ts` into a standalone Node.js ES module (`dist/server.js`). |
| `npm start` | Production Server | Runs `node dist/server.js`, serving pre-compiled client assets and handling API routes from a unified, production-optimized Node.js process. |
| `npm run preview` | Vite Preview | Spawns a local preview server for testing static client build outputs. |

### Development vs. Production Execution

- **Development (`npm run dev`):** Compiles TypeScript on the fly using `tsx`. Vite intercepts frontend requests to provide instant client updates via Hot Module Replacement.
- **Production (`npm run build` followed by `npm start`):** Vite generates minified static assets (`dist/assets/*.js`, `dist/index.html`). `esbuild` bundles all backend logic into a single standalone file (`dist/server.js`). The production server operates without Vite middleware, serving static assets efficiently with Express and standard caching headers.

---

## Security Architecture

LinkScope implements layered defensive security across all layers:

1. **AES-256-GCM In-Memory Credential Encryption:** Session keys are encrypted with authenticated AES-256-GCM using unique 96-bit initialization vectors (IVs) and 128-bit authentication tags. Plaintext keys are never stored in memory structures.
2. **HttpOnly & SameSite Session Cookies:** Session IDs are delivered via `HttpOnly`, `SameSite=Lax` cookies, preventing script access and defending against cross-site session theft.
3. **Cross-Site Request Forgery (CSRF) Defense:** Middleware inspects incoming `Origin` and `Host` headers on state-modifying requests (`POST`, `DELETE`). Requests from untrusted origins are rejected with `403 Forbidden`.
4. **CORS Allowlist:** Cross-origin resource sharing is restricted to explicitly configured trusted origins.
5. **Server-Side Request Forgery (SSRF) Protection:** The scraping pipeline validates target URLs before initiating HTTP requests, blocking:
   - Loopback addresses (`127.0.0.0/8`, `::1`, `localhost`)
   - RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
   - Carrier-grade NAT (`100.64.0.0/10`)
   - Link-local and cloud metadata endpoints (`169.254.169.254`, `fe80::/10`)
   - Non-HTTP(S) protocols (`file://`, `ftp://`, `gopher://`)
6. **DNS Rebinding Protection:** The scraper re-resolves and validates the target IP address on **every HTTP redirect hop**, ensuring a public domain cannot redirect to a protected internal network address.
7. **Redirect Bounds:** HTTP scraping limits redirects to a maximum of 5 hops to prevent circular redirection loops.
8. **In-Memory Rate Limiting:** State-changing endpoints are protected by an in-memory sliding-window rate limiter per client IP.
9. **Payload & Timeout Bounds:** Express JSON bodies are capped at `64kb`. Target page fetches enforce a strict 15-second timeout, while Gemini generation calls enforce bounded execution windows.
10. **Sanitized Error Responses:** In production (`NODE_ENV=production`), application stack traces are suppressed, returning generic, safe error descriptions to clients.
11. **HTTP Security Headers:** The server automatically sets:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Strict-Transport-Security` (on HTTPS / production)

---

## Deployment Overview

LinkScope is designed for straightforward containerized or server-based hosting. Full step-by-step instructions are documented in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

### Hosting Models Supported
- **Render Web Service:** One-click deployment via the included [`render.yaml`](./render.yaml) blueprint.
- **Docker Container:** Multi-stage [`Dockerfile`](./Dockerfile) produces a lean Alpine-based container running non-root on port 4000.
- **Google Cloud Run / AWS ECS:** Containerized microservice deployment.
- **Linux VPS (Ubuntu/Debian):** Standard deployment using Node.js 22, Systemd service management, and an Nginx reverse proxy for SSL termination.

### Single-Instance In-Memory Session Limitation
- **Volatile RAM Storage:** Because LinkScope uses an in-memory session store to avoid requiring an external database, **server restarts or new deployments invalidate active user sessions**. Users whose sessions are cleared simply re-enter their Gemini API key on the landing page.
- **Horizontal Scaling:** Deploying across multiple load-balanced instances requires **sticky sessions** (session affinity) so that requests from a specific user reach the instance holding their encrypted session, or implementing a shared Redis adapter for the `ISessionStore` interface.

Refer to [`DEPLOYMENT.md`](./DEPLOYMENT.md) for environment configuration, reverse proxy rules, and rollback procedures.

---

## Limitations

1. **In-Memory Session Volatility:** Active sessions do not persist across process restarts, deployments, or server crashes.
2. **Single-Instance Affinity:** Without sticky sessions or an external session store, the application must run as a single process instance.
3. **Upstream Gemini Dependency:** Generation speed, availability, and throughput depend entirely on Google's Gemini API status and the user's API quota.
4. **BYOK Requirement:** LinkScope cannot be used without a valid, personal Google Gemini API key.
5. **Scraping Constraints:** The content extraction pipeline fetches server-rendered HTML. It cannot evaluate complex single-page apps that require a full headless browser (such as Puppeteer) to render content, nor can it bypass Cloudflare Turnstile, CAPTCHAs, or anti-bot challenge pages.

---

## License & Contributions

### License Status
> **Notice to Repository Owner:** No formal software license (`LICENSE` file) is currently included in this repository. Before making this repository public or distributing it as open-source software, select and add an appropriate license (e.g., [MIT License](https://opensource.org/licenses/MIT) or [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)) to the root directory.

### Contributing
Contributions, bug reports, and suggestions are welcome once a formal license is added:
1. Fork the repository.
2. Create a descriptive feature branch (`git checkout -b feature/improved-extraction`).
3. Ensure all tests pass (`npm test`) and type checking succeeds (`npm run lint`).
4. Commit your changes with clear commit messages.
5. Open a Pull Request.

---

## Repository & Links

- **Repository:** `https://github.com/your-username/linkscope` *(placeholder — update upon publish)*
- **Issue Tracker:** `https://github.com/your-username/linkscope/issues` *(placeholder — update upon publish)*
- **Google AI Studio Key Generator:** [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Deployment Guide:** [`DEPLOYMENT.md`](./DEPLOYMENT.md)
