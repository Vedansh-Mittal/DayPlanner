import React from 'react';
import { MOOD_OPTIONS, type MoodOption } from '../types/database';

interface MoodSelectorProps {
  selectedMood: string | null;
  intensity: number | null;
  onMoodChange: (mood: string) => void;
  onIntensityChange: (intensity: number) => void;
  label: string;
}

/* [TAG: MULTI_MOOD_SELECTION_V1] */
export const MoodSelector: React.FC<MoodSelectorProps> = ({
  selectedMood,
  intensity,
  onMoodChange,
  onIntensityChange,
  label,
}) => {
  // Parse comma-separated list of selected moods
  const selectedMoods = React.useMemo(() => {
    if (!selectedMood) return [];
    return selectedMood
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, [selectedMood]);

  const handleMoodToggle = (moodValue: string) => {
    let nextMoods: string[];
    if (selectedMoods.includes(moodValue)) {
      nextMoods = selectedMoods.filter((m) => m !== moodValue);
    } else {
      nextMoods = [...selectedMoods, moodValue];
    }
    onMoodChange(nextMoods.join(', '));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">{label}</p>
        <span className="text-xs text-text-muted dark:text-dark-text-muted">
          Select all that apply
        </span>
      </div>

      {/* Mood grid */}
      <div className="flex flex-wrap gap-2">
        {MOOD_OPTIONS.map((m) => {
          const isSelected = selectedMoods.includes(m.value);
          return (
            <button
              key={m.value}
              type="button"
              className={`mood-pill relative transition-all ${isSelected ? 'selected ring-2 ring-lavender/40 dark:ring-lavender/50' : ''}`}
              onClick={() => handleMoodToggle(m.value)}
              aria-pressed={isSelected}
              aria-label={`Mood: ${m.label}`}
            >
              {isSelected && (
                <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-lavender animate-pulse" />
              )}
              <span className="text-lg">{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Mood Badges */}
      {selectedMoods.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-xs text-text-muted dark:text-dark-text-muted font-medium">Selected:</span>
          {selectedMoods.map((val) => {
            const opt = MOOD_OPTIONS.find((m) => m.value === val);
            return (
              <span
                key={val}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-lavender/15 dark:bg-lavender/25 text-lavender-dark dark:text-lavender-light border border-lavender/30 animate-fade-in"
              >
                <span>{opt?.emoji || '•'}</span>
                <span>{opt?.label || val}</span>
                <button
                  type="button"
                  onClick={() => handleMoodToggle(val)}
                  className="ml-1 text-lavender-dark/60 dark:text-lavender-light/60 hover:text-lavender-dark dark:hover:text-white font-bold leading-none"
                  title={`Remove ${opt?.label || val}`}
                  aria-label={`Remove ${opt?.label || val}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Intensity */}
      <div>
        <p className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-2">
          Mood intensity
        </p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`intensity-dot ${intensity === n ? 'selected' : ''}`}
              onClick={() => onIntensityChange(n)}
              aria-pressed={intensity === n}
              aria-label={`Intensity ${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
