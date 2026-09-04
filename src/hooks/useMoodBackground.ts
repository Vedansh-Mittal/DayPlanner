import { useEffect } from 'react';
import type { MoodOption } from '../types/database';

const MOOD_TINT_MAP: Record<MoodOption, { primary: string; secondary: string }> = {
  amazing: {
    primary: 'rgba(167, 243, 208, 0.16)', // soft mint
    secondary: 'rgba(147, 197, 253, 0.10)',
  },
  good: {
    primary: 'rgba(147, 197, 253, 0.16)', // soft sky blue
    secondary: 'rgba(196, 181, 224, 0.10)',
  },
  okay: {
    primary: 'rgba(253, 230, 138, 0.15)', // warm gold
    secondary: 'rgba(253, 220, 181, 0.10)',
  },
  tired: {
    primary: 'rgba(229, 224, 216, 0.18)', // calm muted taupe
    secondary: 'rgba(196, 181, 224, 0.08)',
  },
  anxious: {
    primary: 'rgba(245, 198, 208, 0.18)', // gentle rose
    secondary: 'rgba(253, 220, 181, 0.10)',
  },
  overwhelmed: {
    primary: 'rgba(252, 165, 165, 0.15)', // warm coral
    secondary: 'rgba(245, 198, 208, 0.10)',
  },
  sad: {
    primary: 'rgba(196, 181, 224, 0.18)', // peaceful lavender
    secondary: 'rgba(147, 197, 253, 0.10)',
  },
  irritable: {
    primary: 'rgba(253, 186, 116, 0.15)', // warm apricot
    secondary: 'rgba(253, 230, 138, 0.10)',
  },
  meh: {
    primary: 'rgba(209, 213, 219, 0.15)', // calm slate
    secondary: 'rgba(229, 224, 216, 0.10)',
  },
};

const DEFAULT_TINT = {
  primary: 'rgba(196, 181, 224, 0.08)',
  secondary: 'rgba(147, 197, 253, 0.06)',
};

/**
 * Applies a subtle, low-chroma ambient mood tint CSS variable to the page background (§4).
 * Transitions smoothly over 3.5 seconds using CSS variables.
 */
/* [TAG: MULTI_MOOD_SELECTION_V1] */
export function useMoodBackground(mood?: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    const moods = mood
      ? mood
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s in MOOD_TINT_MAP)
      : [];

    const primaryMood = moods[0] as MoodOption | undefined;
    const secondaryMood = moods[1] as MoodOption | undefined;

    const primaryTint = primaryMood
      ? MOOD_TINT_MAP[primaryMood].primary
      : DEFAULT_TINT.primary;

    const secondaryTint = secondaryMood
      ? MOOD_TINT_MAP[secondaryMood].secondary
      : (primaryMood ? MOOD_TINT_MAP[primaryMood].secondary : DEFAULT_TINT.secondary);

    root.style.setProperty('--mood-tint', primaryTint);
    root.style.setProperty('--mood-tint-secondary', secondaryTint);
  }, [mood]);
}
