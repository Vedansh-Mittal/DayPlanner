import React, { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { queryInsights, parseDateRange, SUGGESTED_QUESTIONS, type GroundedInsightResponse, type EvidenceClaim, type EvidenceRef } from '../lib/insights-engine';
import { AIThinkingCompanion } from '../components/AIThinkingCompanion';
import { format, subDays, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, addDays, isSameMonth, isSameDay, isAfter, isBefore, parse } from 'date-fns';
import {
  Sparkles, Send, Loader2, HeartHandshake, Calendar, ChevronLeft, ChevronRight,
  X, AlertTriangle, Shield, Clock, FileText, Info,
} from 'lucide-react';

/* ── Date Range Presets ────────────────────────────────────── */
type RangePreset = 'last7' | 'last30' | 'thisMonth' | 'custom';

function getPresetRange(preset: RangePreset): { start: string; end: string } | null {
  const today = new Date();
  switch (preset) {
    case 'last7':
      return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
    case 'last30':
      return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
    case 'thisMonth':
      return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
    case 'custom':
      return null;
  }
}

/* ── Inline Markdown Renderer (Bold + Quotes) ──────────────── */
function renderInlineTokens(text: string) {
  const tokens = text.split(/(\*\*.*?\*\*|"[^"\n]+"|"[^"\n]+")/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) {
      return (
        <strong key={i} className="font-bold text-text-primary dark:text-dark-text">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith('\u201c') && tok.endsWith('\u201d'))) {
      return (
        <span key={i} className="italic font-serif text-lavender-dark dark:text-lavender-light bg-lavender/10 dark:bg-lavender/20 px-1.5 py-0.5 rounded text-[13px] mx-0.5 inline-block">
          \u201c{tok.slice(1, -1)}\u201d
        </span>
      );
    }
    return tok;
  });
}

const FormattedInsightText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <div className="space-y-4 text-sm text-text-primary dark:text-dark-text leading-relaxed">
      {blocks.map((block, idx) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
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
                          <span className="text-lavender font-bold flex-shrink-0">&bull;</span>
                          <span className="flex-1">{renderInlineTokens(l.replace(/^(\*|-|•)\s+/, ''))}</span>
                        </div>
                      );
                    }
                    return <p key={lIdx} className="leading-relaxed">{renderInlineTokens(l)}</p>;
                  })}
                </div>
              )}
            </div>
          );
        }
        const isList = lines.length > 1 && lines.every((l) => /^(\*|-|•|\d+\.)\s/.test(l));
        if (isList) {
          return (
            <div key={idx} className="space-y-1.5 pl-2">
              {lines.map((l, lIdx) => (
                <div key={lIdx} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="text-lavender font-bold flex-shrink-0">&bull;</span>
                  <span className="flex-1">{renderInlineTokens(l.replace(/^(\*|-|•|\d+\.)\s+/, ''))}</span>
                </div>
              ))}
            </div>
          );
        }
        return <p key={idx} className="leading-relaxed">{renderInlineTokens(block)}</p>;
      })}
    </div>
  );
};

/* ── Evidence Chip ─────────────────────────────────────────── */
const EvidenceChip: React.FC<{ evRef: EvidenceRef }> = ({ evRef }) => (
  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-lavender/10 dark:bg-lavender/20 text-lavender-dark dark:text-lavender-light border border-lavender/20 dark:border-lavender/30">
    <FileText size={10} />
    {evRef.date}: {evRef.label}
  </span>
);

