import React, { useState } from 'react';

export interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface TrendSparklineProps {
  data: DataPoint[];
  title: string;
  unit?: string;
  strokeColor?: string;
  fillColor?: string;
  height?: number;
}

export const TrendSparkline: React.FC<TrendSparklineProps> = ({
  data,
  title,
  unit = '',
  strokeColor = '#9B8AC4', // lavender-dark
  fillColor = 'rgba(196, 181, 224, 0.2)',
  height = 90,
}) => {
  const [activePoint, setActivePoint] = useState<DataPoint | null>(null);

  if (!data || data.length < 2) {
    return (
      <div className="p-4 text-center text-xs text-text-muted dark:text-dark-text-muted bg-cream-dark/40 dark:bg-dark-surface-raised/40 rounded-2xl border border-border/40 dark:border-dark-border/40">
        Not enough entries yet to draw a trendline.
      </div>
    );
  }

  const width = 340;
  const paddingX = 20;
  const paddingY = 16;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const minVal = Math.min(...data.map((d) => d.value));
  const maxVal = Math.max(...data.map((d) => d.value));
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  // Calculate coordinates
  const points = data.map((d, idx) => {
    const x = paddingX + (idx / (data.length - 1)) * usableWidth;
    const y = height - paddingY - ((d.value - minVal) / range) * usableHeight;
    return { x, y, data: d };
  });

  // Construct SVG path string
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    // Smooth Catmull-Rom or cubic spline / line
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    pathD += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
          {title}
        </span>
        {activePoint ? (
          <span className="text-xs font-bold text-lavender-dark dark:text-lavender bg-lavender/10 px-2 py-0.5 rounded-full">
            {activePoint.date}: {activePoint.value} {unit}
          </span>
        ) : (
          <span className="text-xs text-text-muted dark:text-dark-text-muted">
            Latest: {data[data.length - 1].value} {unit}
          </span>
        )}
      </div>

      <div className="relative w-full overflow-hidden rounded-xl bg-surface/50 dark:bg-dark-surface/40 border border-border/40 dark:border-dark-border/40 p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[90px] overflow-visible"
          onMouseLeave={() => setActivePoint(null)}
        >
          <defs>
            <linearGradient id={`grad-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#grad-${title})`} />

          {/* Sparkline Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Data Dots */}
          {points.map((pt, idx) => (
            <g key={idx} className="cursor-pointer">
              <circle
                cx={pt.x}
                cy={pt.y}
                r={activePoint?.date === pt.data.date ? 5 : 3.5}
                fill={strokeColor}
                stroke="#FFFFFF"
                strokeWidth="2"
                className="transition-all duration-150 hover:scale-125"
                onMouseEnter={() => setActivePoint(pt.data)}
                onClick={() => setActivePoint(pt.data)}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};
