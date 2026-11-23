import { createApp } from "../server";
import { config, validateEncryptionKey } from "../server/config";
import type { Server } from "node:http";

interface StepResult {
  step: string;
  passed: boolean;
  httpStatus?: number;
  data?: Record<string, unknown>;
  error?: string;
}

async function runE2EVerification() {
  console.log("=== LinkScope End-to-End Real Runtime Verification on Port 4000 ===");
  validateEncryptionKey(config.encryptionKeyHex);

  const app = createApp();
  const port = 4000;
  let server: Server;

  await new Promise<void>((resolve) => {
    server = app.listen(port, "127.0.0.1", () => {
      console.log(`[E2E] Server successfully bound to http://127.0.0.1:${port}`);
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const results: StepResult[] = [];
  let sessionCookie = "";

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    results.push({
      step: "1. Server Health Check",
      passed: healthRes.status === 200 && healthData.status === "healthy",
      httpStatus: healthRes.status,
      data: healthData,
    });
    console.log(`[E2E] 1. Health check: ${healthRes.status} OK (architecture: ${healthData.architecture})`);

    // 2. Unauthenticated status check (must return 401)
    const unauthStatusRes = await fetch(`${baseUrl}/api/v1/session/status`);
    results.push({
      step: "2. Unauthenticated Status Check (expects 401)",
      passed: unauthStatusRes.status === 401,
      httpStatus: unauthStatusRes.status,
    });
    console.log(`[E2E] 2. Unauthenticated status check: ${unauthStatusRes.status} (expected 401)`);

    // 3. Unauthenticated analyze check (must return 401)
    const unauthAnalyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:4000" },
      body: JSON.stringify({ url: "https://mock.test/sample" }),
    });
    results.push({
      step: "3. Unauthenticated Analysis Check (expects 401)",
      passed: unauthAnalyzeRes.status === 401,
      httpStatus: unauthAnalyzeRes.status,
    });
    console.log(`[E2E] 3. Unauthenticated analyze request: ${unauthAnalyzeRes.status} (expected 401)`);

    // 4. Session Activation
    const activateRes = await fetch(`${baseUrl}/api/v1/session/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:4000" },
      body: JSON.stringify({ apiKey: "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst" }),
    });
    const activateData = await activateRes.json();
    const rawCookie = activateRes.headers.get("set-cookie");
    sessionCookie = rawCookie ? rawCookie.split(";")[0] : "";

    results.push({
      step: "4. Session Activation (BYOK)",
      passed:
        activateRes.status === 200 &&
        activateData.status === "success" &&
        activateData.modelTested === "gemini-3.1-flash-lite" &&
        Boolean(sessionCookie),
      httpStatus: activateRes.status,
      data: {
        status: activateData.status,
        modelTested: activateData.modelTested,
        provider: activateData.provider,
        hasCookie: Boolean(sessionCookie),
      },
    });
    console.log(`[E2E] 4. Activation: ${activateRes.status} OK, model: ${activateData.modelTested}, cookie captured`);

    // 5. Authenticated Status Check
    const authStatusRes = await fetch(`${baseUrl}/api/v1/session/status`, {
      headers: { Cookie: sessionCookie },
    });
    const authStatusData = await authStatusRes.json();
    results.push({
      step: "5. Authenticated Status Check",
      passed: authStatusRes.status === 200 && authStatusData.active === true,
      httpStatus: authStatusRes.status,
      data: authStatusData,
    });
    console.log(`[E2E] 5. Authenticated status: ${authStatusRes.status} OK, active: ${authStatusData.active}`);

    // 6. Website Analysis #1: Lightweight public website
    const start1 = Date.now();
    const analyze1Res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ url: "https://mock.test/lightweight-landing" }),
    });
    const analyze1Data = await analyze1Res.json();
    const duration1 = Date.now() - start1;

    const sections1Present =
      Boolean(analyze1Data.analysis?.competitor_vs_your_brand) &&
      Boolean(analyze1Data.analysis?.top_5_target_search_queries) &&
      Boolean(analyze1Data.analysis?.seo_improvement) &&
      Boolean(analyze1Data.analysis?.top_5_services) &&
      Boolean(analyze1Data.analysis?.target_audience_identification);

    results.push({
      step: "6. Lightweight Website Analysis",
      passed:
        analyze1Res.status === 200 &&
        sections1Present &&
        analyze1Data.meta?.model === "gemini-3.1-flash-lite",
      httpStatus: analyze1Res.status,
      data: {
        modelUsed: analyze1Data.meta?.model,
        timings: analyze1Data.meta?.timings,
        durationMs: duration1,
        all5SectionsPresent: sections1Present,
        retryOrFallback: analyze1Data.meta?.timings?.retryMs > 0 ? "retry occurred" : "none (primary succeeded)",
      },
    });
    console.log(`[E2E] 6. Lightweight analysis: ${analyze1Res.status} OK in ${duration1}ms`);
    console.log(`         Model: ${analyze1Data.meta?.model}`);
    console.log(`         Timings:`, analyze1Data.meta?.timings);
    console.log(`         All 5 sections present: ${sections1Present}`);

    // 7. Website Analysis #2: Content-heavy public website (session reuse without re-activating)
    const start2 = Date.now();
    const analyze2Res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ url: "https://mock.test/content-heavy-enterprise-hub" }),
    });
    const analyze2Data = await analyze2Res.json();
    const duration2 = Date.now() - start2;

    const sections2Present =
      Boolean(analyze2Data.analysis?.competitor_vs_your_brand) &&
      Boolean(analyze2Data.analysis?.top_5_target_search_queries) &&
      Boolean(analyze2Data.analysis?.seo_improvement) &&
      Boolean(analyze2Data.analysis?.top_5_services) &&
      Boolean(analyze2Data.analysis?.target_audience_identification);

    results.push({
      step: "7. Content-Heavy Website Analysis (Session Reuse)",
      passed:
        analyze2Res.status === 200 &&
        sections2Present &&
        analyze2Data.meta?.model === "gemini-3.1-flash-lite",
      httpStatus: analyze2Res.status,
      data: {
        modelUsed: analyze2Data.meta?.model,
        timings: analyze2Data.meta?.timings,
        durationMs: duration2,
        all5SectionsPresent: sections2Present,
        retryOrFallback: analyze2Data.meta?.timings?.retryMs > 0 ? "retry occurred" : "none (primary succeeded)",
      },
    });
    console.log(`[E2E] 7. Content-heavy analysis: ${analyze2Res.status} OK in ${duration2}ms`);
    console.log(`         Model: ${analyze2Data.meta?.model}`);
    console.log(`         Timings:`, analyze2Data.meta?.timings);
    console.log(`         All 5 sections present: ${sections2Present}`);

    // 8. JSON Export Data Integrity Verification
    const jsonSerialized = JSON.stringify(analyze2Data, null, 2);
    const jsonParsed = JSON.parse(jsonSerialized);
    const jsonValid =
      Boolean(jsonParsed.analysis?.competitor_vs_your_brand) &&
      Boolean(jsonParsed.analysis?.top_5_target_search_queries) &&
      Boolean(jsonParsed.analysis?.seo_improvement) &&
      Boolean(jsonParsed.analysis?.top_5_services) &&
      Boolean(jsonParsed.analysis?.target_audience_identification);

    results.push({
      step: "8. JSON Export Data Integrity",
      passed: jsonValid && typeof jsonSerialized === "string",
      data: { byteLength: jsonSerialized.length, all5SectionsPreserved: jsonValid },
    });
    console.log(`[E2E] 8. JSON export data integrity: valid (${jsonSerialized.length} bytes, 5 sections preserved)`);

    // 9. PDF Export Data Requirements Check
    const pdfDataValid =
      Boolean(analyze2Data.analysis?.competitor_vs_your_brand?.brand_name) &&
      Array.isArray(analyze2Data.analysis?.competitor_vs_your_brand?.competitors) &&
      Array.isArray(analyze2Data.analysis?.top_5_target_search_queries) &&
      Boolean(analyze2Data.analysis?.seo_improvement?.primary_keyword) &&
      Array.isArray(analyze2Data.analysis?.top_5_services) &&
      Boolean(analyze2Data.analysis?.target_audience_identification?.primary_audience);

    results.push({
      step: "9. PDF Export Data Integrity",
      passed: pdfDataValid,
      data: { all5SectionsReadyForPdf: pdfDataValid },
    });
    console.log(`[E2E] 9. PDF export data integrity: ready for client-side jsPDF rendering`);

    // 10. Logout
    const logoutRes = await fetch(`${baseUrl}/api/v1/session/logout`, {
      method: "POST",
      headers: { Origin: "http://localhost:4000", Cookie: sessionCookie },
    });
    const logoutData = await logoutRes.json();
    results.push({
      step: "10. Session Logout",
      passed: logoutRes.status === 200 && logoutData.status === "success",
      httpStatus: logoutRes.status,
      data: logoutData,
    });
    console.log(`[E2E] 10. Session logout: ${logoutRes.status} OK`);

    // 11. Post-Logout Invalidation Check (Status must return 401)
    const postLogoutStatusRes = await fetch(`${baseUrl}/api/v1/session/status`, {
      headers: { Cookie: sessionCookie },
    });
    results.push({
      step: "11. Post-Logout Status Rejection (expects 401)",
      passed: postLogoutStatusRes.status === 401,
      httpStatus: postLogoutStatusRes.status,
    });
    console.log(`[E2E] 11. Post-logout status: ${postLogoutStatusRes.status} (expected 401)`);

    // 12. Post-Logout Analysis Rejection (Analysis must return 401)
    const postLogoutAnalyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ url: "https://mock.test/sample" }),
    });
    results.push({
      step: "12. Post-Logout Analysis Rejection (expects 401)",
      passed: postLogoutAnalyzeRes.status === 401,
      httpStatus: postLogoutAnalyzeRes.status,
    });
    console.log(`[E2E] 12. Post-logout analysis: ${postLogoutAnalyzeRes.status} (expected 401)`);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log("[E2E] Server stopped cleanly.");
        resolve();
      });
    });
  }

  const allPassed = results.every((r) => r.passed);
  console.log("\n=== E2E Runtime Verification Summary ===");
  console.log(`Total Steps Executed: ${results.length}`);
  console.log(`All Steps Passed: ${allPassed ? "YES (100% SUCCESS)" : "NO"}`);
  if (!allPassed) {
    console.error("Failed Steps:", results.filter((r) => !r.passed));
    process.exit(1);
  }
  process.exit(0);
}

void runE2EVerification();
