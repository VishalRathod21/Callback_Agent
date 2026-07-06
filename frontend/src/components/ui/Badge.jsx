import React from 'react';

export default function Badge({ variant = 'default', children }) {
  const dotColors = {
    default: 'var(--paper-dimmer)',
    success: 'var(--prompter-green)',
    warning: 'var(--spotlight)',
    danger: 'var(--rec-red)',
    accent: 'var(--spotlight)',
  };

  const variants = {
    default: {
      background: 'var(--panel-bg)',
      color: 'var(--paper-dim)',
      border: '1px solid var(--card-border)',
    },
    success: {
      background: 'rgba(62, 207, 142, 0.08)',
      color: 'var(--prompter-green)',
      border: '1px solid rgba(62, 207, 142, 0.2)',
    },
    warning: {
      background: 'rgba(242, 184, 75, 0.08)',
      color: 'var(--spotlight)',
      border: '1px solid rgba(242, 184, 75, 0.2)',
    },
    danger: {
      background: 'rgba(226, 72, 61, 0.08)',
      color: 'var(--rec-red)',
      border: '1px solid rgba(226, 72, 61, 0.2)',
    },
    accent: {
      background: 'rgba(242, 184, 75, 0.08)',
      color: 'var(--spotlight)',
      border: '1px solid rgba(242, 184, 75, 0.2)',
    },
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      height: '24px',
      padding: '0 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: '10px',
      fontWeight: 500,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      borderRadius: 'var(--radius-full)', // 999px
      flexShrink: 0,
      ...variants[variant] || variants.default,
    }}>
      <span style={{
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: dotColors[variant] || 'var(--paper-dimmer)',
        display: 'inline-block',
      }} />
      {children}
    </span>
  );
}
