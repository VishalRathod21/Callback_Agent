import React from 'react';

const Spinner = () => (
  <span style={{
    display: 'inline-block',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '2px solid rgba(11, 13, 16, 0.2)',
    borderTopColor: 'currentColor',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  }} />
);

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled,
  loading,
  fullWidth,
  icon,
  style,
  type = 'button',
  ...rest
}) {
  const [hovered, setHovered] = React.useState(false);
  const [active, setActive] = React.useState(false);

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled || loading ? 'none' : 'auto',
    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    outline: 'none',
    boxSizing: 'border-box',
    border: 'none',
    borderRadius: 'var(--radius-full)', // 999px full pill as specified
    transform: active ? 'scale(0.97)' : hovered ? 'translateY(-2px)' : 'none',
    ...(fullWidth ? { width: '100%' } : {}),
  };

  const sizes = {
    sm: { height: '34px', padding: '0 18px', fontSize: 'var(--text-xs)' },
    md: { height: '42px', padding: '0 24px', fontSize: 'var(--text-sm)' },
    lg: { height: '50px', padding: '0 32px', fontSize: 'var(--text-base)' },
  };

  const variants = {
    primary: {
      background: 'var(--spotlight)',
      color: 'var(--stage-black)',
      border: '1px solid rgba(0, 0, 0, 0.05)',
      boxShadow: hovered 
        ? '0 6px 20px rgba(242, 184, 75, 0.25)' 
        : '0 2px 8px rgba(242, 184, 75, 0.1)',
      animation: 'pulse-cta-glow 3s infinite ease-in-out', // Slow pulsing glow
    },
    secondary: {
      background: 'var(--card-bg)',
      color: 'var(--paper)',
      border: '1px solid var(--card-border)',
      boxShadow: hovered ? '0 4px 12px rgba(0, 0, 0, 0.2)' : 'none',
    },
    outline: {
      background: 'transparent',
      color: 'var(--paper)',
      border: '1px solid rgba(245, 243, 238, 0.15)',
      boxShadow: hovered ? '0 4px 12px rgba(0, 0, 0, 0.2)' : 'none',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--paper-dim)',
      border: 'none',
    },
    danger: {
      background: 'rgba(226, 72, 61, 0.1)',
      color: 'var(--rec-red)',
      border: '1px solid rgba(226, 72, 61, 0.2)',
      boxShadow: hovered ? '0 4px 12px rgba(226, 72, 61, 0.15)' : 'none',
    },
  };

  const hoverOverrides = {
    primary: {
      background: '#ffc863', // brighter amber
    },
    secondary: {
      background: 'var(--panel-bg)',
      borderColor: 'var(--spotlight)',
    },
    outline: {
      background: 'rgba(255, 255, 255, 0.04)',
      borderColor: 'var(--spotlight)',
    },
    ghost: {
      background: 'rgba(255, 255, 255, 0.04)',
      color: 'var(--paper)',
    },
    danger: {
      background: 'rgba(226, 72, 61, 0.18)',
      borderColor: 'var(--rec-red)',
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        ...base,
        ...sizes[size] || sizes.md,
        ...variants[variant] || variants.primary,
        ...(hovered && !disabled && !loading ? hoverOverrides[variant] : {}),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? icon : null}
      {children}
    </button>
  );
}
