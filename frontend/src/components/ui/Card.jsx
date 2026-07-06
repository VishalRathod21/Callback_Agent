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
        border: `1px solid ${hovered && hoverable ? 'var(--spotlight)' : 'var(--card-border)'}`,
        borderRadius: '12px', // 10-14px as specified
        padding: paddings[padding] || paddings.md,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: hovered && hoverable ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: elevated || (hovered && hoverable)
          ? '0 12px 30px rgba(0, 0, 0, 0.35)' 
          : 'none', // Bordered, not shadow-heavy
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
