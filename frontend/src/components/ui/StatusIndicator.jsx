import React from 'react';

const dotStyles = {
  idle: {
    width: '8px', height: '8px', borderRadius: '50%',
    border: '1.5px solid var(--paper-dimmer)',
    background: 'transparent', flexShrink: 0,
  },
  pending: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: 'var(--paper-dimmer)', flexShrink: 0,
  },
  active: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: 'var(--spotlight)',
    boxShadow: '0 0 10px var(--spotlight)',
    animation: 'pulse-red 1.8s ease infinite',
    flexShrink: 0,
  },
  complete: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: 'var(--prompter-green)',
    boxShadow: '0 0 10px var(--prompter-green)',
    flexShrink: 0,
  },
};

export default function StatusIndicator({ status = 'idle', label, sublabel, children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      width: '100%',
    }}>
      {/* Left: dot */}
      <div style={dotStyles[status] || dotStyles.idle} />

      {/* Center: text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--paper)',
          lineHeight: 1.3,
          fontFamily: 'var(--font-sans)',
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--paper-dim)',
            marginTop: '3px',
          }}>
            {sublabel}
          </div>
        )}
      </div>

      {/* Right: badge slot */}
      {children && (
        <div style={{ flexShrink: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}
