export default function ScoreBar({ label, score }) {
  const getScoreColor = (val) => {
    if (val >= 70) return 'var(--signal-success)';
    if (val >= 50) return 'var(--signal-warning)';
    return 'var(--signal-live)';
  };

  const color = getScoreColor(score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {label && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {label}
          </span>
        )}
        <span className="font-data" style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: color,
          fontFamily: 'var(--font-display)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {score.toFixed(0)}%
        </span>
      </div>

      <div style={{
        width: '100%',
        height: '4px',
        backgroundColor: 'var(--surface-3)',
        borderRadius: '9999px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(score, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: '9999px',
          transition: 'width 800ms var(--ease-out)',
        }} />
      </div>
    </div>
  );
}
