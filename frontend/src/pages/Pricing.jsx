import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/ui/Navbar';
import Button from '../components/ui/Button';

const plans = [
  {
    id: 'free',
    name: 'Free Starter',
    price: '$0',
    period: 'forever',
    tag: 'GET STARTED',
    tagColor: 'rgba(27,35,64,0.04)',
    tagTextColor: 'var(--text-secondary)',
    borderColor: 'rgba(27,35,64,0.06)',
    features: [
      '3 practice sessions / month',
      'Technical round simulation',
      'Text-based chat interaction',
      'Basic response evaluation report',
    ],
    cta: 'Start Rehearsal',
    ctaVariant: 'outline',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro Stage',
    price: '$19',
    period: 'per month',
    tag: 'RECOMMENDED',
    tagColor: 'rgba(99, 102, 241, 0.1)',
    tagTextColor: 'var(--accent)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
    features: [
      'Unlimited practice sessions',
      'Technical + Behavioral (HR) rounds',
      'Voice input answer evaluation',
      'AI audio feedback reports',
      'Complete scoring dashboard',
      'Session history analytics',
    ],
    cta: 'Unlock Pro Stage',
    ctaVariant: 'primary',
    highlight: true,
  },
  {
    id: 'team',
    name: 'Production Team',
    price: '$49',
    period: 'per month',
    tag: 'FOR ORGANIZATIONS',
    tagColor: 'rgba(27,35,64,0.04)',
    tagTextColor: 'var(--text-secondary)',
    borderColor: 'rgba(27,35,64,0.06)',
    features: [
      'Everything in Pro Stage',
      'Up to 10 active candidate seats',
      'Centralized admin dashboard',
      'Candidate comparison matrices',
      'Priority live pipeline support',
    ],
    cta: 'Contact Sales',
    ctaVariant: 'outline',
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
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        .pricing-card {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          background: rgba(255, 255, 255, 0.45);
          position: relative;
        }
        .pricing-card:hover {
          transform: translateY(-8px);
          background: rgba(255, 255, 255, 0.65);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.03);
        }
        .pricing-card.highlight {
          background: rgba(255, 255, 255, 0.55);
          box-shadow: 0 8px 32px rgba(99, 102, 241, 0.05);
        }
        .pricing-card.highlight:hover {
          background: rgba(255, 255, 255, 0.7);
          box-shadow: 0 20px 50px rgba(99, 102, 241, 0.12);
        }
      `}</style>

      {/* Main Navigation */}
      <Navbar />

      {/* Background Glowing Spotlight Motif */}
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124, 58, 237, 0.04) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '140px 24px 80px', position: 'relative', zIndex: 1 }}>
        
        {/* Header Hero Title */}
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 64px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            borderRadius: '24px',
            padding: '6px 16px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: '20px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: 'tag-blink-anim 2s ease infinite' }} />
            SUBSCRIPTION PLANS
          </div>
          
          <h1 style={{
            color: 'var(--text-primary)',
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 16px',
            lineHeight: 1.1,
            fontFamily: 'var(--font-display)',
          }}>
            Rehearse without limitations
          </h1>
          
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '15px',
            lineHeight: 1.6,
            margin: 0,
          }}>
            Start free to get comfortable. Upgrade to Pro when you're ready to perform on the real stage.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'stretch',
        }}>
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`pricing-card ${plan.highlight ? 'highlight' : ''}`}
              style={{
                flex: '1 1 320px',
                maxWidth: '350px',
                border: `1px solid ${plan.borderColor}`,
                borderRadius: '16px',
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              {/* Plan top bar / tag */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <span style={{
                  background: plan.tagColor,
                  borderRadius: '24px',
                  padding: '4px 12px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: plan.tagTextColor,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}>
                  {plan.tag}
                </span>
                {plan.highlight && (
                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent)',
                    fontWeight: 700,
                  }}>
                    ★ BEST VALUE
                  </span>
                )}
              </div>

              {/* Title & Price */}
              <div style={{ color: 'var(--text-primary)', fontSize: '22px', fontWeight: 800, marginBottom: '12px', fontFamily: 'var(--font-display)' }}>
                {plan.name}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '28px' }}>
                <span style={{
                  color: 'var(--text-primary)',
                  fontSize: '44px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                }}>{plan.price}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>/ {plan.period}</span>
              </div>

              <div style={{ height: '1px', background: 'rgba(27,35,64,0.06)', marginBottom: '28px' }} />

              {/* Features List */}
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 40px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                flexGrow: 1,
              }}>
                {plan.features.map(feat => (
                  <li key={feat} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '13.5px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                  }}>
                    <span style={{ color: plan.highlight ? 'var(--accent)' : 'var(--success-green)', fontWeight: 'bold' }}>✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Button
                variant={plan.ctaVariant}
                size="lg"
                fullWidth
                onClick={() => handleCta(plan.id)}
                style={plan.highlight ? {
                  background: 'linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)',
                  color: '#FFFFFF'
                } : undefined}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <p style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '11px',
          marginTop: '64px',
          fontFamily: 'var(--font-mono)',
        }}>
          All tiers support candidate screening evaluation schemas. Cancellation is active immediately.
        </p>

      </div>
    </div>
  );
}
