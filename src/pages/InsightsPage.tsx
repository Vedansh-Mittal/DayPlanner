import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../stores/auth-store';
import {
  queryInsights,
  SUGGESTED_QUESTIONS,
  type ChatMessage,
} from '../lib/insights-engine';
import { AIThinkingCompanion } from '../components/AIThinkingCompanion';
import { format, subDays, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, addDays, isSameMonth, isSameDay, isAfter, isBefore, parse } from 'date-fns';
import {
  Sparkles, Send, Loader2, HeartHandshake, Calendar, ChevronLeft, ChevronRight,
  X, RotateCcw, Clock, User, MessageSquare, Lightbulb, Target,
} from 'lucide-react';

/* ── Date Range Presets ────────────────────────────────────── */
type RangePreset = 'all' | 'last7' | 'last30' | 'thisMonth' | 'custom';

function getPresetRange(preset: RangePreset): { start: string; end: string } | null {
  const today = new Date();
  switch (preset) {
    case 'all':
      return null;
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

/* ── Inline Markdown Renderer (Bold + Styled Quotes) ───────── */
function renderInlineTokens(text: string) {
  const tokens = text.split(/(\*\*.*?\*\*|"[^"\n]+"|“[^”\n]+”)/g);

  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) {
      return (
        <strong key={i} className="font-bold text-text-primary dark:text-dark-text">
          {tok.slice(2, -2)}
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
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());

  return (
    <div className="space-y-3.5 text-sm text-text-primary dark:text-dark-text leading-relaxed">
      {blocks.map((block, idx) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

        // Header detection: e.g. "**Observation**:" or "**✨ Tiny Spark**:"
        const headerMatch = block.match(/^(\d+\.\s*)?\*\*(.*?)\*\*[:\s]*/);
        if (headerMatch) {
          const rawTitle = headerMatch[2];
          const remaining = block.slice(headerMatch[0].length).trim();
          const isSpark = /spark|trivia|side note/i.test(rawTitle);
          const isStep = /next step|suggestion|small action/i.test(rawTitle);

          if (isSpark) {
            return (
              <div
                key={idx}
                className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 dark:border-amber-500/20 space-y-1.5"
              >
                <div className="font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-amber-500 animate-bounce" />
                  {rawTitle}
                </div>
                <p className="text-xs text-text-secondary dark:text-dark-text leading-relaxed">
                  {renderInlineTokens(remaining || block)}
                </p>
              </div>
            );
          }

          if (isStep) {
            return (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 dark:border-emerald-500/20 space-y-1"
              >
                <div className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Target size={14} className="text-emerald-500" />
                  {rawTitle}
                </div>
                <p className="text-xs text-text-secondary dark:text-dark-text leading-relaxed">
                  {renderInlineTokens(remaining)}
                </p>
              </div>
            );
          }

          return (
            <div key={idx} className="space-y-1.5 pt-1">
              <div className="font-bold text-xs uppercase tracking-wider text-lavender flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-lavender inline-block" />
                {rawTitle}
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

/* ── Calendar Range Picker Modal ───────────────────────────── */
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
  const calStart = startOfWeek(monthStart);

  const days: Date[] = [];
  let d = calStart;
  while (days.length < 42) {
    days.push(d);
    d = addDays(d, 1);
  }

  const handleDayClick = (day: Date) => {
    if (isAfter(day, new Date())) return;
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary dark:text-dark-text flex items-center gap-2">
            <Calendar size={16} className="text-lavender" />
            Filter by Date Range
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-border/30 dark:hover:bg-dark-border/30 transition-colors">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="text-xs text-center text-text-secondary dark:text-dark-text-secondary bg-surface dark:bg-dark-surface rounded-xl py-2 px-3 font-medium">
          {selStart && selEnd
            ? `${format(selStart, 'MMM d, yyyy')} → ${format(selEnd, 'MMM d, yyyy')}`
            : selStart
              ? `${format(selStart, 'MMM d, yyyy')} → Pick end date`
              : 'Tap start date, then end date'}
        </div>

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
            Apply Filter
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Insights Page Component ──────────────────────────── */
export const InsightsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<RangePreset>('all');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, loading]);

  const currentRange = useMemo(() => {
    if (activePreset === 'custom' && customRange) return customRange;
    return getPresetRange(activePreset);
  }, [activePreset, customRange]);

  const sendMessage = useCallback(
    async (textToSend: string) => {
      if (!textToSend.trim() || !user || loading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: textToSend.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const updatedHistory = [...messages, userMsg];
      setMessages(updatedHistory);
      setInputQuestion('');
      setLoading(true);

      const historyForApi = updatedHistory.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      try {
        const res = await queryInsights(user.id, textToSend.trim(), currentRange, historyForApi);

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: res.text,
          dateRange: res.dateRange,
          entryCount: res.entryCount,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'I ran into an unexpected hiccup while reading your journal. Please feel free to ask again or rephrase!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }

      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [user, loading, messages, currentRange]
  );

  const handleClearThread = () => {
    setMessages([]);
    setInputQuestion('');
  };

  const handlePresetClick = (preset: RangePreset) => {
    if (preset === 'custom') {
      setShowCalendar(true);
    } else {
      setActivePreset(preset);
      setCustomRange(null);
    }
  };

  const handleCalendarSelect = (start: Date, end: Date) => {
    setCustomRange({ start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') });
    setActivePreset('custom');
    setShowCalendar(false);
  };

  const presets: { key: RangePreset; label: string; icon: string }[] = [
    { key: 'all', label: 'All Time (Default)', icon: '✨' },
    { key: 'last7', label: 'Last 7 days', icon: '⚡' },
    { key: 'last30', label: 'Last 30 days', icon: '📅' },
    { key: 'thisMonth', label: 'This month', icon: '🌙' },
    { key: 'custom', label: 'Custom range', icon: '🗓️' },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-8">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text flex items-center gap-2">
            <Sparkles size={24} className="text-lavender animate-pulse" />
            Insights & Reflection Companion
          </h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
            An ongoing, intimate conversation reflecting on your daily thoughts, habits, and growth.
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClearThread}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-lavender font-medium px-3 py-1.5 rounded-xl border border-border/40 hover:border-lavender/40 transition-all bg-surface/50 dark:bg-dark-surface/50"
            title="Start a fresh conversation"
          >
            <RotateCcw size={13} />
            <span>New Chat</span>
          </button>
        )}
      </div>

      {/* Optional Timeline Filter Bar */}
      <div className="space-y-1.5 bg-surface/40 dark:bg-dark-surface/40 border border-border/40 dark:border-dark-border/40 rounded-2xl p-3">
        <div className="flex items-center justify-between text-[11px] text-text-muted dark:text-dark-text-muted font-medium">
          <span className="flex items-center gap-1">
            <Clock size={12} className="text-lavender" />
            Optional timeline filter (defaults to all entries):
          </span>
          {currentRange && (
            <span className="text-lavender font-semibold text-[11px]">
              Active: {currentRange.start} → {currentRange.end}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {presets.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all tap-spring ${
                activePreset === key
                  ? 'bg-lavender text-white border-lavender shadow-xs'
                  : 'bg-white/80 dark:bg-dark-card/80 text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border/40 hover:border-lavender/40'
              }`}
              onClick={() => handlePresetClick(key)}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Thread */}
      {messages.length > 0 && (
        <div className="space-y-4 pt-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`fade-in flex gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Companion Avatar */}
              {msg.role === 'assistant' && (
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-lavender to-blue-soft flex items-center justify-center shrink-0 shadow-sm mt-1">
                  <HeartHandshake size={18} className="text-white" />
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`max-w-[88%] rounded-3xl p-4 sm:p-5 shadow-xs transition-all ${
                  msg.role === 'user'
                    ? 'bg-lavender text-white rounded-br-md font-medium text-sm leading-relaxed shadow-sm ml-8'
                    : 'bg-white dark:bg-dark-card border border-border/80 dark:border-dark-border text-text-primary dark:text-dark-text rounded-bl-md space-y-3 mr-8'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <>
                    <FormattedInsightText text={msg.text} />
                    {msg.dateRange?.start && (
                      <div className="pt-2 border-t border-border/30 dark:border-dark-border/30 flex items-center justify-between text-[11px] text-text-muted dark:text-dark-text-muted">
                        <span>
                          📅 Reflecting on {msg.dateRange.start === msg.dateRange.end ? msg.dateRange.start : `${msg.dateRange.start} to ${msg.dateRange.end}`}
                          {msg.entryCount ? ` (${msg.entryCount} ${msg.entryCount === 1 ? 'entry' : 'entries'})` : ''}
                        </span>
                        <span className="text-[10px] opacity-75">{msg.timestamp}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* User Avatar */}
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-2xl bg-surface dark:bg-dark-surface border border-border/60 dark:border-dark-border flex items-center justify-center shrink-0 shadow-xs mt-1">
                  <User size={16} className="text-text-secondary dark:text-dark-text-secondary" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Suggested Starters (Shown when thread is empty) */}
      {messages.length === 0 && !loading && (
        <div className="space-y-3 pt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
            <MessageSquare size={13} className="text-lavender" />
            Suggested Reflection Starters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUGGESTED_QUESTIONS.map((sq) => (
              <button
                key={sq}
                type="button"
                className="btn-secondary text-left text-xs py-3 px-3.5 tap-spring rounded-2xl border-border/60 hover:border-lavender/50 hover:bg-lavender/5 transition-all flex items-center justify-between group"
                onClick={() => sendMessage(sq)}
                disabled={loading}
              >
                <span>{sq}</span>
                <Sparkles size={13} className="text-lavender opacity-40 group-hover:opacity-100 shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Companion Thinking Loading State */}
      {loading && (
        <div className="card fade-in">
          <AIThinkingCompanion />
        </div>
      )}

      {/* Input Form Bar */}
      <div className="sticky bottom-4 z-20 pt-2">
        <div className="flex gap-2 bg-white/90 dark:bg-dark-card/90 backdrop-blur-md p-2 rounded-3xl border border-border/80 dark:border-dark-border shadow-lg">
          <input
            ref={inputRef}
            type="text"
            className="input-field flex-1 border-none shadow-none focus:ring-0 bg-transparent px-3 text-sm"
            placeholder={
              messages.length > 0
                ? "Ask a follow-up or cross-question (e.g. 'how about my water intake?')..."
                : "Ask anything about your journal (e.g. 'what do you make of my brain dump on 1st Sept')..."
            }
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputQuestion);
              }
            }}
            disabled={loading}
          />
          <button
            type="button"
            className="btn-primary rounded-2xl px-4 py-2.5 tap-spring flex items-center justify-center shrink-0"
            onClick={() => sendMessage(inputQuestion)}
            disabled={loading || !inputQuestion.trim()}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {/* Medical Disclaimer Footnote */}
      <p className="text-[11px] text-center text-text-muted dark:text-dark-text-muted italic pt-2">
        🌸 Mewwmory reflections are heartfelt personal observations based on your private journal logs, not medical advice.
      </p>

      {/* Calendar Range Modal */}
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
