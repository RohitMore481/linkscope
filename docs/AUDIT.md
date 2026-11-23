# LinkScope — Repository Audit Report

**Date:** November 2026  
**Auditor:** LinkScope Core Engineering Team  
**Objective:** Architecture review and security audit for BYOK (Bring Your Own Key) production transformation.

---

## 1. Executive Summary

LinkScope is an AI-powered website intelligence application that allows users to input a public URL, scrape its content, analyze competitive positioning, search queries, SEO keywords, services, and audience segments using Google's Gemini models, and export findings as JSON or formatted PDF reports.

The codebase currently runs as a single Node.js process using Express.js and Vite (`server.ts`), serving a React 19 single-page application.

Prior to BYOK implementation, the application relied on a single server-side `GEMINI_API_KEY` environment variable. Transforming the application into a publicly hostable multi-tenant BYOK system requires:
1. User identity management (Supabase Auth).
2. Per-user encrypted API key storage (AES-256-GCM authenticated encryption).
3. Runtime per-request Gemini client instantiation using decrypted user credentials.
4. Hardened SSRF defenses for the website scraper with DNS rebinding protection.
5. In-memory and per-user abuse prevention / rate limiting.
6. A responsive frontend onboarding and settings interface for API key management.

---

## 2. Repository Inventory & Role Analysis

| File / Directory | Type / Language | Active Status | Purpose & Observations |
| :--- | :--- | :--- | :--- |
| `server.ts` | TypeScript / Node.js | **Active Primary Server** | Starts Express server, binds port, integrates Vite dev server in non-production, exposes `/api/link-analysis` and `/api/health`, performs Cheerio web scraping, and calls Google Gemini API. |
| `package.json` | JSON | **Active** | Manages Node dependencies, scripts (`dev`, `build`, `start`, `lint`, `test`). Uses React 19, Vite 8, Tailwind CSS 4, `@google/genai`, `cheerio`, `jspdf`, `express`. |
| `vite.config.ts` | TypeScript | **Active** | Vite configuration with `@tailwindcss/vite` and `@vitejs/plugin-react`. |
| `src/App.tsx` | TypeScript / React | **Active** | Root component, navigation bar, section tab routing, reset handler. |
| `src/components/AnalysisForm.tsx` | TypeScript / React | **Active** | Main user dashboard: URL input, sample URL chips, analysis trigger, competitor cards, query table, SEO recommendations, service list, audience matrix, PDF/JSON export. |
| `src/types/analysis.ts` | TypeScript | **Active** | Core domain interfaces for report structure (`LinkAnalysisData`, `LinkAnalysisResponse`, etc.). |
| `src/utils/exportPdf.ts` | TypeScript | **Active** | Multi-page client-side PDF generation using `jspdf`. |
| `app/` (`config.py`, `prompts.py`, `services/`, `utils/`) | Python | **Legacy / Reference** | A standalone Python prototype for scraping and LLM analysis. No entrypoint (no `main.py`, Flask, or FastAPI), no `requirements.txt`. Kept untouched for reference without interfering with the Node.js application. |
| `.env.example` | Config | **Active** | Environment variable template. |

---

## 3. End-to-End Request Lifecycle (Existing vs BYOK)

### Existing Single-Tenant Flow:
1. User enters URL in `AnalysisForm.tsx`.
2. Frontend calls `POST /api/link-analysis` with `{ url }`.
3. Express server validates URL using basic DNS resolution.
4. Server scrapes target page using `cheerio` and `fetch`.
5. Server calls Gemini API using a single global `process.env.GEMINI_API_KEY`.
6. Gemini responds with structured JSON.
7. Server returns JSON response to frontend.
8. Frontend renders dashboard and allows PDF/JSON download.

### New Multi-Tenant BYOK Flow:
1. User signs up / logs in via Supabase Auth (JWT issued to client).
2. Client checks `GET /api/v1/user/api-key/status`.
3. If unconfigured, user enters their personal Gemini API key via onboarding / settings.
4. Client calls `POST /api/v1/user/api-key` with Bearer token.
5. Server validates token, performs live validation with Gemini API, encrypts key via `AES-256-GCM` using `GEMINI_ENCRYPTION_KEY`, and stores ciphertext in `user_api_keys` table.
6. User enters website URL to analyze.
7. Client calls `POST /api/v1/analyze` with `{ url }` and `Authorization: Bearer <token>`.
8. Server verifies user identity, fetches user's encrypted key from DB, and decrypts key in memory.
9. Server performs hardened SSRF-safe scraping with DNS rebinding protection and redirect re-validation.
10. Server creates an isolated Gemini client instance with user's key and runs analysis.
11. Results are returned to client; memory references to decrypted key are immediately dereferenced.

---

## 4. Security Findings & Mitigation Plan

1. **SSRF Risks in Scraper:**
   - *Finding:* Target URLs could point to internal network services (e.g., `127.0.0.1`, cloud metadata `169.254.169.254`, IPv6 loopback `::1`, or DNS rebinding domains).
   - *Mitigation:* Comprehensive IP range validation (IPv4 RFC 1918, CGNAT, link-local, multicast, documentation; IPv6 ULA, link-local, loopback, IPv4-mapped). Re-check IP resolution on every HTTP redirect hop. Prevent DNS rebinding by pinning validated addresses or verifying sockets.

2. **Plaintext Secret Exposure:**
   - *Finding:* Users providing API keys must never have their keys stored in browser storage (localStorage, sessionStorage, cookies) or in plaintext in databases or logs.
   - *Mitigation:* Frontend keeps keys strictly in ephemeral React state during verification. Backend encrypts keys via `AES-256-GCM` with random 96-bit IV and 128-bit auth tags. Master encryption key loaded via `GEMINI_ENCRYPTION_KEY` env var. Database columns only store encrypted blobs. Server logs redact all sensitive fields.

3. **Multi-Tenant Authorization & ID Spoofing:**
   - *Finding:* Frontend must never be able to request analysis or key changes using another user's ID.
   - *Mitigation:* User ID is always extracted from the verified Supabase Auth JWT token on the server side (`req.user.id`). Client-supplied user IDs in request bodies or query parameters are ignored.

4. **Resource Exhaustion & Abuse:**
   - *Finding:* Malicious users could spam scraping endpoints, leading to server denial of service or proxy IP bans.
   - *Mitigation:* Rate limiting per user and per IP, concurrent analysis limits (1 active analysis per user), max payload limits, strict scraping timeouts (8s) and max redirect limits (3 hops).
