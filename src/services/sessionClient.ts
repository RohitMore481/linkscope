import type { LinkAnalysisResponse } from "../types/analysis";

export interface SessionStatusResponse {
  active: boolean;
  expiresAt?: string;
  ttlRemaining?: number;
}

export interface SessionActivateResponse {
  status: string;
  message: string;
  expiresAt: string;
  ttlSeconds: number;
}

export class SessionClient {
  public static async getStatus(): Promise<SessionStatusResponse> {
    const res = await fetch("/api/v1/session/status", {
      credentials: "include",
    });

    if (!res.ok) {
      return { active: false };
    }

    return res.json();
  }

  public static async activate(apiKey: string): Promise<SessionActivateResponse> {
    const res = await fetch("/api/v1/session/activate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.detail || "Session activation failed.");
    }

    return data;
  }

  public static async logout(): Promise<void> {
    await fetch("/api/v1/session/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      // Ignore network errors during logout
    });
  }

  public static async analyze(url: string, signal?: AbortSignal): Promise<LinkAnalysisResponse> {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ url: url.trim() }),
      signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        data && typeof data.detail === "string"
          ? data.detail
          : `Request failed with status ${res.status}.`;
      throw new Error(message);
    }

    return data as LinkAnalysisResponse;
  }
}
