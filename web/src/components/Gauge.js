'use client';

import React from 'react';

export default function Gauge({
  value = 0,
  min = 0,
  max = 100,
  title = '',
  unit = '',
  color = 'cyan', // cyan, green, amber, red
}) {
  // Calculate percentage (0 to 1)
  const percent = Math.min(Math.max((value - min) / (max - min), 0), 1);
  
  // Circle calculations
  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius; // ~314.16
  
  // We want the gauge to span 270 degrees (3/4 of a circle)
  // Arc length = 270 degrees = 3/4 * circumference = 235.6
  // Gap = 90 degrees = 1/4 * circumference = 78.5
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - percent * arcLength;
  
  // Map color name to HSL values
  const colorMap = {
    cyan: 'var(--color-cyan)',
    green: 'var(--color-green)',
    amber: 'var(--color-amber)',
    red: 'var(--color-red)',
  };
  
  const activeColor = colorMap[color] || 'var(--color-cyan)';

  return (
    <div style={containerStyle} className="glass-panel" id={`gauge-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <span style={titleStyle}>{title}</span>
      
      <div style={svgContainerStyle}>
        <svg width="140" height="140" viewBox="0 0 120 120">
          <defs>
            <radialGradient id={`glow-${title}`} cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="var(--bg-card)" stopOpacity="0" />
              <stop offset="100%" stopColor={activeColor} stopOpacity="0.15" />
            </radialGradient>
          </defs>
          
          {/* Background Arc */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="var(--border-muted)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(135 60 60)"
          />
          
          {/* Fill Arc representing Value */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill={`url(#glow-${title})`}
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(135 60 60)"
            style={{ transition: 'stroke-dashoffset 0.3s ease-out, stroke 0.3s ease' }}
          />
        </svg>
        
        {/* Value Overlay */}
        <div style={textOverlayStyle}>
          <span style={valueStyle} className="mono-num">
            {typeof value === 'number' ? value.toFixed(value < 10 ? 2 : 1) : value}
          </span>
          <span style={unitStyle}>{unit}</span>
        </div>
      </div>
      
      {/* Min/Max Labels */}
      <div style={limitContainerStyle}>
        <span style={limitStyle} className="mono-num">Min: {min}</span>
        <span style={limitStyle} className="mono-num">Max: {max}</span>
      </div>
    </div>
  );
}

// Inline styles for the Gauge Card
const containerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '20px 16px 14px 16px',
  borderRadius: 'var(--radius-md)',
  width: '100%',
  position: 'relative',
};

const titleStyle = {
  fontSize: '0.8rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '10px',
};

const svgContainerStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '140px',
  height: '140px',
};

const textOverlayStyle = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  paddingBottom: '10px', // Shift text slightly up to center in 270deg arc
};

const valueStyle = {
  fontSize: '1.75rem',
  fontWeight: '700',
  color: 'var(--text-primary)',
  lineHeight: '1.1',
};

const unitStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  fontWeight: '500',
  textTransform: 'uppercase',
  marginTop: '2px',
};

const limitContainerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  marginTop: '6px',
  padding: '0 8px',
};

const limitStyle = {
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
};
