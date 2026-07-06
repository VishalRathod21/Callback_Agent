export default function StatusDot({ state, label }) {
  const dotBase = {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    boxSizing: 'border-box',
    position: 'relative',
    flexShrink: 0,
  };

  let dotStyle = {
    ...dotBase,
    border: '1.5px solid var(--border-strong)',
    backgroundColor: 'transparent',
  };

  if (state === 'complete') {
    dotStyle = {
      ...dotBase,
      backgroundColor: 'var(--signal-success)',
      border: 'none',
      boxShadow: '0 0 6px rgba(52,211,153,0.4)',
    };
  } else if (state === 'active') {
    dotStyle = {
      ...dotBase,
      backgroundColor: 'var(--accent)',
      border: 'none',
      boxShadow: '0 0 8px rgba(91,141,239,0.5)',
      animation: 'dot-pulse 1.5s infinite',
    };
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div style={dotStyle} />
      {label && (
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xs)',
          fontWeight: state === 'active' ? 600 : 400,
          color: state === 'complete' || state === 'active' ? 'var(--text-primary)' : 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {label}
        </span>
      )}
    </div>
  );
}
