import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, Sparkles } from "lucide-react";

import AnalysisForm, { type DashboardSection } from "./components/AnalysisForm";
import ActivationLanding from "./components/ActivationLanding";
import { SessionClient } from "./services/sessionClient";
import type { LinkAnalysisResponse } from "./types/analysis";

export default function App() {
  const [result, setResult] = useState<LinkAnalysisResponse | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSection>("all");
  const [isSessionActive, setIsSessionActive] = useState<boolean | null>(null);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);

  // Check existing session status on initial load
  useEffect(() => {
    async function checkSession() {
      try {
        const status = await SessionClient.getStatus();
        setIsSessionActive(status.active);
      } catch {
        setIsSessionActive(false);
      }
    }

    void checkSession();
  }, []);

  async function handleLogout() {
    await SessionClient.logout();
    setIsSessionActive(false);
    setResult(null);
    setSessionExpiredMsg(null);
  }

  function handleReset() {
    setResult(null);
    setActiveSection("all");
  }

  function handleSessionExpired(msg?: string) {
    setIsSessionActive(false);
    setResult(null);
    setSessionExpiredMsg(msg || "Your LinkScope session has expired. Please re-enter your Gemini API key.");
  }

  // Loading initial session check
  if (isSessionActive === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-sm text-slate-500 font-medium">
          <ShieldCheck className="w-5 h-5 text-indigo-600 animate-spin" />
          <span>Checking LinkScope session...</span>
        </div>
      </div>
    );
  }

  // If no active session, show clean BYOK activation landing page
  if (!isSessionActive) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="text-lg font-bold tracking-tight text-slate-900">
              LinkScope
            </a>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Session BYOK Demo
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-[1200px] w-full mx-auto">
          <ActivationLanding
            onActivated={() => {
              setIsSessionActive(true);
              setSessionExpiredMsg(null);
            }}
            sessionExpiredMessage={sessionExpiredMsg}
          />
        </main>
      </div>
    );
  }

  // Active Session: Show full LinkScope dashboard
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Single-element brand wordmark with BYOK badge */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/"
              className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
            >
              LinkScope
            </a>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Session Active
            </span>
          </div>

          {/* Zone 2: Concise single-line section navigation */}
          <nav
            aria-label="Dashboard sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => setActiveSection("all")}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "all"
                  ? "text-slate-900 underline underline-offset-8 decoration-indigo-600 font-semibold"
                  : ""
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("competitors")}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "competitors"
                  ? "text-slate-900 underline underline-offset-8 decoration-indigo-600 font-semibold"
                  : ""
              }`}
            >
              Competitors
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("queries")}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "queries"
                  ? "text-slate-900 underline underline-offset-8 decoration-indigo-600 font-semibold"
                  : ""
              }`}
            >
              Queries
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("seo")}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "seo"
                  ? "text-slate-900 underline underline-offset-8 decoration-indigo-600 font-semibold"
                  : ""
              }`}
            >
              SEO
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("services-audience")}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "services-audience"
                  ? "text-slate-900 underline underline-offset-8 decoration-indigo-600 font-semibold"
                  : ""
              }`}
            >
              Audience
            </button>
          </nav>

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* End Session Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              title="End session and delete temporary Gemini key from server"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>End Session</span>
            </button>

            {/* New Analysis Button */}
            <button
              type="button"
              onClick={handleReset}
              disabled={!result}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default"
            >
              New Analysis
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-8">
        <AnalysisForm
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          result={result}
          onResultChange={setResult}
          onSessionExpired={handleSessionExpired}
        />
      </main>
    </div>
  );
}
