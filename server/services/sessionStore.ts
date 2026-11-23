import crypto from "node:crypto";
import { config } from "../config";

export const SESSION_COOKIE_NAME = "linkscope_session";

export interface SessionData {
  encryptedKey: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionStatus {
  active: boolean;
  expiresAt?: string;
  ttlRemaining?: number;
}

export interface ISessionStore {
  createSession(encryptedKey: string, ttlSeconds?: number): Promise<{ sessionId: string; expiresAt: Date; ttlSeconds: number }>;
  getSession(sessionId: string): Promise<SessionData | null>;
  deleteSession(sessionId: string): Promise<boolean>;
  getStatus(sessionId: string): Promise<SessionStatus>;
  clear?(): void;
}

export class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, SessionData>();
  private defaultTtlSeconds: number;

  constructor(defaultTtlSeconds = config.sessionKeyTtlSeconds) {
    this.defaultTtlSeconds = defaultTtlSeconds;

    // Periodic sweep for expired sessions (every 60s)
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, data] of this.sessions.entries()) {
        if (now > data.expiresAt.getTime()) {
          this.sessions.delete(id);
        }
      }
    }, 60 * 1000);
    if (cleanupTimer.unref) cleanupTimer.unref();
  }

  public async createSession(
    encryptedKey: string,
    ttlSeconds = this.defaultTtlSeconds
  ): Promise<{ sessionId: string; expiresAt: Date; ttlSeconds: number }> {
    // Generate unpredictable 256-bit cryptographically secure session ID
    const sessionId = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    this.sessions.set(sessionId, {
      encryptedKey,
      createdAt: now,
      expiresAt,
    });

    return { sessionId, expiresAt, ttlSeconds };
  }

  public async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId || typeof sessionId !== "string") return null;

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // If expired, immediately purge and return null
    if (Date.now() > session.expiresAt.getTime()) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;
    return this.sessions.delete(sessionId);
  }

  public async getStatus(sessionId: string): Promise<SessionStatus> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return { active: false };
    }

    const ttlRemaining = Math.max(
      0,
      Math.round((session.expiresAt.getTime() - Date.now()) / 1000)
    );

    return {
      active: true,
      expiresAt: session.expiresAt.toISOString(),
      ttlRemaining,
    };
  }

  public clear(): void {
    this.sessions.clear();
  }

  public get count(): number {
    return this.sessions.size;
  }
}

export const sessionStore: ISessionStore = new InMemorySessionStore();
