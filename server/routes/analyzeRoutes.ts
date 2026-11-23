import { Router, Request, Response } from "express";
import { requireSession } from "../middleware/sessionMiddleware";
import { ApiKeyEncryptionService } from "../services/apiKeyEncryptionService";
import { ScraperService, ScrapeError } from "../services/scraperService";
import { AIService } from "../services/ai/aiService";
import { AIError } from "../services/ai/aiErrors";
import { RateLimiterService } from "../services/rateLimiterService";
import { config } from "../config";

export const analyzeRouter = Router();

const encryptionService = new ApiKeyEncryptionService();

export async function handleAnalysisRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.sessionData!.id;
  const encryptedKey = req.sessionData!.encryptedKey;
  const targetUrl = req.body?.url;
  const requestedModel = req.body?.model;

  if (typeof targetUrl !== "string" || !targetUrl.trim()) {
    res.status(400).json({
      error: "INVALID_URL",
      detail: "Please provide a valid website URL to analyze.",
    });
    return;
  }

  // 1. Rate limiting check per session
  const rateCheck = RateLimiterService.checkUserLimit(sessionId, 20, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: "RATE_LIMITED",
      detail: `Analysis rate limit exceeded. Please wait ${rateCheck.retryAfterSeconds} seconds before your next request.`,
    });
    return;
  }

  // 2. Concurrency lock check
  const lockAcquired = RateLimiterService.acquireConcurrencyLock(sessionId);
  if (!lockAcquired) {
    res.status(429).json({
      error: "CONCURRENT_REQUEST",
      detail: "An analysis is already in progress for your session. Please wait for it to complete.",
    });
    return;
  }

  const requestStartTime = Date.now();
  let decryptedKey: string | null = null;

  try {
    // 3. Decrypt session key in memory
    decryptedKey = encryptionService.decrypt(encryptedKey);

    // 4. Hardened SSRF-safe website scraping
    const scraped = await ScraperService.scrapeWebsite(targetUrl);

    // 5. Single configured model structured analysis
    const result = await AIService.analyzeWebsite(
      decryptedKey,
      scraped.promptText,
      { model: requestedModel || config.aiModel, sessionId }
    );

    const totalMs = Date.now() - requestStartTime;

    if (res.headersSent || res.writableEnded || res.socket?.destroyed) {
      return;
    }

    res.json({
      status: "success",
      url: scraped.url,
      analysis: result.analysis,
      meta: {
        model: result.modelUsed,
        provider: result.provider,
        input_chars: scraped.promptText.length,
        timings: {
          fetchMs: scraped.timings?.fetchDurationMs ?? 0,
          parseMs: scraped.timings?.parseDurationMs ?? 0,
          reduceMs: scraped.timings?.reduceDurationMs ?? 0,
          generationMs: result.timings?.generationDurationMs ?? 0,
          retryMs: result.timings?.retryDurationMs ?? 0,
          totalMs,
        },
        inferred_data_disclaimer:
          "Competitor profiles, weaknesses, opportunities, and search intents are AI-inferred from page content without live traffic or search volume data.",
      },
    });
  } catch (err) {
    if (res.headersSent || res.writableEnded || res.socket?.destroyed) {
      return;
    }
    if (err instanceof ScrapeError) {
      res.status(err.statusCode || 400).json({
        error: "SCRAPE_FAILED",
        detail: err.message,
      });
      return;
    }

    if (err instanceof AIError) {
      res.status(err.statusCode || 502).json({
        status: "error",
        error: err.code,
        message: err.message,
        detail: err.message,
        retryable: err.retryable,
      });
      return;
    }

    res.status(500).json({
      error: "ANALYSIS_FAILED",
      detail: err instanceof Error ? err.message : "An unexpected error occurred during analysis.",
    });
  } finally {
    // Release concurrency lock and clear ephemeral memory references
    RateLimiterService.releaseConcurrencyLock(sessionId);
    decryptedKey = null;
  }
}

// Canonical endpoint
analyzeRouter.post("/analyze", requireSession, handleAnalysisRequest);

// Versioned endpoint
analyzeRouter.post("/v1/analyze", requireSession, handleAnalysisRequest);

// Backward-compatible alias
analyzeRouter.post("/link-analysis", requireSession, handleAnalysisRequest);
