import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SessionClient } from "../services/sessionClient";

interface ActivationLandingProps {
  onActivated: () => void;
  sessionExpiredMessage?: string | null;
}

export default function ActivationLanding({
  onActivated,
  sessionExpiredMessage,
}: ActivationLandingProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(sessionExpiredMessage || null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Please enter your Google Gemini API key to activate LinkScope.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await SessionClient.activate(trimmed);
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden animate-in fade-in duration-300">
        {/* Header Bar */}
        <div className="p-8 pb-6 border-b border-slate-100 bg-slate-50/50">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Anonymous Session BYOK
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Activate LinkScope
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            LinkScope is a demo website intelligence tool. Enter your personal Google Gemini API key to start an anonymous, temporary session. No signup or account required.
          </p>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Obtain Key Link */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Need a Gemini API key?
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                <span>Get your key from Google AI Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-xs text-slate-500">
              Sign into Google AI Studio, click <strong>Create API Key</strong>, and paste your key below.
            </p>
          </div>

          {/* Step 2: Input */}
          <div className="space-y-1.5">
            <label htmlFor="gemini-key-input" className="block text-xs font-semibold text-slate-700">
              Google Gemini API Key
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="gemini-key-input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                disabled={loading}
                autoFocus
                className="w-full pl-10 pr-10 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-900 placeholder:text-slate-400 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Privacy Guarantee */}
          <div className="p-3 bg-indigo-50/50 border border-indigo-100/80 rounded-xl text-indigo-900 text-xs flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Zero Database Storage:</strong> Your key is encrypted with 256-bit AES-GCM and stored only in temporary server memory. It is permanently deleted when you click logout or when your session expires.
            </p>
          </div>

          {/* Activate Button */}
          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-colors shadow-xs shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying with Google Gemini...</span>
              </>
            ) : (
              <span>Activate LinkScope</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
