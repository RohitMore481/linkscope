# LinkScope — Privacy Policy (Draft)

*Notice: This document is a privacy policy draft for informational and technical documentation purposes.*

**Effective Date:** November 2026

---

## 1. Introduction

LinkScope is an anonymous, zero-database demo application. We operate on a strict **Anonymous Session Bring Your Own Key (BYOK)** model.

**LinkScope requires no user account, no password, no email, and no persistent database.**

---

## 2. Information We Process

1. **Anonymous Session Data:**
   - When you activate LinkScope, we generate a cryptographically random, anonymous session ID.
   - We store this session ID in a secure, `HttpOnly` browser cookie.
   - We collect no personal identifying information (no names, emails, IPs, or device fingerprints).

2. **Temporary Gemini API Keys:**
   - Your personal Gemini API key is collected solely to authenticate your analysis requests to Google's Gemini API on your behalf during an active session.
   - **Zero Database Persistence:** Your key is **never saved to a database, file, or persistent disk storage**.
   - **Encrypted in Memory:** The key is encrypted in server memory using **AES-256-GCM** authenticated encryption with a 32-byte master key (`GEMINI_ENCRYPTION_KEY`) and unique 96-bit nonces. Plaintext keys are never stored in memory or logs.
   - **Automatic Expiration:** When the session TTL expires (default: 24 hours), the key is automatically purged from memory.
   - **Immediate Deletion on Logout:** Clicking "End Session" immediately deletes the session and its encrypted key from server memory.

3. **Target Website URLs:**
   - Public website URLs submitted for analysis.
   - Extracted text is processed ephemerally in memory and passed to Gemini. We do not retain scraped website content.

---

## 3. Third-Party Data Transmission

- **Google Gemini API (Google LLC):** Extracted website text is sent to Google's Gemini models using **your personal API key**. Usage is governed by [Google AI Studio Terms of Service](https://ai.google.dev/terms).

---

## 4. Security Practices

- **Zero Plaintext Storage:** Keys are never stored in browser storage (`localStorage`, `sessionStorage`, cookies), application logs, or databases.
- **HttpOnly Cookies:** Session IDs cannot be accessed by client-side JavaScript.
- **CSRF Protection:** State-modifying requests validate Origin and Host headers.
- **SSRF Defense:** The website scraper strictly blocks private IPv4, loopback, cloud metadata (`169.254.169.254`), and non-public IPv6 addresses.
