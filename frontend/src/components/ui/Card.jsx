import React, { useState } from 'react';

export default function Card({ children, className, padding = 'md', hoverable = true, style, elevated, depth = 2, ...rest }) {
  const paddings = { sm: '16px', md: '24px', lg: '32px' };
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e) => {
    if (!hoverable) return;
    const card = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - card.left - card.width / 2;
    const y = e.clientY - card.top - card.height / 2;
    // Scale rotation to maximum of 4 degrees
    const rotateX = -(y / (card.height / 2)) * 4;
    const rotateY = (x / (card.width / 2)) * 4;
    setCoords({ x: rotateY, y: rotateX });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setCoords({ x: 0, y: 0 });
  };

  const glassBg = {
    1: 'rgba(10, 10, 18, 0.75)',
    2: 'rgba(15, 15, 25, 0.55)',
    3: 'rgba(20, 20, 35, 0.35)',
  };

  const glassBorder = {
    1: 'rgba(255, 255, 255, 0.08)',
    2: 'rgba(255, 255, 255, 0.06)',
    3: 'rgba(255, 255, 255, 0.04)',
  };

  return (
    <div
      className={`glass-grain ${className || ''}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        background: glassBg[depth] || glassBg[2],
        backdropFilter: 'blur(16px) saturate(120%)',
        WebkitBackdropFilter: 'blur(16px) saturate(120%)',
        border: `1px solid ${hovered ? 'rgba(255, 255, 255, 0.15)' : (glassBorder[depth] || glassBorder[2])}`,
        borderRadius: 'var(--radius-lg)',
        padding: paddings[padding] || paddings.md,
        transition: hovered ? 'transform 0.08s ease-out, border-color 0.3s ease, box-shadow 0.3s ease' : 'transform 0.3s ease-out, border-color 0.3s ease, box-shadow 0.3s ease',
        transform: hovered && hoverable 
          ? `perspective(800px) rotateY(${coords.x}deg) rotateX(${coords.y}deg) translateY(-3px)` 
          : 'perspective(800px) rotateY(0deg) rotateX(0deg) translateY(0)',
        boxShadow: hovered && hoverable 
          ? 'inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 20px 45px rgba(0, 0, 0, 0.5), 0 0 15px rgba(139, 92, 246, 0.15)' 
          : 'inset 0 1px 1px rgba(255, 255, 255, 0.02), 0 10px 30px rgba(0, 0, 0, 0.3)',
        position: 'relative',
        zIndex: 1,
        ...style,
      }}
      {...rest}
    >
      {/* Hairline reflection effect */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        pointerEvents: 'none',
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
      }} />
      {children}
    </div>
  );
}
