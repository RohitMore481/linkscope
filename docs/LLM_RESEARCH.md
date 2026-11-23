# LinkScope — LLM Model Evaluation & Provider Research Report

**Dxora Technologies Practical Test — AI Model Comparison & Strategy**<br>
*Verification Date: November 24, 2026*

This research report documents the comparative evaluation of leading Large Language Model (LLM) providers and architectures for the **LinkScope AI-Powered Website Link Analysis Platform**.

---

## 1. Executive Summary & Selection Matrix

LinkScope extracts unstructured HTML from public websites and transforms it into a strictly typed, 5-section business intelligence report (`competitor_vs_your_brand`, `top_5_target_search_queries`, `seo_improvement`, `top_5_services`, `target_audience_identification`).

The model evaluation prioritizes five critical engineering criteria:
1. **Schema Adherence & Structured Outputs:** Zero syntax errors or markdown hallucination.
2. **Context Capacity:** Minimum 32,000 tokens to ingest comprehensive website content.
3. **Execution Latency:** Sub-4-second response time for end-user dashboard fluidity.
4. **Economic Viability (BYOK Model):** Accessible pricing, prompt caching, and transparent billing.
5. **Analytical Reasoning:** Ability to distinguish researched facts from strategic inferences.

| Model Identifier | Provider | Lifecycle Status | Context Window (In / Out) | Documented Standard Pricing (In / Out per 1M) | Structured Output Mechanism | Latency Profile | Documentation Source URL | Production Fit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`gemini-3.1-flash-lite`** | Google (Gemini API) | **Active (Selected)** | **1,048,576** / 8,192 | **$0.25** / **$1.50** *(Free tier available on AI Studio)* | Native `response_schema` (JSON Schema) | **1.82s – 3.15s** *(Measured in LinkScope)* | [ai.google.dev/pricing](https://ai.google.dev/gemini-api/docs/pricing) | **Optimal Primary** |
| **`deepseek-flash`** (V4.1 Flash) | DeepSeek | **Active** | 64,000 / 8,192 | Peak: **$0.30** / **$1.20**<br>Off-Peak: **$0.15** / **$0.60** | `json_object` mode (Prompt-guided) | ~2.0s – 3.8s *(Estimated)* | [api-docs.deepseek.com](https://api-docs.deepseek.com/quick_start/pricing/) | Cost-Effective Alternative |
| **`claude-haiku-5-5`** | Anthropic | **Active** | 200,000 / 8,192 | **$0.10** (<100K) / **$0.50** *(Cache read: $0.01)* | Tool Calling (`input_schema`) | ~2.0s – 3.5s *(Estimated)* | [anthropic.com/claude-haiku-5-5](https://www.anthropic.com/claude-haiku-5-5) | High-Capability Alternative |
| **`claude-haiku-4-5`** | Anthropic | **Active (Previous Gen)** | 200,000 / 8,192 | **$1.00** / **$5.00** *(Cache read: $0.10)* | Tool Calling (`input_schema`) | ~2.2s – 4.0s *(Estimated)* | [anthropic.com/claude/haiku](https://www.anthropic.com/claude/haiku) | Premium Analytical Tier |
| **`gpt-4o-mini`** | OpenAI | **Deprecated** | 128,000 / 16,384 | $0.15 / $0.60 *(Cached read: $0.075)* | Native `json_schema` with `strict: true` | ~2.0s – 3.8s *(Estimated)* | [developers.openai.com](https://developers.openai.com/api/docs/models/gpt-4o-mini) | Not Recommended (Deprecated) |

---

## 2. In-Depth Model Profiles

### A. Google Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`) — *Active Implementation*

- **Provider:** Google Gemini Developer API
- **Model ID:** `gemini-3.1-flash-lite`
- **Lifecycle Status:** Active production model.
- **Context Capacity:** 1,048,576 tokens input / 8,192 tokens output.
- **Documented Standard Paid Pricing:**
  - Prompt (<128k tokens): **$0.25 / million tokens**
  - Completion: **$1.50 / million tokens**
  - *Free Tier Note:* Google AI Studio offers a free-of-charge tier (subject to 15 RPM / 1,500 RPD rate limits). Note that free-tier availability is subject to regional eligibility and Google's operational quota allocations; it is not universally guaranteed for all accounts or commercial deployments.
- **Documentation Source:** [Google AI Pricing](https://ai.google.dev/gemini-api/docs/pricing) & [Gemini Models Reference](https://ai.google.dev/gemini-api/docs/models/gemini) *(Checked: November 24, 2026)*
- **Structured Output Mechanism:** Native JSON schema contract via `response_mime_type="application/json"` and `response_schema=LinkAnalysisData`.
- **Latency Performance:** **1.82s – 3.15s** *(Empirically measured during live LinkScope runs generating ~950 output tokens)*.
- **Evaluation:**
  - **Strengths:**
    - High-throughput, low-latency architecture optimized for agentic extraction workflows.
    - 1,048,576 token input context ensures extensive public web documents, documentation trees, and footers are processed without heuristic truncation.
    - Native Pydantic v2 schema adherence guarantees 100% syntactic compliance without synthetic tool call scaffolding.
    - End-users can leverage personal Bring-Your-Own-Key credentials directly from Google AI Studio.
  - **Weaknesses:**
    - Transient upstream 503 / `UNAVAILABLE` errors can occur during peak global usage windows (safely handled via LinkScope's bounded exponential retry logic).

---

### B. DeepSeek V4.1 Flash (`deepseek-flash`) — *Active Cost-Effective Candidate*

- **Provider:** DeepSeek API
- **Model ID:** `deepseek-flash`
- **Lifecycle Status:** Active production model.
- **Context Capacity:** 64,000 tokens input / 8,192 tokens output.
- **Documented Pricing (Peak vs. Off-Peak):**
  - **Peak Hours:** 01:00–04:00 and 06:00–10:00 UTC, Monday to Friday, excluding Chinese public holidays.
    - Input (Uncached Miss): **$0.300 / million tokens**
    - Input (Cached Hit): **$0.006 / million tokens** (98% cache discount)
    - Output: **$1.200 / million tokens**
  - **Off-Peak Hours:** All hours outside peak windows, weekends, and Chinese public holidays.
    - Input (Uncached Miss): **$0.150 / million tokens** (50% discount)
    - Input (Cached Hit): **$0.003 / million tokens**
    - Output: **$0.600 / million tokens** (50% discount)
- **Documentation Source:** [DeepSeek Platform Pricing](https://api-docs.deepseek.com/quick_start/pricing/) *(Checked: November 24, 2026)*
- **Structured Output Mechanism:** `response_format={"type": "json_object"}`.
- **Latency Performance:** **~2.0s – 3.8s** *(Estimated based on public API benchmark reports)*.
- **Evaluation:**
  - **Strengths:**
    - Extremely low cached input rates ($0.003 to $0.006 per million tokens).
    - Substantial 50% savings across uncached and output tokens during off-peak hours.
    - Standard OpenAI-compatible REST interface.
  - **Weaknesses:**
    - Smallest context capacity (64,000 tokens) among evaluated models.
    - JSON object mode guarantees valid JSON syntax but does not mathematically enforce strict Pydantic schema validation at generation time; requires post-generation validation.

---

### C. Anthropic Claude Haiku 5.5 (`claude-haiku-5-5`) — *Active Latest Anthropic Candidate*

- **Provider:** Anthropic API
- **Model ID:** `claude-haiku-5-5`
- **Lifecycle Status:** Active production model (latest generation).
- **Context Capacity:** 200,000 tokens input / 8,192 tokens output.
- **Documented Pricing:**
  - Prompt (<100K tokens, Uncached): **$0.100 / million tokens**
  - Prompt (Cache Read): **$0.010 / million tokens** (90% discount on cache hits)
  - Completion: **$0.500 / million tokens**
- **Documentation Source:** [Anthropic Claude Haiku 5.5 Overview](https://www.anthropic.com/claude-haiku-5-5) *(Checked: November 24, 2026)*
- **Structured Output Mechanism:** Tool use / function calling (`tool_choice={"type": "tool", "name": "link_analysis"}`).
- **Latency Performance:** **~2.0s – 3.5s** *(Estimated based on published Anthropic API generation benchmarks)*.
- **Evaluation:**
  - **Strengths:**
    - Highly competitive baseline pricing ($0.10 / $0.50 per million tokens) with superior semantic reasoning for brand positioning.
    - 200,000 token context window easily accommodates full website structures.
  - **Weaknesses:**
    - Requires wrapping JSON schemas in synthetic tool declarations.
    - No free tier for end-user BYOK keys; requires active prepaid developer credits.

---

### D. Anthropic Claude Haiku 4.5 (`claude-haiku-4-5`) — *Active (Previous Generation)*

- **Provider:** Anthropic API
- **Model ID:** `claude-haiku-4-5`
- **Lifecycle Status:** Active production model (previous generation; retained for comparison against Haiku 5.5).
  - *Lifecycle Predecessor Note:* Claude 3.5 Haiku was officially retired on February 19, 2026 (Documentation: [Anthropic Model Deprecations](https://docs.anthropic.com/en/docs/about-claude/model-deprecations)).
- **Context Capacity:** 200,000 tokens input / 8,192 tokens output.
- **Documented Standard Pricing:**
  - Prompt (Uncached): **$1.00 / million tokens** (10x Haiku 5.5 prompt rate)
  - Prompt (Cache Read): **$0.10 / million tokens**
  - Prompt (Cache Write): **$1.25 / million tokens**
  - Completion: **$5.00 / million tokens** (10x Haiku 5.5 completion rate)
- **Documentation Source:** [Anthropic Claude Haiku Overview](https://www.anthropic.com/claude/haiku) *(Checked: November 24, 2026)*
- **Structured Output Mechanism:** Tool use / function calling (`tool_choice={"type": "tool", "name": "link_analysis"}`).
- **Latency Performance:** **~2.2s – 4.0s** *(Estimated based on published Anthropic API generation benchmarks)*.
- **Evaluation:**
  - **Strengths:** Excellent qualitative extraction and competitor weakness identification.
  - **Weaknesses:** Substantially superseded by Claude Haiku 5.5 in cost-efficiency and performance.

---

### E. OpenAI GPT-4o-mini (`gpt-4o-mini`) — *Deprecated Baseline (Historical Comparison Only)*

- **Provider:** OpenAI API
- **Model ID:** `gpt-4o-mini`
- **Lifecycle Status:** **Deprecated.** Marked deprecated on official OpenAI documentation ([developers.openai.com/api/docs/models/gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)).
- **Production Recommendation:** **Do not integrate into new production systems.** Retained here solely for baseline historical benchmarking.
- **Context Capacity:** 128,000 tokens input / 16,384 tokens output.
- **Documented Historical Pricing:**
  - Prompt (Uncached): **$0.150 / million tokens**
  - Prompt (Cached Read): **$0.075 / million tokens**
  - Completion: **$0.600 / million tokens**
- **Documentation Source:** [OpenAI Model Documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini) *(Checked: November 24, 2026)*
- **Structured Output Mechanism:** Native `response_format={"type": "json_schema", "json_schema": {"strict": True, ...}}`.
- **Latency Performance:** **~2.0s – 3.8s** *(Estimated based on historical API benchmarks for ~1,000 tokens output)*.
- **Evaluation:**
  - **Strengths:** Historical pioneer of `strict: true` grammar-constrained schema generation.
  - **Weaknesses:** Deprecated status makes it unsuitable for forward-looking architectures.

---

## 3. Cost-Per-Analysis Benchmark & Recalculation

To evaluate operational economics, we model a typical LinkScope link analysis execution with explicit token assumptions:
- **Input Tokens:** 3,500 tokens (system instructions + Pydantic schema declaration + scraped HTML headings, metadata, and core semantic body copy).
- **Output Tokens:** 1,000 tokens (5 structured sections comprising brand positioning, 5 search queries, SEO keywords, 5 services, and audience personas).

### Exact Cost Formula:
$$\text{Cost} = (\text{Input Tokens} \times \text{Input Price per Token}) + (\text{Output Tokens} \times \text{Output Price per Token})$$

### Distinguishing Uncached vs. Cached Input:
- **Uncached Input:** Initial domain scrape where prompt and content are sent without cache re-use.
- **Cached Input:** Subsequent queries against identical domain prompts benefiting from provider prefix caching.

| Model Candidate | Scenario / Cache State | Input Cost (3,500 tokens) | Output Cost (1,000 tokens) | Total Cost per Analysis | Analyses per \$1.00 USD | Official Documentation Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.1 Flash-Lite** *(Active)* | **Standard Paid (Uncached)** | **\$0.0008750** | **\$0.0015000** | **\$0.0023750** (~**\$0.00238**) | **~421 analyses** | [ai.google.dev/pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| DeepSeek V4.1 Flash (`deepseek-flash`) | Peak — Uncached (Cache Miss) | \$0.0010500 | \$0.0012000 | **\$0.0022500** (~**\$0.00225**) | **~444 analyses** | [api-docs.deepseek.com](https://api-docs.deepseek.com/quick_start/pricing/) |
| DeepSeek V4.1 Flash (`deepseek-flash`) | Peak — Cached (Cache Hit) | \$0.0000210 | \$0.0012000 | **\$0.0012210** (~**\$0.00122**) | **~819 analyses** | [api-docs.deepseek.com](https://api-docs.deepseek.com/quick_start/pricing/) |
| DeepSeek V4.1 Flash (`deepseek-flash`) | Off-Peak — Uncached (Cache Miss) | \$0.0005250 | \$0.0006000 | **\$0.0011250** (~**\$0.00113**) | **~889 analyses** | [api-docs.deepseek.com](https://api-docs.deepseek.com/quick_start/pricing/) |
| DeepSeek V4.1 Flash (`deepseek-flash`) | Off-Peak — Cached (Cache Hit) | \$0.0000105 | \$0.0006000 | **\$0.0006105** (~**\$0.00061**) | **~1,638 analyses** | [api-docs.deepseek.com](https://api-docs.deepseek.com/quick_start/pricing/) |
| Claude Haiku 5.5 | Uncached Prompt (<100K) | \$0.0003500 | \$0.0005000 | **\$0.0008500** (~**\$0.00085**) | **~1,176 analyses** | [anthropic.com/claude-haiku-5-5](https://www.anthropic.com/claude-haiku-5-5) |
| Claude Haiku 5.5 | Cached Prompt Read | \$0.0000350 | \$0.0005000 | **\$0.0005350** (~**\$0.00054**) | **~1,869 analyses** | [anthropic.com/claude-haiku-5-5](https://www.anthropic.com/claude-haiku-5-5) |
| Claude Haiku 4.5 (Previous Gen) | Uncached Prompt | \$0.0035000 | \$0.0050000 | **\$0.0085000** (~**\$0.00850**) | **~117 analyses** | [anthropic.com/claude/haiku](https://www.anthropic.com/claude/haiku) |
| Claude Haiku 4.5 (Previous Gen) | Cached Prompt Read | \$0.0003500 | \$0.0050000 | **\$0.0053500** (~**\$0.00535**) | **~186 analyses** | [anthropic.com/claude/haiku](https://www.anthropic.com/claude/haiku) |
| *GPT-4o-mini (Deprecated)* | *Uncached Prompt* | *\$0.0005250* | *\$0.0006000* | *\$0.0011250 (~$0.00113)* | *~888 analyses* | [developers.openai.com](https://developers.openai.com/api/docs/models/gpt-4o-mini) |
| *GPT-4o-mini (Deprecated)* | *Cached Prompt Read* | *\$0.0002625* | *\$0.0006000* | *\$0.0008625 (~$0.00086)* | *~1,159 analyses* | [developers.openai.com](https://developers.openai.com/api/docs/models/gpt-4o-mini) |

---

## 4. Reasoned Strategic Recommendation

### Selected Primary Implementation: `gemini-3.1-flash-lite`
For LinkScope's BYOK consumer and small-business user experience, **Google Gemini 3.1 Flash-Lite** remains the optimal architectural choice:
1. **BYOK Accessibility:** Users can self-provision personal API keys on [Google AI Studio](https://aistudio.google.com/app/apikey) with minimal onboarding overhead.
2. **Deterministic Speed:** Empirically measured generation durations consistently land between 1.82s and 3.15s for the full 5-section LinkScope report.
3. **Massive Context Budget:** The 1,048,576 token window allows ingesting extensive web copy, legal notices, and navigation hierarchies without truncation risk.
4. **Reliable Pydantic Enforcement:** Native structured outputs (`response_schema`) guarantee 100% schema compliance.

### Documented Alternatives & Deprecations:
- **`deepseek-flash` (DeepSeek V4.1 Flash):** Outstanding secondary alternative for high-volume batch workloads due to off-peak pricing and aggressive cache discounts ($0.003 / 1M cached prompt).
- **`claude-haiku-5-5`:** Outstanding state-of-the-art alternative candidate if a paid enterprise tier requires advanced qualitative brand reasoning with competitive pricing ($0.10 / $0.50 per million tokens).
- **`claude-haiku-4-5`:** Retained for previous-generation baseline context.
- **`gpt-4o-mini`:** Officially deprecated; retained for historical context only and explicitly not recommended for new integrations.
- *Architectural Note:* In accordance with LinkScope's single-model design, automatic runtime fallback is disabled to keep response latency deterministic and debugging transparent.
