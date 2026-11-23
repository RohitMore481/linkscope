import type { ModelCapability, ModelCompatibilityResult } from "./types";

interface CacheEntry {
  models: ModelCapability[];
  cachedAt: number;
  expiresAt: number;
}

/**
 * ModelDiscoveryCache stores live model discovery results per AI provider.
 * Guarantees:
 * - Never caches empty or failed results.
 * - Enforces TTL expiration (default 15 minutes).
 * - Can be invalidated explicitly on provider errors or configuration changes.
 */
export class ModelDiscoveryCache {
  private static cache: Map<string, CacheEntry> = new Map();
  private static defaultTtlMs = 15 * 60 * 1000; // 15 minutes TTL

  /**
   * Retrieves cached model capabilities for a provider, or null if expired or missing.
   */
  public static get(providerId: string): ModelCapability[] | null {
    const entry = this.cache.get(providerId.toLowerCase());
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(providerId.toLowerCase());
      return null;
    }

    return entry.models;
  }

  /**
   * Caches model capabilities for a provider with a configurable TTL.
   * Rejects empty or invalid model lists to prevent caching failure states.
   */
  public static set(
    providerId: string,
    models: ModelCapability[],
    ttlSeconds = 900
  ): void {
    if (!models || !Array.isArray(models) || models.length === 0) {
      return; // Do not cache empty or failed discovery
    }

    const now = Date.now();
    this.cache.set(providerId.toLowerCase(), {
      models,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    });
  }

  /**
   * Checks whether a non-expired cache entry exists for a provider.
   */
  public static isCached(providerId: string): boolean {
    return this.get(providerId) !== null;
  }

  /**
   * Explicitly invalidates the cache for a specific provider.
   */
  public static invalidate(providerId: string): void {
    this.cache.delete(providerId.toLowerCase());
  }

  /**
   * Clears cached models for a provider or all providers.
   */
  public static clear(providerId?: string): void {
    if (providerId) {
      this.cache.delete(providerId.toLowerCase());
    } else {
      this.cache.clear();
    }
  }
}

interface CapabilityCacheEntry {
  result: ModelCompatibilityResult;
  cachedAt: number;
  expiresAt: number;
}

/**
 * ModelCapabilityCache stores verified compatibility results (structured JSON support,
 * generateContent support, non-deprecation) for specific models.
 * Guarantees:
 * - Never caches transient probe failures as successful compatibility results.
 * - Enforces TTL (default 1 hour).
 * - Can be invalidated explicitly when models change.
 */
export class ModelCapabilityCache {
  private static capabilities: Map<string, CapabilityCacheEntry> = new Map();

  public static get(modelId: string): ModelCompatibilityResult | null {
    const key = modelId.toLowerCase().replace(/^models\//, "");
    const entry = this.capabilities.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.capabilities.delete(key);
      return null;
    }
    return entry.result;
  }

  public static set(modelId: string, result: ModelCompatibilityResult, ttlSeconds = 3600): void {
    // Only cache if compatibility is definitive (never cache undefined or transient failure states)
    if (!modelId || !result || typeof result.compatible !== "boolean") return;
    const key = modelId.toLowerCase().replace(/^models\//, "");
    const now = Date.now();
    this.capabilities.set(key, {
      result,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    });
  }

  public static invalidate(modelId: string): void {
    const key = modelId.toLowerCase().replace(/^models\//, "");
    this.capabilities.delete(key);
  }

  public static clear(): void {
    this.capabilities.clear();
  }
}

interface SessionModelEntry {
  modelId: string;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Caches the selected compatible model per user session to avoid re-running
 * discovery and scoring on every single scrape request.
 * Can be invalidated immediately if a model becomes unavailable or upon logout.
 */
export class SessionModelCache {
  private static sessionModels: Map<string, SessionModelEntry> = new Map();

  public static get(sessionId: string): string | null {
    const entry = this.sessionModels.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.sessionModels.delete(sessionId);
      return null;
    }
    return entry.modelId;
  }

  public static set(sessionId: string, modelId: string, ttlSeconds = 3600): void {
    if (!sessionId || !modelId) return;
    const now = Date.now();
    this.sessionModels.set(sessionId, {
      modelId,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    });
  }

  public static invalidate(sessionId: string): void {
    this.sessionModels.delete(sessionId);
  }

  public static clear(): void {
    this.sessionModels.clear();
  }
}
