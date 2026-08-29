import React from 'react';
import { MOOD_OPTIONS, type MoodOption } from '../types/database';

interface MoodSelectorProps {
  selectedMood: string | null;
  intensity: number | null;
  onMoodChange: (mood: string) => void;
  onIntensityChange: (intensity: number) => void;
  label: string;
}

export const MoodSelector: React.FC<MoodSelectorProps> = ({
  selectedMood, intensity, onMoodChange, onIntensityChange, label,
}) => {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">{label}</p>

      {/* Mood grid */}
      <div className="flex flex-wrap gap-2">
        {MOOD_OPTIONS.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`mood-pill ${selectedMood === m.value ? 'selected' : ''}`}
            onClick={() => onMoodChange(m.value)}
            aria-pressed={selectedMood === m.value}
            aria-label={`Mood: ${m.label}`}
          >
            <span className="text-lg">{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

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
