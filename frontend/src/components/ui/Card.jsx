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
        background: 'var(--card-bg)',
        border: `1px solid ${hovered && hoverable ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)', // Standard card radius
        padding: paddings[padding] || paddings.md,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: hovered && hoverable ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hovered && hoverable 
          ? 'var(--shadow-md), 0 0 20px rgba(217, 142, 43, 0.05)' 
          : 'var(--shadow-sm)',
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

