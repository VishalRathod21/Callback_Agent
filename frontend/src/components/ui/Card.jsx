import React, { useState } from 'react';

export default function Card({ children, className, padding = 'md', hoverable = true, style, elevated, ...rest }) {
  const paddings = { sm: '16px', md: '24px', lg: '32px' };
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={className}
      onMouseEnter={hoverable ? () => setHovered(true) : undefined}
      onMouseLeave={hoverable ? () => setHovered(false) : undefined}
      style={{
        background: hovered && hoverable 
          ? 'rgba(28, 32, 38, 0.55)'
          : 'rgba(21, 24, 29, 0.45)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: `1px solid ${hovered && hoverable ? 'var(--accent-border)' : 'rgba(255, 255, 255, 0.04)'}`,
        borderTop: `1px solid ${hovered && hoverable ? 'rgba(242, 184, 75, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
        borderRadius: '16px',
        padding: paddings[padding] || paddings.md,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: hovered && hoverable ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered && hoverable 
          ? 'inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 0 15px rgba(242, 184, 75, 0.1), 0 20px 48px rgba(0, 0, 0, 0.6)' 
          : 'inset 0 1px 1px rgba(255, 255, 255, 0.03), 0 12px 32px rgba(0, 0, 0, 0.4)',
        position: 'relative',
        zIndex: 1,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

