import { supabase } from './supabase';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

/* ===== Types ===== */

export interface EvidenceClaim {
  text: string;
  evidenceIds: string[];
}

export interface EvidenceRef {
  id: string;
  date: string;
  label: string;
}

export interface GroundedInsightResponse {
  type: 'ai-grounded' | 'fallback' | 'insufficient-data' | 'rate-limited' | 'error';
  summary: string;
  dateRange: { start: string; end: string };
  stats: Record<string, any>;
  claims: EvidenceClaim[];
  evidenceMap: EvidenceRef[];
  limitations: string;
  isFallback: boolean;
}

/* ===== Main query handler ===== */

export async function queryInsights(
  _userId: string, // not used for auth — Edge Function verifies JWT
  question: string,
  dateRange?: { start: string; end: string },
): Promise<GroundedInsightResponse> {
  // If no date range provided, parse from the question text
  const range = dateRange || parseDateRange(question);

  try {
    const { data, error } = await supabase.functions.invoke('generate-insight', {
      body: { question, startDate: range.start, endDate: range.end },
    });

    if (error) {
      console.error('Edge Function invoke error:', error);
      return {
        type: 'error',
        summary: 'Something went wrong while reflecting on your data. Please try again.',
        dateRange: range,
        stats: {},
        claims: [],
        evidenceMap: [],
        limitations: 'Edge Function call failed.',
        isFallback: true,
      };
    }

    if (data && data.summary) {
      return {
        type: data.type || 'ai-grounded',
        summary: data.summary,
        dateRange: data.dateRange || range,
        stats: data.stats || {},
        claims: Array.isArray(data.claims) ? data.claims : [],
        evidenceMap: Array.isArray(data.evidenceMap) ? data.evidenceMap : [],
        limitations: data.limitations || '',
        isFallback: !!data.isFallback,
      };
    }

    return {
      type: 'error',
      summary: 'No insight could be generated. Please try a different question.',
      dateRange: range,
      stats: {},
      claims: [],
      evidenceMap: [],
      limitations: 'Empty response from server.',
      isFallback: true,
    };
  } catch (err) {
    console.error('Insights query failed:', err);
    return {
      type: 'error',
      summary: 'Something went wrong while connecting to insights. Please check your internet connection and try again.',
      dateRange: range,
      stats: {},
      claims: [],
      evidenceMap: [],
      limitations: 'Network or server error.',
      isFallback: true,
    };
  }
}

/* ===== Date range parsing (for natural language in question text) ===== */

export function parseDateRange(question: string): { start: string; end: string } {
  const today = new Date();
  const q = question.toLowerCase();

  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };

  if (q.includes('today')) {
    const tStr = format(today, 'yyyy-MM-dd');
    return { start: tStr, end: tStr };
  }
  if (q.includes('yesterday')) {
    const yStr = format(subDays(today, 1), 'yyyy-MM-dd');
    return { start: yStr, end: yStr };
  }

  // "last X days" or "past X days"
  const daysMatch = q.match(/(?:last|past)\s+(\d+)\s+days?/i);
  if (daysMatch) {
    const count = parseInt(daysMatch[1], 10);
    if (count > 0 && count <= 365) {
      return { start: format(subDays(today, count), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
    }
  }

  // Month + day (e.g. "august 2nd", "2nd august")
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

  // Default: last 30 days
  return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
}

/* ===== Suggested questions ===== */

export const SUGGESTED_QUESTIONS = [
  'What makes my mood happy?',
  'What do you make of my recent brain dumps?',
  'What things am I most grateful for?',
  'What is the most important improvement I need to make?',
  'How do my morning reflections connect to my mood?',
  'Summarize my progress and achievements.',
];
