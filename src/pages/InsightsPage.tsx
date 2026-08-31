import React, { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { queryInsights, SUGGESTED_QUESTIONS, type InsightResponse } from '../lib/insights-engine';
import { Sparkles, Send, Loader2, BarChart3 } from 'lucide-react';

export const InsightsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim() || !user) return;
    setLoading(true);
    setQuestion(q);
    try {
      const res = await queryInsights(user.id, q);
      setResult(res);
    } catch (err) {
      setResult({
        dateRange: { start: '', end: '' },
        summary: 'Something went wrong. Please try again.',
        stats: {},
        insufficientData: true,
      });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text">
          <Sparkles size={24} className="inline mr-2 text-lavender" />
          Insights
        </h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
          Ask questions about your planner data. All analysis uses only your saved entries.
        </p>
      </div>

      {/* Suggested questions */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((sq) => (
          <button
            key={sq}
            className="btn-secondary text-sm py-2 px-3"
            onClick={() => ask(sq)}
            disabled={loading}
          >
            {sq}
          </button>
        ))}
      </div>

      {/* Custom question */}
      <div className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1"
          placeholder="Ask me anything about your planner data…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(question)}
        />
        <button
          className="btn-primary px-4"
          onClick={() => ask(question)}
          disabled={loading || !question.trim()}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="card fade-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lavender to-blue-soft flex items-center justify-center flex-shrink-0">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {result.insufficientData ? (
                <div className="text-text-secondary dark:text-dark-text-secondary">
                  <p className="whitespace-pre-line">{result.summary}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm leading-relaxed text-text-primary dark:text-dark-text whitespace-pre-wrap">
                    {result.summary}
                  </div>
                  {result.dateRange.start && (
                    <p className="text-xs text-text-muted dark:text-dark-text-muted pt-3 border-t border-border dark:border-dark-border">
                      📅 Data range: {result.dateRange.start} to {result.dateRange.end}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-text-muted dark:text-dark-text-muted mt-4 italic">
            ⚠️ These insights are based on your self-reported data. They are observations, not medical advice. Please consult a healthcare professional for medical guidance.
          </p>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-text-muted dark:text-dark-text-muted">
          <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Pick a question above or type your own</p>
          <p className="text-xs mt-1">
            Insights are computed from your saved planner entries only.
          </p>
        </div>
      )}

      {/* Optional Custom Gemini Key for instant AI */}
      <div className="pt-4 border-t border-border/50 dark:border-dark-border/50 text-center">
        <details className="text-xs text-text-muted dark:text-dark-text-muted cursor-pointer inline-block text-left">
          <summary className="hover:text-text-primary transition-colors font-medium">
            ⚙️ AI Connection Settings (Optional Gemini Key)
          </summary>
          <div className="p-3 mt-2 bg-surface-raised dark:bg-dark-surface-raised rounded-xl border border-border dark:border-dark-border space-y-2 max-w-md mx-auto">
            <p className="leading-relaxed">
              To power deep reasoning with your own free Google Gemini API key:
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter Gemini API Key (AIzaSy...)"
                defaultValue={localStorage.getItem('daylight_gemini_key') || ''}
                onChange={(e) => {
                  if (e.target.value.trim()) {
                    localStorage.setItem('daylight_gemini_key', e.target.value.trim());
                  } else {
                    localStorage.removeItem('daylight_gemini_key');
                  }
                }}
                className="input-field text-xs py-1.5 flex-1"
              />
            </div>
            <p className="text-[10px] text-text-muted">
              Get a free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-lavender font-semibold">Google AI Studio</a>. Saved locally in your browser.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
};
