import { Request, Response, NextFunction } from "express";
import { sessionStore, SESSION_COOKIE_NAME } from "../services/sessionStore";

export interface ActiveSessionContext {
  id: string;
  encryptedKey: string;
}

declare global {
  namespace Express {
    interface Request {
      sessionData?: ActiveSessionContext;
    }
  }
}

/**
 * Extracts and verifies the anonymous session ID from HttpOnly cookie or x-session-id header.
 * Derives session identity strictly from the verified session store, NEVER from request bodies.
 */
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cookieSessionId = req.cookies?.[SESSION_COOKIE_NAME];
  const headerSessionId = req.headers["x-session-id"] as string | undefined;

  const sessionId = cookieSessionId || headerSessionId;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(401).json({
      error: "UNAUTHORIZED",
      detail: "Active session required. Please activate LinkScope with your Gemini API key.",
    });
    return;
  }

  const session = await sessionStore.getSession(sessionId.trim());
  if (!session) {
    res.status(401).json({
      error: "SESSION_EXPIRED",
      detail: "Your session has expired or is invalid. Please re-enter your Gemini API key.",
    });
    return;
  }

  req.sessionData = {
    id: sessionId.trim(),
    encryptedKey: session.encryptedKey,
  };

  next();
}
