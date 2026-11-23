import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isPrivateOrReservedIPv4,
  isNonPublicIP,
  validatePublicUrl,
  URLValidationError,
} from "../server/services/scraperService";

describe("Hardened Scraper & SSRF Defense Tests", () => {
  test("identifies private and reserved IPv4 ranges correctly", () => {
    // Loopback
    assert.strictEqual(isPrivateOrReservedIPv4("127.0.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIPv4("127.255.255.255"), true);

    // RFC 1918 Private
    assert.strictEqual(isPrivateOrReservedIPv4("10.0.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIPv4("172.16.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIPv4("172.31.255.255"), true);
    assert.strictEqual(isPrivateOrReservedIPv4("192.168.1.1"), true);

    // Link-local / Cloud metadata (AWS, GCP, Azure metadata 169.254.169.254)
    assert.strictEqual(isPrivateOrReservedIPv4("169.254.169.254"), true);

    // CGNAT RFC 6598
    assert.strictEqual(isPrivateOrReservedIPv4("100.64.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIPv4("100.127.255.255"), true);

    // Multicast & Reserved
    assert.strictEqual(isPrivateOrReservedIPv4("224.0.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIPv4("240.0.0.1"), true);

    // Public IPs (should return false)
    assert.strictEqual(isPrivateOrReservedIPv4("8.8.8.8"), false);
    assert.strictEqual(isPrivateOrReservedIPv4("1.1.1.1"), false);
    assert.strictEqual(isPrivateOrReservedIPv4("93.184.216.34"), false);
  });

  test("identifies non-public IPv6 addresses correctly", () => {
    assert.strictEqual(isNonPublicIP("::1"), true);
    assert.strictEqual(isNonPublicIP("::"), true);
    assert.strictEqual(isNonPublicIP("fe80::1"), true); // Link-local
    assert.strictEqual(isNonPublicIP("fc00::1"), true); // ULA
    assert.strictEqual(isNonPublicIP("fd12:3456:789a::1"), true); // ULA
    assert.strictEqual(isNonPublicIP("::ffff:127.0.0.1"), true); // IPv4-mapped loopback
    assert.strictEqual(isNonPublicIP("::ffff:192.168.1.1"), true); // IPv4-mapped private
    assert.strictEqual(isNonPublicIP("2001:db8::1"), true); // Documentation
  });

  test("rejects forbidden schemes (file://, ftp://, javascript:)", async () => {
    await assert.rejects(
      () => validatePublicUrl("file:///etc/passwd"),
      URLValidationError
    );
    await assert.rejects(
      () => validatePublicUrl("ftp://example.com/file"),
      URLValidationError
    );
    await assert.rejects(
      () => validatePublicUrl("javascript:alert(1)"),
      URLValidationError
    );
  });

  test("rejects blocked hostnames (localhost, metadata, etc.)", async () => {
    await assert.rejects(
      () => validatePublicUrl("http://localhost"),
      /Access to blocked host 'localhost' is not allowed/
    );
    await assert.rejects(
      () => validatePublicUrl("http://localhost:8080"),
      /Access to blocked host 'localhost' is not allowed/
    );
    await assert.rejects(
      () => validatePublicUrl("http://metadata.google.internal"),
      /Access to blocked host 'metadata.google.internal' is not allowed/
    );
    await assert.rejects(
      () => validatePublicUrl("http://app.local"),
      /Access to blocked host 'app.local' is not allowed/
    );
  });

  test("rejects direct private IP URLs", async () => {
    await assert.rejects(
      () => validatePublicUrl("http://127.0.0.1:3000"),
      /Access to non-public IP '127.0.0.1' is not allowed/
    );
    await assert.rejects(
      () => validatePublicUrl("http://169.254.169.254/latest/meta-data"),
      /Access to non-public IP '169.254.169.254' is not allowed/
    );
    await assert.rejects(
      () => validatePublicUrl("http://192.168.1.1"),
      /Access to non-public IP '192.168.1.1' is not allowed/
    );
  });

  test("rejects empty or whitespace URLs", async () => {
    await assert.rejects(
      () => validatePublicUrl("   "),
      /URL must not be empty/
    );
  });

  test("normalizes and accepts public URLs with public IP without requiring external network DNS", async () => {
    const validated = await validatePublicUrl("http://93.184.216.34/path");
    assert.strictEqual(validated, "http://93.184.216.34/path");
  });

  test("scrapeWebsite includes stage timings (fetch, parse, reduce) on scraped result", async () => {
    const { ScraperService } = await import("../server/services/scraperService");
    const result = await ScraperService.scrapeWebsite("https://mock.test/sample-landing");
    assert.ok(result.timings);
    assert.ok(typeof result.timings.fetchDurationMs === "number");
    assert.ok(typeof result.timings.parseDurationMs === "number");
    assert.ok(typeof result.timings.reduceDurationMs === "number");
    assert.ok(result.promptText.length > 0);
  });
});
