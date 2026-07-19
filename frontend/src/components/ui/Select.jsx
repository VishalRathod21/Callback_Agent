import React, { useState } from 'react';

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, pointerEvents: 'none' }}>
    <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function Select({ label, value, onChange, options = [], error, hint, placeholder, style }) {
  const [focused, setFocused] = useState(false);

  const handleChange = (e) => {
    if (typeof onChange === 'function') onChange(e.target.value);
  };

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
      <div style={{ position: 'relative', width: '100%' }}>
        <select
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            width: '100%',
            height: '42px',
            padding: '0 38px 0 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(18px)',
            border: `1px solid ${error ? 'var(--rec-red)' : focused ? 'var(--spotlight)' : 'rgba(255, 255, 255, 0.16)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--paper)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            cursor: 'pointer',
            boxShadow: focused ? '0 0 8px rgba(110, 168, 254, 0.5)' : 'none',
            transition: 'all 0.2s var(--ease)',
            ...style,
          }}
        >
          {placeholder && (
            <option value="" disabled style={{ color: 'var(--paper-dimmer)' }}>
              {placeholder}
            </option>
          )}
          {options.map((opt) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lab = typeof opt === 'string' ? opt : opt.label;
            return (
              <option
                key={val}
                value={val}
                style={{ background: '#12111e', color: 'var(--paper)' }}
              >
                {lab}
              </option>
            );
          })}
        </select>
        <span style={{
          position: 'absolute',
          right: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: focused ? 'var(--spotlight)' : 'var(--paper-dim)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.2s var(--ease)',
        }}>
          <ChevronIcon />
        </span>
      </div>
      {error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--rec-red)', marginTop: '6px', fontWeight: 500 }}>
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
