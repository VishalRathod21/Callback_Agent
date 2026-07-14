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
          height: '42px',
          padding: '0 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(18px)',
          border: `1px solid ${error ? 'var(--rec-red)' : focused ? 'var(--spotlight)' : 'rgba(255, 255, 255, 0.16)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--paper)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          boxShadow: focused ? '0 0 8px rgba(110, 168, 254, 0.5)' : 'none',
          transition: 'all 0.2s var(--ease)',
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
