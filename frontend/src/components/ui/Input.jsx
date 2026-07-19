import React, { useState } from 'react';

export default function Input({ label, placeholder, value, onChange, type = 'text', error, hint, style, ...rest }) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', position: 'relative' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: focused ? 'var(--spotlight)' : 'var(--paper-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '6px',
          fontFamily: 'var(--font-sans)',
          transition: 'color 0.2s var(--ease)',
        }}>
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          height: '44px',
          padding: '0 16px',
          background: focused ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${error ? 'var(--rec-red)' : focused ? 'var(--spotlight)' : 'rgba(27, 35, 64, 0.12)'}`,
          borderRadius: 'var(--radius-md)',
          color: 'var(--paper)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          boxShadow: focused 
            ? '0 0 0 2px rgba(217, 142, 43, 0.15), 0 4px 12px rgba(217, 142, 43, 0.05)' 
            : 'inset 0 1px 1px rgba(255, 255, 255, 0.4), var(--shadow-sm)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          ...style,
        }}
        {...rest}
      />
      {error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--rec-red)', marginTop: '6px', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)', marginTop: '6px' }}>
          {hint}
        </span>
      )}
    </div>
  );
}
