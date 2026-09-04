import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useCrypto } from '../contexts/CryptoContext';
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
  // Strip isolated bullet artifacts, stray backticks, trailing line asterisks, and stray asterisks around quotes
  const clean = text
    .replace(/^(\*|-|•)\s*/, '')
    .replace(/\s*\*+$/, '')                          // Strip trailing asterisks at end of lines
    .replace(/\*\s*(["“][^"”\n]+["”])\s*\*/g, '$1') // Strip * "quote" *
    .replace(/\*+(["“][^"”\n]+["”])\*+/g, '$1')     // Strip **"quote"**
    .replace(/(["“][^"”\n]+["”])\s*\*/g, '$1')       // Strip "quote" *
    .replace(/\*\s*(["“][^"”\n]+["”])/g, '$1')       // Strip * "quote"
    .replace(/`([“"][^`"”]+[”"])`/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

  const tokens = clean.split(/(\*\*.*?\*\*|"[^"\n]+"|“[^”\n]+”)/g);

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
          className="italic font-serif text-lavender-dark dark:text-lavender-light bg-lavender/15 dark:bg-lavender/25 px-1.5 py-0.5 rounded text-[13px] mx-0.5 inline-block border border-lavender/20 dark:border-lavender/30 font-semibold"
        >
          “{quote}”
        </span>
      );
    }
    return tok;
  });
}

interface SectionData {
  type: 'intro' | 'patterns' | 'next_step' | 'spark' | 'general';
  title?: string;
  items: string[];
  source?: string;
}

const FormattedInsightText: React.FC<{ text: string }> = ({ text }) => {
  // Pre-process text to remove stray markdown dividers and normalize line endings
  const raw = text.replace(/---\s*$/gm, '').trim();

  // Split into sections by markdown headers (### or ## or #) or bold headers
  const lines = raw.split('\n');
  const sections: SectionData[] = [];
  let currentSection: SectionData = { type: 'intro', items: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect headers
    const headerMatch = line.match(/^(?:###|##|#)\s*(.*)/) || line.match(/^\*\*([^*\n]+)\*\*:?$/);
    if (headerMatch) {
      if (currentSection.items.length > 0 || currentSection.title) {
        sections.push(currentSection);
      }

      const rawTitle = headerMatch[1].replace(/\*\*/g, '').trim();
      if (/pattern|observation/i.test(rawTitle)) {
        currentSection = { type: 'patterns', title: 'Patterns & Observations', items: [] };
      } else if (/next step|action|suggestion/i.test(rawTitle)) {
        currentSection = { type: 'next_step', title: 'One Small Next Step', items: [] };
      /* [AI-ENHANCEMENT: SPARK-PARSER-FIX] */
      } else if (/spark|trivia|side note/i.test(rawTitle)) {
        currentSection = { type: 'spark', title: '✨ Tiny Spark', items: [] };
        // If header itself contained content after the title (e.g. "### ✨ Tiny Spark: ...")
        const headerExtra = rawTitle.replace(/^(?:✨\s*)?(?:tiny\s*spark|trivia|side\s*note)[:\s-]*/i, '').trim();
        if (headerExtra) {
          currentSection.items.push(headerExtra);
        }
      } else {
        currentSection = { type: 'general', title: rawTitle, items: [] };
      }
      continue;
    }

    /* [AI-ENHANCEMENT: SPARK-PARSER-FIX] */
    // Check for source tags inside spark, but NEVER drop content on the same line!
    if (currentSection.type === 'spark') {
      const srcMatch = line.match(/(?:\[?\s*source\s*:\s*([^\]\n]+)\]?)/i);
      if (srcMatch) {
        if (!currentSection.source) {
          currentSection.source = srcMatch[1].replace(/\]$/, '').trim();
        }
        // Extract any accompanying text from the same line
        const textWithoutSource = line
          .replace(/(?:\[?\s*source\s*:\s*[^\]\n]+\]?)/i, '')
          .replace(/^[-—:\s]+/, '')
          .trim();
        if (textWithoutSource) {
          currentSection.items.push(textWithoutSource);
        }
        continue;
      }
    }

    currentSection.items.push(line);
  }

  if (currentSection.items.length > 0 || currentSection.title) {
    sections.push(currentSection);
  }

  return (
    <div className="space-y-4 text-sm text-text-primary dark:text-dark-text leading-relaxed">
      {sections.map((sec, sIdx) => {
        // 1. INTRO / DIRECT REFLECTION
        if (sec.type === 'intro' || (!sec.title && sec.type === 'general')) {
          return (
            <div key={sIdx} className="space-y-2.5">
              {sec.items.map((p, pIdx) => {
                if (/^(\*|-|•)\s*/.test(p)) {
                  return (
                    <div key={pIdx} className="flex items-start gap-2 pl-2">
                      <span className="text-lavender font-bold mt-0.5">•</span>
                      <p className="flex-1 leading-relaxed text-text-primary dark:text-dark-text">{renderInlineTokens(p)}</p>
                    </div>
                  );
                }
                return (
                  <p key={pIdx} className="text-sm leading-relaxed text-text-primary dark:text-dark-text font-normal">
                    {renderInlineTokens(p)}
                  </p>
                );
              })}
            </div>
          );
        }

        // 2. PATTERNS & OBSERVATIONS (Rendered as distinct, bite-sized observation cards)
        if (sec.type === 'patterns') {
          // Group bullet points
          const bulletCards: { title?: string; body: string }[] = [];
          let curCard: { title?: string; body: string } | null = null;

          for (const item of sec.items) {
            const bulletMatch = item.match(/^(?:•|\*|-)\s*(?:\*\*(.*?)\*\*:?|\b(.*?):)\s*(.*)/);
            if (bulletMatch) {
              if (curCard) bulletCards.push(curCard);
              curCard = {
                title: bulletMatch[1] || bulletMatch[2],
                body: bulletMatch[3],
              };
            } else if (curCard) {
              curCard.body += ` ${item}`;
            } else {
              curCard = { body: item };
            }
          }
          if (curCard) bulletCards.push(curCard);

          return (
            <div key={sIdx} className="space-y-2.5 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-lavender-dark dark:text-lavender">
                <Sparkles size={14} className="text-lavender" />
                <span>Patterns & Observations</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {bulletCards.map((card, cIdx) => (
                  <div
                    key={cIdx}
                    className="p-3.5 rounded-2xl bg-surface/90 dark:bg-dark-surface-raised border border-border/70 dark:border-dark-border/80 space-y-1 hover:border-lavender/30 transition-colors shadow-xs"
                  >
                    {card.title && (
                      <div className="font-bold text-xs text-text-primary dark:text-dark-text flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-lavender shrink-0" />
                        <span>{card.title}</span>
                      </div>
                    )}
                    <p className="text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed">
                      {renderInlineTokens(card.body)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // 3. ONE SMALL NEXT STEP (Emerald Action Card)
        if (sec.type === 'next_step') {
          return (
            <div
              key={sIdx}
              className="p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/50 border border-emerald-500/30 dark:border-emerald-500/40 space-y-1.5 shadow-xs"
            >
              <div className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Target size={14} className="text-emerald-500 dark:text-emerald-400" />
                <span>One Small Next Step</span>
              </div>
              <div className="text-xs text-emerald-950 dark:text-emerald-100 font-medium leading-relaxed space-y-1">
                {sec.items.map((it, itIdx) => (
                  <p key={itIdx}>{renderInlineTokens(it)}</p>
                ))}
              </div>
            </div>
          );
        }

        // 4. ✨ TINY SPARK (Amber Sourced Trivia Card)
        if (sec.type === 'spark') {
          return (
            <div
              key={sIdx}
              className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/50 border border-amber-500/30 dark:border-amber-500/40 space-y-2 shadow-xs"
            >
              <div className="font-bold text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Lightbulb size={14} className="text-amber-500 dark:text-amber-400" />
                <span>✨ Tiny Spark</span>
              </div>
              <div className="text-xs text-amber-950 dark:text-amber-100 font-medium leading-relaxed space-y-1">
                {/* [AI-ENHANCEMENT: SPARK-PARSER-FIX] */}
                {sec.items.length > 0 ? (
                  sec.items.map((it, itIdx) => (
                    <p key={itIdx}>{renderInlineTokens(it)}</p>
                  ))
                ) : (
                  <p className="italic opacity-80">
                    A small spark of insight connecting your daily efforts to human behavior and science.
                  </p>
                )}
              </div>
              {sec.source && (
                <div className="pt-1 flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                  <span className="opacity-75">Source:</span>
                  <span className="bg-amber-500/20 dark:bg-amber-400/20 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/30 text-amber-900 dark:text-amber-200">
                    {sec.source}
                  </span>
                </div>
              )}
            </div>
          );
        }

        // 5. GENERAL SECTION
        return (
          <div key={sIdx} className="space-y-1.5 pt-1">
            {sec.title && (
              <div className="font-bold text-xs uppercase tracking-wider text-lavender flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-lavender inline-block" />
                {sec.title}
              </div>
            )}
            <div className="pl-3 border-l-2 border-lavender/30 dark:border-lavender/20 space-y-1.5">
              {sec.items.map((it, itIdx) => (
                <p key={itIdx} className="text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed">
                  {renderInlineTokens(it)}
                </p>
              ))}
            </div>
          </div>
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
        className="bg-white dark:bg-dark-surface border border-border/80 dark:border-dark-border rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-scale-up"
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
  const { dek } = useCrypto();
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
        const res = await queryInsights(user.id, textToSend.trim(), currentRange, historyForApi, dek);

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
                  : 'bg-white/80 dark:bg-dark-surface/80 text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border/40 hover:border-lavender/40'
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
                    ? 'bg-lavender dark:bg-lavender-dark text-white rounded-br-md font-medium text-sm leading-relaxed shadow-sm ml-8'
                    : 'bg-white dark:bg-dark-surface border border-border/80 dark:border-dark-border text-text-primary dark:text-dark-text rounded-bl-md space-y-3 mr-8 shadow-sm'
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
        <div className="flex gap-2 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-2 rounded-3xl border border-border/80 dark:border-dark-border shadow-lg">
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
