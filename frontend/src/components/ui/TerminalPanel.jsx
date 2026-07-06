export default function TerminalPanel({ children, className = '', style = {}, ...props }) {
  const panelStyle = {
    background: 'var(--surface-1)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    boxSizing: 'border-box',
    ...style
  };

  return (
    <div className={className} style={panelStyle} {...props}>
      {children}
    </div>
  );
}