/* ── Claims List with Evidence Chips ───────────────────────── */
const ClaimsList: React.FC<{ claims: EvidenceClaim[]; evidenceMap: EvidenceRef[] }> = ({ claims, evidenceMap }) => {
  if (!claims.length) return null;
  const evidenceById = useMemo(() => {
    const map = new Map<string, EvidenceRef>();
    for (const e of evidenceMap) map.set(e.id, e);
    return map;
  }, [evidenceMap]);

  return (
    <div className="space-y-3 pt-3 border-t border-border/40 dark:border-dark-border/40">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted dark:text-dark-text-muted flex items-center gap-1">
        <Shield size={10} /> Evidence-Grounded Claims
      </p>
      {claims.map((claim, idx) => (
        <div key={idx} className="space-y-1.5">
          <p className="text-xs text-text-primary dark:text-dark-text leading-relaxed">
            {renderInlineTokens(claim.text)}
          </p>
          <div className="flex flex-wrap gap-1">
            {claim.evidenceIds.map((eid) => {
              const ref = evidenceById.get(eid);
              return ref ? <EvidenceChip key={eid} evRef={ref} /> : null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── Calendar Range Picker (Hotel-Booking Style) ───────────── */
const CalendarRangePicker: React.FC<{
  startDate: Date | null;
  endDate: Date | null;
  onSelect: (start: Date, end: Date) => void;
  onClose: () => void;
}> = ({ startDate, endDate, onSelect, onClose }) => {
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selStart, setSelStart] = useState<Date | null>(startDate);
  const [selEnd, setSelEnd] = useState<Date | null>(endDate);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart);

  const days: Date[] = [];
  let d = calStart;
  while (days.length < 42) {
    days.push(d);
    d = addDays(d, 1);
  }

  const handleDayClick = (day: Date) => {
    if (isAfter(day, new Date())) return; // no future dates
    if (!selStart || (selStart && selEnd)) {
      setSelStart(day);
      setSelEnd(null);
    } else {
      if (isBefore(day, selStart)) {
        setSelEnd(selStart);
        setSelStart(day);
      } else {
        setSelEnd(day);
      }
    }
  };

  const isInRange = (day: Date) => {
    if (!selStart || !selEnd) return false;
    return (isAfter(day, selStart) || isSameDay(day, selStart)) && (isBefore(day, selEnd) || isSameDay(day, selEnd));
  };

  const canApply = selStart && selEnd;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-card border border-border/80 dark:border-dark-border rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary dark:text-dark-text flex items-center gap-2">
            <Calendar size={16} className="text-lavender" />
            Select Date Range
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-border/30 dark:hover:bg-dark-border/30 transition-colors">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        {/* Selection preview */}
        <div className="text-xs text-center text-text-secondary dark:text-dark-text-secondary bg-surface dark:bg-dark-surface rounded-xl py-2 px-3 font-medium">
          {selStart && selEnd
            ? `${format(selStart, 'MMM d, yyyy')} → ${format(selEnd, 'MMM d, yyyy')}`
            : selStart
              ? `${format(selStart, 'MMM d, yyyy')} → Pick end date`
              : 'Tap start date, then end date'}
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="p-1.5 rounded-lg hover:bg-border/30 dark:hover:bg-dark-border/30 transition-colors">
            <ChevronLeft size={16} className="text-text-muted" />
          </button>
          <span className="text-sm font-bold text-text-primary dark:text-dark-text">
            {format(viewMonth, 'MMMM yyyy')}
          </span>
          <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-1.5 rounded-lg hover:bg-border/30 dark:hover:bg-dark-border/30 transition-colors">
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dh) => (
            <div key={dh} className="text-[10px] font-bold text-text-muted dark:text-dark-text-muted uppercase py-1">
              {dh}
            </div>
          ))}
          {days.map((day, i) => {
            const inMonth = isSameMonth(day, viewMonth);
            const isStart = selStart && isSameDay(day, selStart);
            const isEnd = selEnd && isSameDay(day, selEnd);
            const inRange = isInRange(day);
            const isFuture = isAfter(day, new Date());

            return (
              <button
                key={i}
                type="button"
                disabled={isFuture}
                onClick={() => handleDayClick(day)}
                className={`
                  text-xs py-1.5 rounded-lg transition-all font-medium
                  ${!inMonth ? 'text-text-muted/30 dark:text-dark-text-muted/30' : ''}
                  ${isFuture ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                  ${isStart || isEnd
                    ? 'bg-lavender text-white font-bold shadow-sm'
                    : inRange
                      ? 'bg-lavender/15 dark:bg-lavender/25 text-lavender-dark dark:text-lavender-light'
                      : inMonth
                        ? 'text-text-primary dark:text-dark-text hover:bg-border/30 dark:hover:bg-dark-border/30'
                        : ''
                  }
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1 text-xs py-2.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 bg-lavender hover:bg-lavender-dark text-white text-xs font-bold py-2.5 px-3 rounded-2xl shadow-sm transition-all disabled:opacity-40"
            disabled={!canApply}
            onClick={() => {
              if (selStart && selEnd) {
                onSelect(selStart, selEnd);
                onClose();
              }
            }}
          >
            Apply Range
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Insights Page ────────────────────────────────────── */
export const InsightsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<GroundedInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<RangePreset>('last30');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const currentRange = useMemo(() => {
    if (activePreset === 'custom' && customRange) return customRange;
    return getPresetRange(activePreset) || getPresetRange('last30')!;
  }, [activePreset, customRange]);

  const ask = useCallback(async (q: string, overrideRange?: { start: string; end: string }) => {
    if (!q.trim() || !user) return;
    setLoading(true);
    setQuestion(q);

    // Check if question text contains a date reference — use NLP-parsed range
    const nlpRange = parseDateRange(q);
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultRange = { start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: today };

    // If NLP parsed something different from default 30-day, use that
    const hasNlpDate = nlpRange.start !== defaultRange.start || nlpRange.end !== defaultRange.end;
    const finalRange = overrideRange || (hasNlpDate ? nlpRange : currentRange);

    try {
      const res = await queryInsights(user.id, q, finalRange);
      setResult(res);
    } catch (err) {
      setResult({
        type: 'error',
        summary: 'Something went wrong while reflecting on your data. Please try again.',
        dateRange: finalRange,
        stats: {},
        claims: [],
        evidenceMap: [],
        limitations: 'Unexpected error.',
        isFallback: true,
      });
    }
    setLoading(false);
  }, [user, currentRange]);

  const handlePresetClick = (preset: RangePreset) => {
    if (preset === 'custom') {
      setShowCalendar(true);
    } else {
      setActivePreset(preset);
      setCustomRange(null);
    }
  };

  const handleCalendarSelect = (start: Date, end: Date) => {
    const range = { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    setCustomRange(range);
    setActivePreset('custom');
  };

  const presets: { key: RangePreset; label: string; icon: string }[] = [
    { key: 'last7', label: 'Last 7 days', icon: '⚡' },
    { key: 'last30', label: 'Last 30 days', icon: '📅' },
    { key: 'thisMonth', label: 'This month', icon: '🌙' },
    { key: 'custom', label: 'Custom range', icon: '🗓️' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text">
          <Sparkles size={24} className="inline mr-2 text-lavender" />
          Insights & Reflections
        </h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
          A gentle, evidence-grounded reflection on your habits, thoughts, and daily rhythm.
        </p>
      </div>

      {/* Date Range Selector */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted dark:text-dark-text-muted flex items-center gap-1">
          <Clock size={10} /> Timeline
        </p>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all tap-spring ${
                activePreset === key
                  ? 'bg-lavender text-white border-lavender shadow-sm'
                  : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border/40 hover:border-lavender/40'
              }`}
              onClick={() => handlePresetClick(key)}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        {/* Active range display */}
        <p className="text-[11px] text-text-muted dark:text-dark-text-muted italic">
          Analyzing entries from <span className="font-semibold text-lavender">{currentRange?.start}</span> to <span className="font-semibold text-lavender">{currentRange?.end}</span>
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

      {/* Custom question input */}
      <div className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1"
          placeholder="Ask anything about your journal entries\u2026"
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

      {/* Loading State */}
      {loading && (
        <div className="card">
          <AIThinkingCompanion />
        </div>
      )}

      {/* Result */}
      {!loading && result && (
        <div className="card fade-in space-y-4">
          {/* Header row */}
          <div className="flex items-start gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
              result.isFallback
                ? 'bg-gradient-to-br from-amber-400 to-orange-400'
                : 'bg-gradient-to-br from-lavender to-blue-soft'
            }`}>
              {result.isFallback
                ? <AlertTriangle size={20} className="text-white" />
                : <HeartHandshake size={20} className="text-white" />
              }
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              {/* Fallback / rate-limit badge */}
              {result.type === 'rate-limited' && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Info size={10} /> Rate Limit Reached
                </div>
              )}
              {result.type === 'fallback' && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Info size={10} /> Verified Statistics (AI Unavailable)
                </div>
              )}
              {result.type === 'insufficient-data' && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Info size={10} /> Insufficient Data
                </div>
              )}

              {/* Summary */}
              {result.isFallback || result.type === 'insufficient-data' ? (
                <div className="text-text-secondary dark:text-dark-text-secondary">
                  <p className="whitespace-pre-line text-sm">{result.summary}</p>
                </div>
              ) : (
                <FormattedInsightText text={result.summary} />
              )}

              {/* Evidence-Grounded Claims */}
              {!result.isFallback && result.claims.length > 0 && (
                <ClaimsList claims={result.claims} evidenceMap={result.evidenceMap} />
              )}

              {/* Limitations */}
              {result.limitations && !result.isFallback && (
                <p className="text-[11px] text-text-muted dark:text-dark-text-muted italic pt-2">
                  ⚠️ {result.limitations}
                </p>
              )}

              {/* Date range indicator */}
              {result.dateRange?.start && (
                <p className="text-xs text-text-muted dark:text-dark-text-muted pt-3 border-t border-border dark:border-dark-border">
                  📅 Based on entries from <span className="font-semibold">{result.dateRange.start}</span> to <span className="font-semibold">{result.dateRange.end}</span>
                  {result.stats?.entryCount != null && <span> &middot; {result.stats.entryCount} entries</span>}
                </p>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[11px] text-text-muted dark:text-dark-text-muted pt-3 border-t border-border/40 dark:border-dark-border/40 italic">
            ℹ️ Insights are based only on your saved entries and are not medical advice.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="text-center py-12 text-text-muted dark:text-dark-text-muted">
          <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Pick a question above or ask your own</p>
          <p className="text-xs mt-1">
            Every reflection is grounded directly in your personal journal logs.
          </p>
        </div>
      )}

      {/* Calendar Modal */}
      {showCalendar && (
        <CalendarRangePicker
          startDate={customRange ? parse(customRange.start, 'yyyy-MM-dd', new Date()) : null}
          endDate={customRange ? parse(customRange.end, 'yyyy-MM-dd', new Date()) : null}
          onSelect={handleCalendarSelect}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
};
