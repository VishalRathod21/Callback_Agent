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
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    outline: 'none',
    boxSizing: 'border-box',
    border: 'none',
    transform: active ? 'scale(0.96)' : hovered ? 'scale(1.02)' : 'scale(1)',
    ...(fullWidth ? { width: '100%' } : {}),
  };

  const sizes = {
    sm: { height: '36px', padding: '0 16px', fontSize: '13px', borderRadius: 'var(--radius-sm)' },
    md: { height: '44px', padding: '0 24px', fontSize: '14px', borderRadius: 'var(--radius-md)' },
    lg: { height: '52px', padding: '0 32px', fontSize: '16px', borderRadius: 'var(--radius-md)' },
  };

  const variants = {
    primary: {
      background: '#ffffff',
      color: '#000000',
      border: '1px solid #ffffff',
      boxShadow: hovered 
        ? '0 6px 20px rgba(255, 255, 255, 0.15)' 
        : '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      color: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: hovered 
        ? '0 6px 16px rgba(0, 0, 0, 0.3)' 
        : 'none',
    },
    outline: {
      background: 'transparent',
      color: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: hovered ? '0 4px 12px rgba(0, 0, 0, 0.2)' : 'none',
    },
    ghost: {
      background: 'transparent',
      color: 'rgba(255, 255, 255, 0.6)',
      border: 'none',
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.1)',
      color: 'var(--rec-red)',
      border: '1px solid rgba(239, 68, 68, 0.2)',
    },
  };

  const hoverOverrides = {
    primary: {
      background: '#e5e5e5',
      borderColor: '#e5e5e5',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.1)',
      borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    outline: {
      background: 'rgba(255, 255, 255, 0.05)',
      borderColor: '#ffffff',
    },
    ghost: {
      background: 'rgba(255, 255, 255, 0.05)',
      color: '#ffffff',
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.2)',
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
