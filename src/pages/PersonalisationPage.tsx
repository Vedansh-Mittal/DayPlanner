import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersonalisation } from '../hooks/usePersonalisation';
import {
  Sparkles, Compass, Target, Lightbulb, Smile, Briefcase,
  Check, Loader2, ArrowLeft, HeartHandshake, Info
} from 'lucide-react';
import {
  LIFE_STAGE_OPTIONS,
  CAREER_FIELD_OPTIONS,
  FOCUS_OPTIONS,
  INTEREST_OPTIONS,
  SUPPORT_STYLE_OPTIONS,
} from '../types/database';

export const PersonalisationPage: React.FC = () => {
  const navigate = useNavigate();
  const { personalisation, updatePersonalisation, loading } = usePersonalisation();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form states - strictly empty by default so nothing is pre-selected
  const [personalisationEnabled, setPersonalisationEnabled] = useState<boolean>(true);
  const [lifeStages, setLifeStages] = useState<string[]>([]);
  const [careerFields, setCareerFields] = useState<string[]>([]);
  const [customField, setCustomField] = useState<string>('');
  const [currentFocuses, setCurrentFocuses] = useState<string[]>([]);
  const [customFocus, setCustomFocus] = useState<string>('');
  const [supportStyles, setSupportStyles] = useState<('gentle' | 'cheerful' | 'direct' | 'playful')[]>(['gentle']);
  const [triviaEnabled, setTriviaEnabled] = useState<boolean>(true);
  const [interests, setInterests] = useState<string[]>([]);

  // Sync state when personalisation data loads from database
  useEffect(() => {
    if (personalisation) {
      setPersonalisationEnabled(personalisation.personalisation_enabled !== false);
      setLifeStages(personalisation.life_stages || []);

      const knownFields = CAREER_FIELD_OPTIONS as readonly string[];
      const savedFields = personalisation.career_fields || [];
      const standardFields = savedFields.filter((f) => knownFields.includes(f as any));
      const customOnes = savedFields.filter((f) => !knownFields.includes(f as any) && f !== 'Other');

      if (customOnes.length > 0) {
        if (!standardFields.includes('Other')) standardFields.push('Other');
        setCustomField(customOnes.join(', '));
      }
      setCareerFields(standardFields);

      const knownFocuses = FOCUS_OPTIONS as readonly string[];
      const savedFocuses = personalisation.current_focuses || [];
      const standardFocuses = savedFocuses.filter((f) => knownFocuses.includes(f as any));
      const customFocs = savedFocuses.filter((f) => !knownFocuses.includes(f as any) && f !== 'Other');

      if (customFocs.length > 0) {
        if (!standardFocuses.includes('Other')) standardFocuses.push('Other');
        setCustomFocus(customFocs.join(', '));
      }
      setCurrentFocuses(standardFocuses);

      setInterests(personalisation.interests || []);
      setSupportStyles(personalisation.support_styles?.length ? personalisation.support_styles : ['gentle']);
      setTriviaEnabled(personalisation.trivia_enabled !== false);
    }
  }, [personalisation]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      let mergedCareerFields = careerFields.filter((f) => f !== 'Other');
      if (careerFields.includes('Other') && customField.trim()) {
        const parts = customField.split(',').map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!mergedCareerFields.includes(p)) mergedCareerFields.push(p);
        }
      }

      let mergedFocuses = currentFocuses.filter((f) => f !== 'Other');
      if (currentFocuses.includes('Other') && customFocus.trim()) {
        const parts = customFocus.split(',').map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!mergedFocuses.includes(p)) mergedFocuses.push(p);
        }
      }

      await updatePersonalisation({
        personalisation_enabled: personalisationEnabled,
        life_stages: lifeStages,
        career_fields: mergedCareerFields,
        current_focuses: mergedFocuses,
        interests,
        support_styles: supportStyles.length ? supportStyles : ['gentle'],
        trivia_enabled: triviaEnabled,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Save personalisation error:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto pb-8">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12 fade-in select-none">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate('/app/settings')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-lavender transition-colors mb-2 group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Settings
          </button>
          <div className="flex items-center gap-2">
            <Compass className="w-7 h-7 text-lavender" />
            <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text tracking-tight">
              Personalisation & AI Coach
            </h1>
          </div>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
            Help Mewd tailor daily reflections, companion tone, and curiosity sparks to your journey.
          </p>
        </div>

        {/* Quick Save Button in Header */}
        <div className="shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Saving…</span>
              </>
            ) : saved ? (
              <>
                <Check size={14} className="text-emerald-300" />
                <span>Saved! ✨</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Master Toggle Card */}
      <section className="card p-5 border border-lavender/30 dark:border-lavender/20 bg-gradient-to-br from-surface to-surface-muted dark:from-dark-surface dark:to-dark-surface-muted flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-text-primary dark:text-dark-text">
              Enable Personalisation & AI Coach
            </span>
            {personalisationEnabled && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-lavender/20 text-lavender-dark dark:text-lavender border border-lavender/30">
                Active ✨
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted dark:text-dark-text-muted leading-relaxed">
            When enabled, Mewd remembers your chosen stage, focus areas, and favorite companion tone to generate supportive, insightful reflections.
          </p>
        </div>
        <label className="flex items-center cursor-pointer select-none shrink-0 pt-0.5">
          <input
            type="checkbox"
            className="toggle"
            checked={personalisationEnabled}
            onChange={(e) => setPersonalisationEnabled(e.target.checked)}
          />
        </label>
      </section>

      {personalisationEnabled ? (
        <div className="space-y-6">
          {/* Section 1: Current Path / Stage */}
          <section className="card space-y-3 border-border/60 dark:border-dark-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                <Compass size={14} className="text-lavender" />
                Current Path / Stage
              </label>
              <span className="text-[11px] text-text-muted dark:text-dark-text-muted">Select all that apply</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {LIFE_STAGE_OPTIONS.map((stage) => {
                const isSelected = lifeStages.includes(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all tap-spring ${
                      isSelected
                        ? 'bg-lavender text-white border-lavender shadow-xs'
                        : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/50 dark:border-dark-border hover:border-lavender/40'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        setLifeStages(lifeStages.filter((s) => s !== stage));
                      } else {
                        setLifeStages([...lifeStages, stage]);
                      }
                    }}
                  >
                    {stage}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: Field / Area of Focus */}
          <section className="card space-y-3 border-border/60 dark:border-dark-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                <Briefcase size={14} className="text-lavender" />
                Field / Area of Focus
              </label>
              <span className="text-[11px] text-text-muted dark:text-dark-text-muted">Optional</span>
            </div>
            <p className="text-xs text-text-muted dark:text-dark-text-muted">
              Choose your domain or professional context (unselected by default):
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {CAREER_FIELD_OPTIONS.map((field) => {
                const isSelected = careerFields.includes(field);
                return (
                  <button
                    key={field}
                    type="button"
                    className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all tap-spring ${
                      isSelected
                        ? 'bg-lavender text-white border-lavender shadow-xs'
                        : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/50 dark:border-dark-border hover:border-lavender/40'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        setCareerFields(careerFields.filter((f) => f !== field));
                      } else {
                        setCareerFields([...careerFields, field]);
                      }
                    }}
                  >
                    {field}
                  </button>
                );
              })}
            </div>

            {careerFields.includes('Other') && (
              <div className="pt-2">
                <input
                  type="text"
                  className="input-field text-xs py-2"
                  placeholder="Specify your field (e.g. Mechanical Engineering, Robotics, Content Creation...)"
                  value={customField}
                  onChange={(e) => setCustomField(e.target.value)}
                />
              </div>
            )}
          </section>

          {/* Section 3: Primary Goal / Focus Right Now */}
          <section className="card space-y-3 border-border/60 dark:border-dark-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                <Target size={14} className="text-lavender" />
                Primary Goal / Focus Right Now
              </label>
              <span className="text-[11px] text-text-muted dark:text-dark-text-muted">Select all that apply</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {FOCUS_OPTIONS.map((foc) => {
                const isSelected = currentFocuses.includes(foc);
                return (
                  <button
                    key={foc}
                    type="button"
                    className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all tap-spring ${
                      isSelected
                        ? 'bg-lavender text-white border-lavender shadow-xs'
                        : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/50 dark:border-dark-border hover:border-lavender/40'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        setCurrentFocuses(currentFocuses.filter((f) => f !== foc));
                      } else {
                        setCurrentFocuses([...currentFocuses, foc]);
                      }
                    }}
                  >
                    {foc}
                  </button>
                );
              })}
            </div>

            {currentFocuses.includes('Other') && (
              <div className="pt-2">
                <input
                  type="text"
                  className="input-field text-xs py-2"
                  placeholder="Specify your goal (e.g. Learning guitar, preparing marathon...)"
                  value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                />
              </div>
            )}
          </section>

          {/* Section 4: Companion Tone & Style */}
          <section className="card space-y-3 border-border/60 dark:border-dark-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                <Smile size={14} className="text-lavender" />
                Companion Tone & Style
              </label>
              <span className="text-[11px] text-text-muted dark:text-dark-text-muted">How Mewd talks with you</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {SUPPORT_STYLE_OPTIONS.map((sty) => {
                const isSelected = supportStyles.includes(sty.id as any);
                return (
                  <button
                    key={sty.id}
                    type="button"
                    className={`text-left p-3.5 rounded-2xl border transition-all tap-spring ${
                      isSelected
                        ? 'bg-lavender/10 dark:bg-lavender/20 border-lavender shadow-xs'
                        : 'bg-surface dark:bg-dark-surface border-border/50 dark:border-dark-border hover:border-lavender/40'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        if (supportStyles.length > 1) {
                          setSupportStyles(supportStyles.filter((s) => s !== sty.id));
                        }
                      } else {
                        setSupportStyles([...supportStyles, sty.id as any]);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-text-primary dark:text-dark-text">
                        {sty.label}
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-lavender text-white flex items-center justify-center text-[10px]">
                          ✓
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted dark:text-dark-text-muted mt-1 leading-snug">
                      {sty.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 5: Tiny Sparks (Sourced Science & Trivia) */}
          <section className="card space-y-4 border-border/60 dark:border-dark-border/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-primary dark:text-dark-text flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-amber-500" />
                  Include "Tiny Sparks" (Sourced Science & Trivia)
                </label>
                <p className="text-xs text-text-muted dark:text-dark-text-muted mt-1 leading-relaxed">
                  Adds a short, fascinating sourced fact or psychological insight at the end of each daily reflection.
                </p>
              </div>
              <input
                type="checkbox"
                className="toggle shrink-0"
                checked={triviaEnabled}
                onChange={(e) => setTriviaEnabled(e.target.checked)}
              />
            </div>

            {triviaEnabled && (
              <div className="pt-2 border-t border-border/40 dark:border-dark-border/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-primary dark:text-dark-text">
                    Pick your favorite spark topics (unselected by default):
                  </label>
                  {interests.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setInterests([])}
                      className="text-[11px] font-semibold text-text-muted hover:text-red-500 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {INTEREST_OPTIONS.map((item) => {
                    const isSelected = interests.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-all tap-spring flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-lavender text-white border-lavender shadow-xs font-bold'
                            : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/50 dark:border-dark-border hover:border-lavender/40'
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            setInterests(interests.filter((id) => id !== item.id));
                          } else {
                            setInterests([...interests, item.id]);
                          }
                        }}
                      >
                        <span>{item.emoji}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="card p-6 text-center space-y-2 border-dashed border-border/70 dark:border-dark-border/70">
          <Info className="w-8 h-8 mx-auto text-text-muted opacity-60" />
          <h3 className="text-sm font-bold text-text-primary dark:text-dark-text">
            Personalisation is Currently Off
          </h3>
          <p className="text-xs text-text-muted dark:text-dark-text-muted max-w-sm mx-auto">
            Switch the toggle above to enable customized AI encouragement and Tiny Sparks trivia.
          </p>
        </div>
      )}

      {/* Bottom Save Action Bar */}
      <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/40 dark:border-dark-border/40">
        <button
          type="button"
          onClick={() => navigate('/app/settings')}
          className="btn-secondary py-2.5 px-4 text-xs font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Saving Preferences…</span>
            </>
          ) : saved ? (
            <>
              <Check size={15} className="text-emerald-300" />
              <span>Preferences Saved! ✨</span>
            </>
          ) : (
            <>
              <Sparkles size={15} />
              <span>Save Preferences</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
