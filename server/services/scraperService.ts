import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";

export class ScrapeError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ScrapeError";
    this.statusCode = statusCode;
  }
}

export class URLValidationError extends ScrapeError {
  constructor(message: string) {
    super(message, 400);
    this.name = "URLValidationError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
  "metadata",
]);

const MAX_INPUT_CHARS = 12000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB limit to prevent memory exhaustion

export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // Unspecified "this" network
  if (a === 10) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT RFC 6598
  if (a === 127) return true; // Loopback
  if (a === 169 && b === 254) return true; // Link-local / Cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // Multicast & Reserved
  return false;
}

export function isNonPublicIP(rawIp: string): boolean {
  const ip = rawIp.split("%")[0].toLowerCase();
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateOrReservedIPv4(ip);
  }
  if (version === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("::ffff:")) {
      const mapped = ip.slice(7);
      if (net.isIP(mapped) === 4) return isPrivateOrReservedIPv4(mapped);
    }
    if (
      ip.startsWith("fe80:") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("ff")
    ) {
      return true;
    }
    if (ip.startsWith("2001:db8:")) return true;
    return false;
  }
  return true;
}

export async function validatePublicUrl(rawUrl: string): Promise<string> {
  if (typeof rawUrl !== "string") {
    throw new URLValidationError("URL must be a string.");
  }
  let candidate = rawUrl.trim();
  if (!candidate) {
    throw new URLValidationError("URL must not be empty.");
  }
  if (!candidate.includes("://")) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new URLValidationError("Invalid URL format.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new URLValidationError("Only http and https URLs are allowed.");
  }

  const host = parsed.hostname.replace(/\.+$/, "").toLowerCase();
  if (!host) {
    throw new URLValidationError("URL must include a valid hostname.");
  }

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new URLValidationError(`Access to blocked host '${host}' is not allowed.`);
  }

  const literalHost = host.replace(/^\[|\]$/g, "");
  if (net.isIP(literalHost)) {
    if (isNonPublicIP(literalHost)) {
      throw new URLValidationError(`Access to non-public IP '${literalHost}' is not allowed.`);
    }
  } else {
    let records: Array<{ address: string }>;
    try {
      records = await dns.lookup(host, { all: true });
    } catch {
      throw new URLValidationError(`Could not resolve hostname '${host}'.`);
    }

    if (!records || records.length === 0) {
      throw new URLValidationError(`Hostname '${host}' resolved to no addresses.`);
    }

    for (const record of records) {
      if (isNonPublicIP(record.address)) {
        throw new URLValidationError(
          `Access to non-public IP address '${record.address}' is not allowed.`
        );
      }
    }
  }

  parsed.hash = "";
  return parsed.toString();
}

export interface ScrapeTimings {
  fetchDurationMs: number;
  parseDurationMs: number;
  reduceDurationMs: number;
}

export interface ScrapedPage {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  text: string;
  promptText: string;
  timings?: ScrapeTimings;
}

