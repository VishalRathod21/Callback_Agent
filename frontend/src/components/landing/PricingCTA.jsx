import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Zap, Sparkles, CheckCircle2 } from 'lucide-react';

export default function PricingCTA() {
  const navigate = useNavigate();

  return (
    <section className="pricing-cta-section" id="pricing-cta">
      <div className="section-container">
        <div className="cta-banner-box">
          <div className="cta-banner-content">
            <div className="cta-badge">
              <Sparkles size={14} className="text-white" />
              <span>READY TO MASTER YOUR LOOP?</span>
            </div>
            <h2 className="cta-title">
              Master your next technical interview before stepping into the room.
            </h2>
            <p className="cta-subtitle">
              Join thousands of software engineers using Callback to practice voice dialogue, coding algorithms, system design, and behavioral scenarios.
            </p>

            <div className="cta-buttons-row">
              <button 
                className="btn-primary-mono large"
                onClick={() => navigate('/upload')}
              >
                <span>Start Free Practice Now</span>
                <ArrowRight size={16} />
              </button>
              <button 
                className="btn-secondary-mono large"
                onClick={() => navigate('/practice')}
              >
                <span>Quick Practice Sandbox</span>
              </button>
            </div>

            <div className="cta-trust-perks">
              <div className="perk-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>No Credit Card Required</span>
              </div>
              <div className="perk-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Instant Voice & IDE Access</span>
              </div>
              <div className="perk-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>100% Free Starter Plan</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
