import { supabase } from './supabase';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

/* ===== Types ===== */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  dateRange?: { start: string; end: string };
  entryCount?: number;
  timestamp: string;
}

export interface GroundedInsightResponse {
  type: 'success' | 'insufficient-data' | 'rate-limited' | 'off-topic' | 'error';
  text: string;
  dateRange?: { start: string; end: string };
  entryCount?: number;
}

/* ===== Main query handler with Multi-Turn Conversational History ===== */

export async function queryInsights(
  _userId: string,
  question: string,
  dateRange?: { start: string; end: string } | null,
  history: Array<{ role: 'user' | 'assistant'; text: string }> = [],
): Promise<GroundedInsightResponse> {
  // If no date range provided, check if the question mentions a specific date
  let range = dateRange;
  if (!range && hasExplicitDate(question)) {
    range = parseDateRange(question);
  }

  try {
    const formattedHistory = history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      text: h.text,
    }));

    const { data, error } = await supabase.functions.invoke('generate-insight', {
      body: {
        question,
        startDate: range?.start || 'all',
        endDate: range?.end || 'all',
        history: formattedHistory,
      },
    });

    if (error) {
      console.error('Edge Function invoke error:', error);
      return {
        type: 'error',
        text: 'Something went wrong while connecting to your companion. Please try again in a moment.',
      };
    }

    if (data && data.text) {
      return {
        type: data.type || 'success',
        text: data.text,
        dateRange: data.dateRange,
        entryCount: data.entryCount,
      };
    }

    return {
      type: 'error',
      text: 'I could not generate a reflection for that question. Please try asking in a different way.',
    };
  } catch (err) {
    console.error('Insights query failed:', err);
    return {
      type: 'error',
      text: 'Could not connect to the reflection engine. Please check your internet connection and try again.',
    };
  }
}

/* ===== Date detection & parsing helpers ===== */

export function hasExplicitDate(question: string): boolean {
  const q = question.toLowerCase();

  // If asking to plan, design, or get action steps for today, keep historical context rather than isolating single day
  if (/(action\s*plan|design|plan|schedule|todo|steps?|routine|strategy|what\s+should\s+i\s+do|help\s+me)\b/i.test(q) && /\btoday\b/i.test(q)) {
    return false;
  }

  if (
    q.includes('today') ||
    q.includes('yesterday') ||
    q.includes('last week') ||
    q.includes('this week') ||
    q.includes('this month') ||
    q.includes('last month') ||
    q.includes('2 weeks') ||
    q.includes('14 days') ||
    q.includes('7 days') ||
    q.includes('30 days')
  ) {
    return true;
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (const m of months) {
    if (q.includes(m)) return true;
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(q)) return true;
  if (/\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?[a-z]+/i.test(q)) return true;
  return false;
}

export function parseDateRange(question: string): { start: string; end: string } {
  const today = new Date();
  const q = question.toLowerCase();

  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };

  // If asking to plan/schedule today, include recent history up to today
  if (q.includes('today')) {
    if (/(action\s*plan|design|plan|schedule|todo|steps?|routine|strategy|what\s+should\s+i\s+do|help\s+me)\b/i.test(q)) {
      return { start: format(subDays(today, 14), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
    }
    const tStr = format(today, 'yyyy-MM-dd');
    return { start: tStr, end: tStr };
  }
  if (q.includes('yesterday')) {
    const yStr = format(subDays(today, 1), 'yyyy-MM-dd');
    return { start: yStr, end: yStr };
  }

  // Month + day (e.g. "1st september", "september 1st", "aug 31")
  for (const [mName, mIdx] of Object.entries(months)) {
    if (q.includes(mName)) {
      const match = q.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
      if (match) {
        const dayNum = parseInt(match[1], 10);
        if (dayNum >= 1 && dayNum <= 31) {
          const targetDate = new Date(today.getFullYear(), mIdx, dayNum);
          const dStr = format(targetDate, 'yyyy-MM-dd');
          return { start: dStr, end: dStr };
        }
      }
    }
  }

  if (q.includes('last week') || q.includes('past week') || q.includes('7 days')) {
    return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
  }
  if (q.includes('this month')) {
    return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
  }
  if (q.includes('last month') || q.includes('past month')) {
    const lastMonth = subMonths(today, 1);
    return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
  }
  if (q.includes('2 weeks') || q.includes('14 days')) {
    return { start: format(subDays(today, 14), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
  }

  return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
}

/* ===== Suggested starter questions ===== */

export const SUGGESTED_QUESTIONS = [
  'What do you make of my recent brain dumps?',
  'What makes my mood feel happiest?',
  'What things am I most grateful for?',
  'How are my study and work priorities progressing?',
  'How do my morning intentions connect to my evening mood?',
  'Summarize my progress and achievements.',
];
