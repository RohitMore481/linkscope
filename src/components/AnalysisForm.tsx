import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileDown,
  Globe,
  Loader2,
  Search,
} from "lucide-react";

import type { LinkAnalysisResponse } from "../types/analysis";
import { exportAnalysisToPdf } from "../utils/exportPdf";

import { SessionClient } from "../services/sessionClient";

export type DashboardSection =
  | "all"
  | "competitors"
  | "queries"
  | "seo"
  | "services-audience";

interface AnalysisFormProps {
  activeSection?: DashboardSection;
  onSectionChange?: (section: DashboardSection) => void;
  result: LinkAnalysisResponse | null;
  onResultChange: (result: LinkAnalysisResponse | null) => void;
  onSessionExpired?: (message?: string) => void;
}

const SAMPLE_URLS = [
  "https://stripe.com",
  "https://linear.app",
  "https://vercel.com",
];

const SECTION_TABS: Array<{ id: DashboardSection; label: string }> = [
  { id: "all", label: "All Sections" },
  { id: "competitors", label: "Competitors" },
  { id: "queries", label: "Search Queries" },
  { id: "seo", label: "SEO" },
  { id: "services-audience", label: "Services & Audience" },
];

export default function AnalysisForm({
  activeSection: controlledSection,
  onSectionChange,
  result,
  onResultChange,
  onSessionExpired,
}: AnalysisFormProps) {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalSection, setInternalSection] = useState<DashboardSection>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("All");
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  const activeSection = controlledSection ?? internalSection;
  const setActiveSection = (section: DashboardSection) => {
    if (onSectionChange) {
      onSectionChange(section);
    } else {
      setInternalSection(section);
    }
  };

  const platforms = useMemo(() => {
    if (!result) return ["All"];
    const unique = Array.from(
      new Set(result.analysis.top_5_target_search_queries.map((q) => q.platform))
    );
    return ["All", ...unique];
  }, [result]);

  const filteredQueries = useMemo(() => {
    if (!result) return [];
    const list = result.analysis.top_5_target_search_queries;
    if (platformFilter === "All") return list;
    return list.filter((item) => item.platform === platformFilter);
  }, [result, platformFilter]);

  async function runAnalysis(targetUrl: string) {
    if (loading) return;
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError("Enter a public website URL to analyze.");
      return;
    }

    setError(null);
    setLoading(true);
    setPlatformFilter("All");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 50000);

    try {
      const response = await SessionClient.analyze(trimmed, controller.signal);
      onResultChange(response);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Analysis timed out after 50s. The target website or upstream AI service was slow to respond. Please try again or test a lighter page.");
      } else {
        const msg = err instanceof Error ? err.message : "Failed to analyze website.";
        if (
          msg.includes("Active session required") ||
          msg.includes("session has expired") ||
          msg.includes("401")
        ) {
          if (onSessionExpired) {
            onSessionExpired("Your LinkScope session has expired. Please re-enter your Gemini API key.");
            return;
          }
        }
        setError(msg);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAnalysis(urlInput);
  }

  function handleSampleSelect(sampleUrl: string) {
    setUrlInput(sampleUrl);
    void runAnalysis(sampleUrl);
  }

  function handleExportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    const hostSlug = result.analysis.competitor_vs_your_brand.brand_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    link.download = `${hostSlug || "link-analysis"}-report.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function handleDownloadReport() {
    if (!result) return;
    exportAnalysisToPdf(result);
  }

  async function handleCopyQuery(queryText: string) {
    try {
      await navigator.clipboard.writeText(queryText);
      setCopiedQuery(queryText);
      window.setTimeout(() => {
        setCopiedQuery((prev) => (prev === queryText ? null : prev));
      }, 1500);
    } catch {
      // Clipboard API unavailable in restricted context; ignore silently.
    }
  }

  const showSection = (section: Exclude<DashboardSection, "all">) =>
    activeSection === "all" || activeSection === section;

  return (
    <div className="space-y-8">
      {/* URL Input Bar */}
      <section
        aria-label="Website URL submission"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
                Website Link Analysis
              </h1>
              <p className="mt-1 text-sm text-slate-600 max-w-2xl">
                Extract clean page structure and generate competitor positioning, target search queries, SEO metadata, services, and audience intelligence.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Examples:</span>
              {SAMPLE_URLS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  disabled={loading}
                  onClick={() => handleSampleSelect(sample)}
                  className="font-mono text-slate-700 hover:text-indigo-700 underline underline-offset-4 decoration-slate-300 hover:decoration-indigo-600 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {sample.replace("https://", "")}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <label htmlFor="target-url-input" className="sr-only">
              Website URL
            </label>
            <div className="relative flex-1">
              <Globe
                aria-hidden="true"
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                id="target-url-input"
                type="text"
                inputMode="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com"
                disabled={loading}
                className="w-full h-11 pl-10 pr-4 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-600/20 disabled:opacity-60 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-11 px-6 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" aria-hidden="true" />
                  <span>Analyze Website</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6" aria-busy="true" aria-label="Loading analysis report">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-80 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="h-5 w-56 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="h-28 bg-slate-100 rounded animate-pulse" />
              <div className="h-28 bg-slate-100 rounded animate-pulse" />
              <div className="h-28 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="h-5 w-64 bg-slate-200 rounded animate-pulse" />
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !result && (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">
              No website report loaded yet
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Submit any public URL above to scrape cleaned page content and generate a structured five-section intelligence dashboard.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleSampleSelect("https://stripe.com")}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Analyze stripe.com
              </button>
              <button
                type="button"
                onClick={() => handleSampleSelect("https://linear.app")}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Analyze linear.app
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Populated Structured Dashboard */}
      {!loading && result && (
        <div className="space-y-6">
          {/* Report Summary Header & Segmented View Tabs */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{result.meta.provider}</span>
                  <span aria-hidden="true">·</span>
                  <span>{result.meta.model}</span>
                  <span aria-hidden="true">·</span>
                  <span>{result.meta.input_chars.toLocaleString()} chars analyzed</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-xl font-semibold text-slate-900">
                    {result.analysis.competitor_vs_your_brand.brand_name}
                  </h2>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-mono text-indigo-700 hover:text-indigo-800 hover:underline truncate max-w-full"
                  >
                    <span className="truncate">{result.url}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download Report</span>
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit max-w-full overflow-x-auto">
              {SECTION_TABS.map((tab) => {
                const isActive = activeSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSection(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 1: Competitor vs Your Brand */}
          {showSection("competitors") && (
            <section
              id="section-competitors"
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    01. Competitor vs. Your Brand
                  </h3>
                  <p className="text-sm text-slate-500">
                    Positioning breakdown and comparative landscape for{" "}
                    {result.analysis.competitor_vs_your_brand.brand_name}.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {result.analysis.competitor_vs_your_brand.competitors.length} competitors identified
                </span>
              </div>

              {/* 3-Column Brand Positioning Strip (Whitespace + Hairline Dividers, No Nested Cards) */}
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                <div className="pb-4 md:pb-0 md:pr-6 space-y-2.5">
                  <h4 className="text-xs font-semibold text-emerald-700">
                    Your Brand Strengths
                  </h4>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {result.analysis.competitor_vs_your_brand.your_brand_strengths.map(
                      (item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      )
                    )}
                  </ul>
                </div>

                <div className="py-4 md:py-0 md:px-6 space-y-2.5">
                  <h4 className="text-xs font-semibold text-amber-700">
                    Your Brand Weaknesses
                  </h4>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {result.analysis.competitor_vs_your_brand.your_brand_weaknesses.map(
                      (item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      )
                    )}
                  </ul>
                </div>

                <div className="pt-4 md:pt-0 md:pl-6 space-y-2.5">
                  <h4 className="text-xs font-semibold text-indigo-700">
                    Market Opportunities
                  </h4>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {result.analysis.competitor_vs_your_brand.opportunities.map(
                      (item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>

              {/* Competitor Table */}
              <div className="border-t border-slate-200 pt-5 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-2.5 pr-4">Competitor</th>
                      <th className="py-2.5 px-4">Why Competitor</th>
                      <th className="py-2.5 px-4">Strengths</th>
                      <th className="py-2.5 pl-4">Weaknesses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700 align-top">
                    {result.analysis.competitor_vs_your_brand.competitors.map(
                      (comp, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 pr-4 font-semibold text-slate-900 whitespace-nowrap">
                            <div className="flex flex-col gap-1 items-start">
                              <span>{comp.name}</span>
                              {comp.is_inferred !== undefined ? (
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${comp.is_inferred ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                  {comp.is_inferred ? 'AI Inference' : 'Researched Fact'}
                                </span>
                              ) : comp.source ? (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 border border-slate-200">
                                  {comp.source}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 min-w-[200px] leading-relaxed">
                            {comp.why_competitor}
                          </td>
                          <td className="py-3.5 px-4 min-w-[180px]">
                            <ul className="space-y-1">
                              {comp.strengths.map((s, sIdx) => (
                                <li key={sIdx}>{s}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="py-3.5 pl-4 min-w-[180px]">
                            <ul className="space-y-1">
                              {comp.weaknesses.map((w, wIdx) => (
                                <li key={wIdx}>{w}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Section 2: Top 5 Target Search Queries */}
          {showSection("queries") && (
            <section
              id="section-queries"
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    02. Top 5 Target Search Queries
                  </h3>
                  <p className="text-sm text-slate-500">
                    High-intent discovery queries mapped to target platforms and buyers.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {platforms.map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => setPlatformFilter(platform)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        platformFilter === platform
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-2.5 pr-3 w-10">#</th>
                      <th className="py-2.5 px-4">Query</th>
                      <th className="py-2.5 px-4">Platform</th>
                      <th className="py-2.5 px-4">Intent</th>
                      <th className="py-2.5 px-4">Target Audience & Business Relevance</th>
                      <th className="py-2.5 pl-4 text-right">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {filteredQueries.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 pr-3 font-mono tabular-nums text-xs text-slate-400">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {item.query}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {item.platform}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {item.intent}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>{item.target_audience}</div>
                          {item.business_relevance && (
                            <div className="mt-1 text-xs text-indigo-700 font-normal">
                              <span className="font-semibold text-slate-500">Relevance: </span>
                              {item.business_relevance}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pl-4 text-right">
                          <button
                            type="button"
                            onClick={() => void handleCopyQuery(item.query)}
                            aria-label={`Copy query ${item.query}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          >
                            {copiedQuery === item.query ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Section 3: SEO Improvement */}
          {showSection("seo") && (
            <section
              id="section-seo"
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
            >
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  03. SEO Improvement
                </h3>
                <p className="text-sm text-slate-500">
                  Recommended keyword focus, search metadata, and supporting content roadmap.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: Metadata & Keywords */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Recommended SEO Title</span>
                      <span className="font-mono tabular-nums">
                        {result.analysis.seo_improvement.seo_title.length} chars
                      </span>
                    </div>
                    <p className="text-base font-semibold text-indigo-700">
                      {result.analysis.seo_improvement.seo_title}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Recommended Meta Description</span>
                      <span className="font-mono tabular-nums">
                        {result.analysis.seo_improvement.meta_description.length} chars
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {result.analysis.seo_improvement.meta_description}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Primary Keyword</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {result.analysis.seo_improvement.primary_keyword}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Secondary Keywords</div>
                      <div className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {result.analysis.seo_improvement.secondary_keywords.join(" · ")}
                      </div>
                    </div>
                    {result.analysis.seo_improvement.long_tail_keywords && result.analysis.seo_improvement.long_tail_keywords.length > 0 && (
                      <div className="sm:col-span-2 pt-2 border-t border-slate-50">
                        <div className="text-xs font-semibold text-slate-500">Long-Tail Keywords</div>
                        <div className="mt-1 text-sm text-slate-700 leading-relaxed">
                          {result.analysis.seo_improvement.long_tail_keywords.join(" · ")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Supporting Content Ideas */}
                <div className="lg:col-span-5 lg:border-l lg:border-slate-200 lg:pl-8 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500">
                    Supporting Content Ideas
                  </h4>
                  <ul className="divide-y divide-slate-100 text-sm text-slate-700">
                    {result.analysis.seo_improvement.content_ideas.map((idea, idx) => (
                      <li key={idx} className="py-2.5 first:pt-0 last:pb-0 flex gap-3">
                        <span className="font-mono tabular-nums text-xs text-slate-400 pt-0.5">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="leading-relaxed">{idea}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Section 4 & 5: Top 5 Services + Target Audience Identification */}
          {showSection("services-audience") && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Section 4: Top 5 Services */}
              <section
                id="section-services"
                className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-lg font-semibold text-slate-900">
                    04. Top 5 Services
                  </h3>
                  <p className="text-sm text-slate-500">
                    Core offerings extracted from page positioning.
                  </p>
                </div>

                <ol className="divide-y divide-slate-100">
                  {result.analysis.top_5_services.map((service, idx) => (
                    <li key={idx} className="py-3.5 first:pt-1 last:pb-1 flex gap-4">
                      <span className="font-mono tabular-nums text-xs font-medium text-indigo-700 pt-1 shrink-0">
                        {String(idx + 1).padStart(2, "0")}.
                      </span>
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900">
                          {service.name}
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {service.description}
                        </p>
                        {(service.target_industry || service.target_customer || service.main_benefit) && (
                          <div className="pt-1.5 flex flex-wrap gap-2 text-xs">
                            {service.target_industry && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700">
                                <span className="font-semibold text-slate-500 mr-1">Industry:</span> {service.target_industry}
                              </span>
                            )}
                            {service.target_customer && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-indigo-50 text-indigo-700">
                                <span className="font-semibold text-indigo-500 mr-1">Customer:</span> {service.target_customer}
                              </span>
                            )}
                            {service.main_benefit && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800">
                                <span className="font-semibold text-emerald-600 mr-1">Benefit:</span> {service.main_benefit}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Section 5: Target Audience Identification */}
              <section
                id="section-audience"
                className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
              >
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-lg font-semibold text-slate-900">
                    05. Target Audience Identification
                  </h3>
                  <p className="text-sm text-slate-500">
                    Buyer personas, industry verticals, and priority expansion segments.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Primary Audience</div>
                      <p className="mt-1 text-sm font-medium text-slate-900 leading-relaxed">
                        {result.analysis.target_audience_identification.primary_audience}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Secondary Audience</div>
                      <p className="mt-1 text-sm font-medium text-slate-900 leading-relaxed">
                        {result.analysis.target_audience_identification.secondary_audience}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="text-xs font-semibold text-slate-500">Industries & Segments</div>
                    <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                      {(result.analysis.target_audience_identification.industry_segments || result.analysis.target_audience_identification.industries).join(" · ")}
                    </p>
                  </div>

                  {result.analysis.target_audience_identification.business_types && result.analysis.target_audience_identification.business_types.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <div className="text-xs font-semibold text-slate-500">Business Types</div>
                      <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {result.analysis.target_audience_identification.business_types.join(" · ")}
                      </p>
                    </div>
                  )}

                  {result.analysis.target_audience_identification.geographical_focus && (
                    <div className="border-t border-slate-100 pt-4">
                      <div className="text-xs font-semibold text-slate-500">Geographical Focus</div>
                      <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {result.analysis.target_audience_identification.geographical_focus}
                      </p>
                    </div>
                  )}

                  {result.analysis.target_audience_identification.customer_profiles && result.analysis.target_audience_identification.customer_profiles.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <div className="text-xs font-semibold text-slate-500">Customer Profiles</div>
                      <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {result.analysis.target_audience_identification.customer_profiles.join(" · ")}
                      </p>
                    </div>
                  )}

                  {result.analysis.target_audience_identification.interests && result.analysis.target_audience_identification.interests.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <div className="text-xs font-semibold text-slate-500">Audience Interests</div>
                      <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {result.analysis.target_audience_identification.interests.join(" · ")}
                      </p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4">
                    <div className="text-xs font-semibold text-slate-500">Customer Needs</div>
                    <ul className="mt-1.5 space-y-1.5 text-sm text-slate-700">
                      {result.analysis.target_audience_identification.customer_needs.map(
                        (need, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {need}
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="text-xs font-semibold text-slate-500">
                      Recommended Segments
                    </div>
                    <ul className="mt-1.5 space-y-1.5 text-sm text-slate-700">
                      {result.analysis.target_audience_identification.recommended_segments.map(
                        (segment, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {segment}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Inferred Data Disclaimer */}
          <p className="text-xs text-slate-500 px-1">
            {result.meta.inferred_data_disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