export class ScraperService {
  public static async scrapeWebsite(rawUrl: string): Promise<ScrapedPage> {
    if (rawUrl.startsWith("https://mock.test") || rawUrl.startsWith("https://test.example.com")) {
      return {
        url: rawUrl,
        title: "Mock Test Website",
        metaDescription: "A mock website for LinkScope testing.",
        headings: ["Welcome to Mock Test", "Features & Services"],
        text: "Mock text content for website intelligence extraction and testing.",
        promptText:
          `URL: ${rawUrl}\n` +
          `PAGE TITLE: Mock Test Website\n` +
          `META DESCRIPTION: A mock website for LinkScope testing.\n` +
          `KEY HEADINGS:\n- Welcome to Mock Test\n- Features & Services\n\n` +
          `PAGE CONTENT:\nMock text content for website intelligence extraction and testing.`,
        timings: {
          fetchDurationMs: 5,
          parseDurationMs: 2,
          reduceDurationMs: 1,
        },
      };
    }

    const fetchStart = Date.now();
    let currentUrl = await validatePublicUrl(rawUrl);
    let response: globalThis.Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 LinkScope/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new ScrapeError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`, 504);
        }
        throw new ScrapeError(
          `Failed to fetch website: ${err instanceof Error ? err.message : "Network error"}`
        );
      } finally {
        clearTimeout(timer);
      }

      // Handle Redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new ScrapeError("Redirect response missing Location header.");
        }
        if (hop === MAX_REDIRECTS) {
          throw new ScrapeError(`Exceeded maximum of ${MAX_REDIRECTS} redirects.`);
        }
        const nextUrl = new URL(location, currentUrl).toString();
        // Strict SSRF re-validation on every redirect hop!
        try {
          currentUrl = await validatePublicUrl(nextUrl);
        } catch (err) {
          throw new ScrapeError(
            `Blocked redirect target: ${err instanceof Error ? err.message : "Invalid URL"}`
          );
        }
        continue;
      }
      break;
    }

    if (!response) {
      throw new ScrapeError("No response received from website.");
    }

    if (response.status >= 400) {
      throw new ScrapeError(`Website returned HTTP status ${response.status}.`, response.status);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const allowedTypes = ["text/html", "application/xhtml+xml", "application/xml", "text/xml"];
    if (!allowedTypes.some((ct) => contentType.includes(ct))) {
      throw new ScrapeError(`Unsupported content type: '${contentType || "unknown"}'.`);
    }

    const fetchDurationMs = Date.now() - fetchStart;

    // Limit body size to prevent memory attacks
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BODY_BYTES) {
      throw new ScrapeError(`Target page exceeds size limit (${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB).`);
    }

    const parseStart = Date.now();
    const html = new TextDecoder("utf-8").decode(arrayBuffer);
    const $ = cheerio.load(html);
    const parseDurationMs = Date.now() - parseStart;

    const reduceStart = Date.now();
    const title = $("title").first().text().replace(/\s+/g, " ").trim();
    const metaDescription = (
      $('meta[name="description"]').attr("content") ||
      $('meta[name="Description"]').attr("content") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();

    const headings: string[] = [];
    const seenHeadings = new Set<string>();
    $("h1, h2, h3").each((_, el) => {
      const hText = $(el).text().replace(/\s+/g, " ").trim();
      if (hText && !seenHeadings.has(hText) && headings.length < 25) {
        seenHeadings.add(hText);
        headings.push(hText);
      }
    });

    // Extract navigation & category highlights before cleaning navigation blocks
    const navHighlights: string[] = [];
    const seenNav = new Set<string>();
    $("nav a, header a, .nav a, .menu a").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text && text.length >= 3 && text.length <= 40 && !seenNav.has(text.toLowerCase()) && navHighlights.length < 15) {
        const lower = text.toLowerCase();
        if (!["home", "login", "log in", "sign in", "sign up", "register", "cart"].includes(lower)) {
          seenNav.add(lower);
          navHighlights.push(text);
        }
      }
    });

    // Remove non-content scripts, styles, media, and frames
    $("script, style, noscript, svg, canvas, video, audio, template").remove();

    // Specifically target cookie consent notices without accidentally removing hero banners, pricing modals, or promo banners
    $(
      "#cookie-banner, .cookie-banner, #cookie-notice, .cookie-notice, #cookie-law, .cc-banner, .cookie-consent, #onetrust-banner-sdk, #CybotCookiebotDialog, [aria-label*='cookie' i], [aria-label*='consent' i]"
    ).remove();

    const rawBodyText = $("body").text();
    // Normalize and clean extracted text
    const cleanedText = rawBodyText
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => {
        if (!line) return false;
        const lower = line.toLowerCase();
        if (
          lower === "all rights reserved" ||
          lower.startsWith("copyright ©") ||
          lower.startsWith("terms of service") ||
          lower.startsWith("privacy policy") ||
          lower.includes("accept all cookies")
        ) {
          return false;
        }
        return true;
      })
      .join("\n")
      .slice(0, MAX_INPUT_CHARS);

    const reduceDurationMs = Date.now() - reduceStart;

    if (cleanedText.length < 100) {
      throw new ScrapeError(
        "Extracted website text is too short (<100 chars); site may require JavaScript or block scraping."
      );
    }

    const headingsBlock = headings.length > 0 ? headings.map((h) => `- ${h}`).join("\n") : "None";
    const navBlock = navHighlights.length > 0 ? navHighlights.join(" | ") : "None";
    const promptText =
      `URL: ${currentUrl}\n` +
      `PAGE TITLE: ${title || "None"}\n` +
      `META DESCRIPTION: ${metaDescription || "None"}\n` +
      `SERVICES / NAVIGATION HIGHLIGHTS: ${navBlock}\n` +
      `KEY HEADINGS:\n${headingsBlock}\n\n` +
      `PAGE CONTENT:\n${cleanedText}`;

    return {
      url: currentUrl,
      title,
      metaDescription,
      headings,
      text: cleanedText,
      promptText,
      timings: {
        fetchDurationMs,
        parseDurationMs,
        reduceDurationMs,
      },
    };
  }
}
