import React from 'react';

const Spinner = () => (
  <span style={{
    display: 'inline-block',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '2px solid rgba(27, 35, 64, 0.2)',
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
    opacity: disabled ? 0.55 : 1,
    pointerEvents: disabled || loading ? 'none' : 'auto',
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    outline: 'none',
    boxSizing: 'border-box',
    border: 'none',
    borderRadius: '8px',
    transform: active ? 'scale(0.98)' : 'none',
    ...(fullWidth ? { width: '100%' } : {}),
  };

  const sizes = {
    sm: { height: '36px', padding: '0 16px', fontSize: '13px', borderRadius: '6px' },
    md: { height: '44px', padding: '0 24px', fontSize: '14px', borderRadius: '8px' },
    lg: { height: '52px', padding: '0 32px', fontSize: '16px', borderRadius: '8px' },
  };

  const variants = {
    primary: {
      background: 'var(--text-primary)', /* Solid dark navy */
      color: '#FFFFFF',
      border: '1px solid transparent',
      boxShadow: hovered 
        ? '0 4px 12px rgba(27, 35, 64, 0.15)' 
        : 'none',
    },
    secondary: {
      background: '#FFFFFF',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-strong)',
      boxShadow: hovered 
        ? '0 4px 12px rgba(27, 35, 64, 0.05)' 
        : 'none',
    },
    outline: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: 'none',
    },
    danger: {
      background: 'rgba(198, 40, 40, 0.06)',
      color: 'var(--rec-red)',
      border: '1px solid rgba(198, 40, 40, 0.15)',
    },
  };

  const hoverOverrides = {
    primary: {
      background: '#2b3558', /* slightly lighter navy */
    },
    secondary: {
      background: '#FAF8F3',
      borderColor: 'var(--text-primary)',
    },
    outline: {
      background: 'rgba(27, 35, 64, 0.04)',
      borderColor: 'var(--text-primary)',
    },
    ghost: {
      background: 'rgba(27, 35, 64, 0.04)',
      color: 'var(--text-primary)',
    },
    danger: {
      background: 'rgba(198, 40, 40, 0.12)',
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
