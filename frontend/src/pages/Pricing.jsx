import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    tag: 'GET STARTED',
    tagColor: 'rgba(255,255,255,0.08)',
    tagTextColor: 'var(--paper-dim, rgba(245,240,232,0.5))',
    borderColor: 'rgba(255,255,255,0.08)',
    features: [
      '3 practice sessions / month',
      'Technical round only',
      'Text-only answers',
      'Basic feedback report',
    ],
    cta: 'Start Free',
    ctaStyle: {
      background: 'rgba(255,255,255,0.06)',
      color: 'var(--paper, #f5f0e8)',
      border: '1px solid rgba(255,255,255,0.12)',
    },
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: 'per month',
    tag: 'MOST POPULAR',
    tagColor: 'rgba(232,201,109,0.12)',
    tagTextColor: 'var(--spotlight, #e8c96d)',
    borderColor: 'rgba(232,201,109,0.35)',
    features: [
      'Unlimited practice sessions',
      'Technical + HR rounds',
      'Voice answers (Whisper STT)',
      'AI voice feedback (TTS)',
      'Full evaluation report',
      'Session history & replay',
    ],
    cta: 'Start Pro',
    ctaStyle: {
      background: 'var(--spotlight, #e8c96d)',
      color: '#0b0d10',
      border: 'none',
    },
    highlight: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49',
    period: 'per month',
    tag: 'FOR ORGS',
    tagColor: 'rgba(255,255,255,0.08)',
    tagTextColor: 'var(--paper-dim, rgba(245,240,232,0.5))',
    borderColor: 'rgba(255,255,255,0.08)',
    features: [
      'Everything in Pro',
      'Up to 10 seats',
      'Admin dashboard',
      'Candidate comparison reports',
      'Priority support',
    ],
    cta: 'Contact Sales',
    ctaStyle: {
      background: 'rgba(255,255,255,0.06)',
      color: 'var(--paper, #f5f0e8)',
      border: '1px solid rgba(255,255,255,0.12)',
    },
    highlight: false,
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleCta = (planId) => {
    if (planId === 'team') { window.location.href = 'mailto:hello@callback.ai'; return; }
    if (isAuthenticated) { navigate('/upload'); }
    else { navigate('/signup'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--stage-black, #0b0d10)', fontFamily: 'var(--font-sans, "Inter", sans-serif)', padding: '80px 24px' }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .plan-card { transition: transform 0.2s, box-shadow 0.2s; }
        .plan-card:hover { transform: translateY(-4px); box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        .cta-btn { cursor: pointer; width: 100%; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; transition: opacity 0.2s; }
        .cta-btn:hover { opacity: 0.85; }
        .check { color: var(--spotlight, #e8c96d); font-size: 14px; }
      `}</style>

      {/* Navbar-lite */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1100px', margin: '0 auto 80px auto' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--paper, #f5f0e8)', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--spotlight, #e8c96d)', boxShadow: '0 0 8px var(--spotlight, #e8c96d)', animation: 'pulse-dot 2s ease-in-out infinite', display: 'inline-block' }} />
          Callback
        </button>
        <button onClick={() => navigate(isAuthenticated ? '/upload' : '/signin')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '8px 18px', color: 'var(--paper, #f5f0e8)', fontSize: '13px', cursor: 'pointer' }}>
          {isAuthenticated ? 'Dashboard' : 'Sign In'}
        </button>
      </div>

      {/* Hero text */}
      <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 64px auto' }}>
        <div style={{ display: 'inline-block', background: 'rgba(232,201,109,0.1)', border: '1px solid rgba(232,201,109,0.2)', borderRadius: '20px', padding: '4px 14px', fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--spotlight, #e8c96d)', letterSpacing: '0.08em', marginBottom: '20px' }}>
          SIMPLE PRICING
        </div>
        <h1 style={{ color: 'var(--paper, #f5f0e8)', fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 16px 0', lineHeight: 1.1 }}>
          Rehearse without limits
        </h1>
        <p style={{ color: 'var(--paper-dim, rgba(245,240,232,0.5))', fontSize: '16px', lineHeight: 1.6, margin: 0 }}>
          Start free, upgrade when you're ready for the full stage.
        </p>
      </div>

      {/* Plans grid */}
      <div style={{ display: 'flex', gap: '24px', maxWidth: '1100px', margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
        {plans.map(plan => (
          <div
            key={plan.id}
            className="plan-card"
            style={{
              flex: '1 1 300px',
              maxWidth: '340px',
              background: plan.highlight ? 'rgba(232,201,109,0.04)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${plan.borderColor}`,
              borderRadius: '16px',
              padding: '32px 28px',
            }}
          >
            {/* Tag */}
            <div style={{ display: 'inline-block', background: plan.tagColor, borderRadius: '20px', padding: '3px 12px', fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', color: plan.tagTextColor, letterSpacing: '0.1em', marginBottom: '20px' }}>
              {plan.tag}
            </div>

            <div style={{ color: 'var(--paper, #f5f0e8)', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{plan.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--paper, #f5f0e8)', fontSize: '42px', fontWeight: 800, letterSpacing: '-0.03em' }}>{plan.price}</span>
              <span style={{ color: 'var(--paper-dim, rgba(245,240,232,0.4))', fontSize: '13px' }}>/ {plan.period}</span>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {plan.features.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--paper-dim, rgba(245,240,232,0.7))', lineHeight: 1.4 }}>
                  <span className="check">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button className="cta-btn" style={plan.ctaStyle} onClick={() => handleCta(plan.id)}>
              {plan.cta.toUpperCase()}
            </button>
          </div>
        ))}
      </div>

      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '12px', marginTop: '48px', fontFamily: 'var(--font-mono, monospace)' }}>
        All plans include a 14-day money-back guarantee. No questions asked.
      </p>
    </div>
  );
}
