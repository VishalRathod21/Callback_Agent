import { useState } from 'react';

export default function MonoButton({ variant = 'solid', children, onClick, style = {}, disabled = false, ...props }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const baseStyle = {
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    fontWeight: 600,
    padding: '0 var(--space-6)',
    height: '44px',
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.01em',
    transition: 'all 0.25s var(--ease)',
    outline: 'none',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: style.width || 'auto',
    opacity: disabled ? 0.45 : 1,
    transform: isPressed && !disabled ? 'scale(0.97)' : isHovered && !disabled ? 'translateY(-1px)' : 'scale(1)',
  };

  const variantStyles = {
    solid: {
      background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
      color: '#ffffff',
      border: 'none',
      boxShadow: isHovered && !disabled ? '0 4px 15px rgba(124, 58, 237, 0.25)' : 'none',
    },
    ghost: {
      backgroundColor: isHovered && !disabled ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
      border: `1.5px solid ${isHovered && !disabled ? 'var(--accent-border)' : 'rgba(255, 255, 255, 0.08)'}`,
      color: 'var(--text-primary)',
      boxShadow: 'none',
    }
  };

  const finalStyle = {
    ...baseStyle,
    ...variantStyles[variant] || variantStyles.solid,
    ...style
  };

  return (
    <button
      onClick={disabled ? null : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={finalStyle}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
