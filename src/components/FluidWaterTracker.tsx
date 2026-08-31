import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Droplets, Plus, Minus, Sparkles, Check } from 'lucide-react';

interface FluidWaterTrackerProps {
  waterCount: number;
  waterGoal: number;
  dateStr: string;
  onWaterChange: (newCount: number) => void;
  disabled?: boolean;
}

export const FluidWaterTracker: React.FC<FluidWaterTrackerProps> = ({
  waterCount,
  waterGoal = 8,
  dateStr,
  onWaterChange,
  disabled = false,
}) => {
  const [celebrationActive, setCelebrationActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wave1Ref = useRef<SVGPathElement>(null);
  const wave2Ref = useRef<SVGPathElement>(null);

  // Animated water level with spring physics
  const springRef = useRef({
    currentLevel: Math.min(100, (waterCount / Math.max(1, waterGoal)) * 100),
    targetLevel: Math.min(100, (waterCount / Math.max(1, waterGoal)) * 100),
    velocity: 0,
    sloshAmplitude: 4,
    sloshVelocity: 0,
    time: 0,
    isVisible: true,
  });

  // Track if celebration has already played today
  const celebrationKey = `dayplanner_water_celebration_${dateStr}`;

  // Update target when waterCount or waterGoal changes
  useEffect(() => {
    const target = Math.min(100, Math.max(0, (waterCount / Math.max(1, waterGoal)) * 100));
    springRef.current.targetLevel = target;
    // Excite the slosh wave on change
    springRef.current.sloshVelocity = 8;

    // Check celebration condition
    if (waterCount >= waterGoal && waterGoal > 0) {
      const alreadyCelebrated = localStorage.getItem(celebrationKey);
      if (!alreadyCelebrated) {
        localStorage.setItem(celebrationKey, 'true');
        setCelebrationActive(true);
        const timer = setTimeout(() => setCelebrationActive(false), 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [waterCount, waterGoal, celebrationKey]);

  // IntersectionObserver to pause wave animation when off-screen (§11 battery efficiency)
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        springRef.current.isVisible = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // RequestAnimationFrame loop for liquid wave physics & spring tweening
  useEffect(() => {
    let animId: number;
    const svgWidth = 140;
    const svgHeight = 180;
    const rimPadding = 12; // top rim clearance
    const usableHeight = svgHeight - rimPadding - 14;

    const animate = () => {
      const s = springRef.current;

      // Spring physics towards target level (spring constant k=0.12, damping d=0.78)
      const force = (s.targetLevel - s.currentLevel) * 0.12;
      s.velocity = (s.velocity + force) * 0.78;
      s.currentLevel += s.velocity;

      // Slosh amplitude spring (returns to resting gentle wave ~2.5px)
      const targetAmp = 2.5;
      const ampForce = (targetAmp - s.sloshAmplitude) * 0.08 + s.sloshVelocity;
      s.sloshVelocity *= 0.85;
      s.sloshAmplitude += ampForce * 0.1;
      s.sloshAmplitude = Math.max(1, Math.min(10, s.sloshAmplitude));

      s.time += 0.04;

      if (s.isVisible) {
        // Compute base y: 0% is svgHeight-14, 100% is rimPadding
        const clampedLevel = Math.max(0, Math.min(100, s.currentLevel));
        const fillHeight = (clampedLevel / 100) * usableHeight;
        const baseY = svgHeight - 14 - fillHeight;

        // Wave 1 path (front)
        let d1 = `M 0 ${svgHeight}`;
        d1 += ` L 0 ${baseY}`;
        for (let x = 0; x <= svgWidth; x += 10) {
          const waveY = baseY + Math.sin(x * 0.055 + s.time) * s.sloshAmplitude;
          d1 += ` L ${x} ${waveY.toFixed(2)}`;
        }
        d1 += ` L ${svgWidth} ${svgHeight} Z`;

        // Wave 2 path (back translucent)
        let d2 = `M 0 ${svgHeight}`;
        d2 += ` L 0 ${baseY}`;
        for (let x = 0; x <= svgWidth; x += 10) {
          const waveY = baseY + Math.sin(x * 0.05 + s.time * 0.8 + 2.1) * (s.sloshAmplitude * 0.85);
          d2 += ` L ${x} ${waveY.toFixed(2)}`;
        }
        d2 += ` L ${svgWidth} ${svgHeight} Z`;

        if (wave1Ref.current) wave1Ref.current.setAttribute('d', d1);
        if (wave2Ref.current) wave2Ref.current.setAttribute('d', d2);
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleIncrement = useCallback(() => {
    if (disabled) return;
    onWaterChange(waterCount + 1);
  }, [disabled, onWaterChange, waterCount]);

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    onWaterChange(Math.max(0, waterCount - 1));
  }, [disabled, onWaterChange, waterCount]);

  const percentage = Math.round((waterCount / Math.max(1, waterGoal)) * 100);
  const isGoalReached = waterCount >= waterGoal;

  return (
    <div ref={containerRef} className="flex flex-col md:flex-row items-center justify-between gap-6 py-2">
      {/* Left: Interactive Fluid Tumbler */}
      <div className="relative flex flex-col items-center select-none">
        {/* Milestone Celebration Banner */}
        {celebrationActive && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-mint text-emerald-950 text-xs font-extrabold px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce z-20 whitespace-nowrap">
            <Sparkles size={14} className="text-emerald-700" />
            <span>Daily Goal Achieved! 🎉</span>
          </div>
        )}

        {/* Tumbler Container */}
        <div className="relative w-[130px] h-[170px]">
          <svg
            viewBox="0 0 140 180"
            className="w-full h-full drop-shadow-md overflow-visible"
            aria-label={`Water vessel with ${percentage}% filled`}
          >
            <defs>
              {/* Tumbler clipping mask: Sleek rounded tumbler contour */}
              <clipPath id="tumblerClip">
                <path
                  d="M 24,14 
                     L 34,152 
                     Q 36,170 70,170 
                     Q 104,170 106,152 
                     L 116,14 
                     Z"
                />
              </clipPath>

              {/* Water Gradients */}
              <linearGradient id="frontWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.95" />
              </linearGradient>

              <linearGradient id="backWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.75" />
              </linearGradient>

              {/* Glass Rim Gradient */}
              <linearGradient id="glassRimGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E2E8F0" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#E2E8F0" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Glass Background / Inner shadow */}
            <path
              d="M 24,14 L 34,152 Q 36,170 70,170 Q 104,170 106,152 L 116,14 Z"
              className="fill-blue-50/40 dark:fill-dark-bg/60 stroke-blue-200/50 dark:stroke-slate-700/60"
              strokeWidth="2.5"
            />

            {/* Liquid Layers (Clipped to glass shape) */}
            <g clipPath="url(#tumblerClip)">
              {/* Back Wave */}
              <path ref={wave2Ref} fill="url(#backWaterGrad)" />
              {/* Front Wave */}
              <path ref={wave1Ref} fill="url(#frontWaterGrad)" />

              {/* Rising Celebration Bubbles (when goal reached or sloshing) */}
              {isGoalReached && (
                <g className="animate-pulse">
                  <circle cx="55" cy="140" r="2.5" fill="#FFFFFF" opacity="0.6" />
                  <circle cx="85" cy="120" r="3" fill="#FFFFFF" opacity="0.5" />
                  <circle cx="70" cy="90" r="2" fill="#FFFFFF" opacity="0.7" />
                  <circle cx="60" cy="60" r="3.5" fill="#FFFFFF" opacity="0.6" />
                </g>
              )}
            </g>

            {/* Glass Specular Highlights (Depth & Rim) */}
            <path
              d="M 22,14 Q 70,19 118,14 Q 70,9 22,14 Z"
              fill="url(#glassRimGrad)"
              className="opacity-80"
            />
            {/* Left rim shine reflection */}
            <path
              d="M 28,24 L 37,148"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              className="opacity-40"
            />
            {/* Base highlight */}
            <path
              d="M 45,166 Q 70,171 95,166"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              className="opacity-50"
            />
          </svg>

          {/* Percentage badge in center of tumbler if filled */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`text-sm font-extrabold px-2 py-0.5 rounded-full transition-all duration-300 ${
                percentage > 45
                  ? 'text-white drop-shadow-sm bg-blue-900/30'
                  : 'text-text-primary dark:text-dark-text bg-white/70 dark:bg-dark-surface/70'
              }`}
            >
              {percentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Right: Controls & Motivation */}
      <div className="flex-1 flex flex-col items-center md:items-start space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Droplets size={20} className="text-blue-500" />
            <h4 className="font-extrabold text-base text-text-primary dark:text-dark-text">
              Hydration Tracker
            </h4>
            {isGoalReached && (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-mint-light dark:bg-mint/20 dark:text-mint px-2 py-0.5 rounded-full">
                <Check size={12} /> Target Met
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
            {isGoalReached
              ? 'Awesome job! You met your hydration goal for today.'
              : `${waterGoal - waterCount} more glasses to reach your daily target.`}
          </p>
        </div>

        {/* Counter Display & Action Buttons */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="tap-spring w-11 h-11 rounded-full flex items-center justify-center bg-cream-dark dark:bg-dark-surface-raised border border-border dark:border-dark-border text-text-primary dark:text-dark-text font-bold text-lg hover:border-lavender disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            onClick={handleDecrement}
            disabled={disabled || waterCount <= 0}
            aria-label="Drink one less glass"
            title="Decrease by 1"
          >
            <Minus size={18} />
          </button>

          <div className="text-center min-w-[100px]">
            <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
              {waterCount}
            </span>
            <span className="text-sm font-bold text-text-muted dark:text-dark-text-muted">
              {' '}/ {waterGoal}
            </span>
            <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Glasses
            </div>
          </div>

          <button
            type="button"
            className="tap-spring w-11 h-11 rounded-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
            onClick={handleIncrement}
            disabled={disabled}
            aria-label="Drink one glass"
            title="Drink 1 glass (+1)"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Quick-tap Presets / Dots */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from({ length: Math.max(8, waterGoal) }, (_, i) => {
            const isFilled = i < waterCount;
            return (
              <button
                key={i}
                type="button"
                className={`tap-spring w-7 h-7 rounded-xl flex items-center justify-center text-xs transition-all ${
                  isFilled
                    ? 'bg-blue-500 text-white shadow-sm font-bold scale-105'
                    : 'bg-blue-50 dark:bg-dark-surface-raised text-blue-300 dark:text-slate-600 border border-blue-200/40 dark:border-dark-border'
                }`}
                onClick={() => !disabled && onWaterChange(i + 1)}
                disabled={disabled}
                title={`Set to ${i + 1} glasses`}
              >
                💧
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
