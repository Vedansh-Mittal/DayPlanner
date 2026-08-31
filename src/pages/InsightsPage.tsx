import React, { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { queryInsights, SUGGESTED_QUESTIONS, type InsightResponse } from '../lib/insights-engine';
import { Sparkles, Send, Loader2, HeartHandshake } from 'lucide-react';

/* Inline formatter for bold headers and styled quotes */
function renderInlineTokens(text: string) {
  // Regex splitting by bold (**...**) and quoted strings ("..." or “...”)
  const tokens = text.split(/(\*\*.*?\*\*|"[^"\n]+"|“[^”\n]+”)/g);

  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) {
      const bold = tok.slice(2, -2);
      return (
        <strong key={i} className="font-bold text-text-primary dark:text-dark-text">
          {bold}
        </strong>
      );
    }
    if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith('“') && tok.endsWith('”'))) {
      const quote = tok.slice(1, -1);
      return (
        <span
          key={i}
          className="italic font-serif text-lavender-dark dark:text-lavender-light bg-lavender/10 dark:bg-lavender/20 px-1.5 py-0.5 rounded text-[13px] mx-0.5 inline-block"
        >
          “{quote}”
        </span>
      );
    }
    return tok;
  });
}

const FormattedInsightText: React.FC<{ text: string }> = ({ text }) => {
  // Split into paragraphs / sections
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());

  return (
    <div className="space-y-4 text-sm text-text-primary dark:text-dark-text leading-relaxed">
      {blocks.map((block, idx) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

        // Header detection: e.g. "1. **Observation**:" or "**Observation**:"
        const headerMatch = block.match(/^(\d+\.\s*)?\*\*(.*?)\*\*[:\s]*/);
        if (headerMatch) {
          const title = headerMatch[2];
          const remaining = block.slice(headerMatch[0].length).trim();

          return (
            <div key={idx} className="space-y-1.5 pt-1.5">
              <div className="font-bold text-xs uppercase tracking-wider text-lavender flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-lavender inline-block" />
                {title}
              </div>
              {remaining && (
                <div className="pl-3.5 border-l-2 border-lavender/30 dark:border-lavender/20 space-y-2">
                  {remaining.split('\n').map((l, lIdx) => {
                    if (/^(\*|-|•)\s/.test(l)) {
                      return (
                        <div key={lIdx} className="flex items-start gap-2 text-sm leading-relaxed">
                          <span className="text-lavender font-bold flex-shrink-0">•</span>
                          <span className="flex-1">{renderInlineTokens(l.replace(/^(\*|-|•)\s+/, ''))}</span>
                        </div>
                      );
                    }
                    return (
                      <p key={lIdx} className="leading-relaxed">
                        {renderInlineTokens(l)}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // Bulleted lists
        const isList = lines.length > 1 && lines.every((l) => /^(\*|-|•|\d+\.)\s/.test(l));
        if (isList) {
          return (
            <div key={idx} className="space-y-1.5 pl-2">
              {lines.map((l, lIdx) => (
                <div key={lIdx} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="text-lavender font-bold flex-shrink-0">•</span>
                  <span className="flex-1">{renderInlineTokens(l.replace(/^(\*|-|•|\d+\.)\s+/, ''))}</span>
                </div>
              ))}
            </div>
          );
        }

        // Regular paragraph
        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineTokens(block)}
          </p>
        );
      })}
    </div>
  );
};

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
        summary: 'Something went wrong while reflecting on your data. Please try again.',
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
          Insights & Reflections
        </h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
          A gentle, private reflection on your habits, thoughts, and daily rhythm.
        </p>
      </div>

      {/* Suggested questions */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((sq) => (
          <button
            key={sq}
            className="btn-secondary text-sm py-2 px-3 tap-spring"
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
          placeholder="Ask anything about your journal entries…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(question)}
        />
        <button
          className="btn-primary px-4 tap-spring"
          onClick={() => ask(question)}
          disabled={loading || !question.trim()}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="card fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lavender to-blue-soft flex items-center justify-center flex-shrink-0 shadow-sm">
              <HeartHandshake size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {result.insufficientData ? (
                <div className="text-text-secondary dark:text-dark-text-secondary">
                  <p className="whitespace-pre-line">{result.summary}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <FormattedInsightText text={result.summary} />
                  {result.dateRange.start && (
                    <p className="text-xs text-text-muted dark:text-dark-text-muted pt-3 border-t border-border dark:border-dark-border">
                      📅 Data range: {result.dateRange.start} to {result.dateRange.end}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-text-muted dark:text-dark-text-muted mt-4 pt-3 border-t border-border/40 dark:border-dark-border/40 italic">
            ⚠️ These insights are based on your self-reported journal entries. They are thoughtful personal observations, not medical advice.
          </p>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-text-muted dark:text-dark-text-muted">
          <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Pick a question above or ask your own</p>
          <p className="text-xs mt-1">
            Every reflection is grounded directly in your personal journal logs.
          </p>
        </div>
      )}
    </div>
  );
};
