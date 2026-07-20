import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Check, Play, Shield, Terminal, Zap } from 'lucide-react';
import MockupWorkspace from './MockupWorkspace';
import gsap from 'gsap';

export default function HeroSection() {
  const navigate = useNavigate();
  const heroRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Gentle GSAP entrance timeline for Hero elements
      const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.8 } });
      tl.fromTo('.hero-badge-pill', { opacity: 0, y: 15 }, { opacity: 1, y: 0 })
        .fromTo('.hero-main-title', { opacity: 0, y: 20 }, { opacity: 1, y: 0 }, '-=0.6')
        .fromTo('.hero-main-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0 }, '-=0.6')
        .fromTo('.hero-cta-row', { opacity: 0, y: 20 }, { opacity: 1, y: 0 }, '-=0.6')
        .fromTo('.hero-trust-bar', { opacity: 0, y: 15 }, { opacity: 1, y: 0 }, '-=0.5')
        .fromTo('.hero-right-container', { opacity: 0, scale: 0.97, y: 25 }, { opacity: 1, scale: 1, y: 0, duration: 1 }, '-=0.8');
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="hero-section" ref={heroRef}>
      <div className="hero-container">
        {/* Left Column: Hero Content */}
        <div className="hero-left-container">
          {/* Eyebrow Badge */}
          <div className="hero-badge-pill">
            <span className="badge-sparkle">✦</span>
            <span>AI-POWERED TECHNICAL INTERVIEW SIMULATOR</span>
          </div>

          {/* Main Headline */}
          <h1 className="hero-main-title">
            The realistic way to practice <span className="text-highlight-glow">technical interviews.</span>
          </h1>

          {/* Subtitle Copy */}
          <p className="hero-main-sub">
            Stop practicing isolated LeetCode problems. Callback recreates complete technical interview loops — with voice AI, real-time code execution, resume intelligence, and deep analytics.
          </p>

          {/* Action CTAs */}
          <div className="hero-cta-row">
            <button 
              className="btn-primary-mono" 
              onClick={() => navigate('/upload')}
            >
              <span>Start Free Practice</span>
              <ArrowRight size={16} />
            </button>
            <button 
              className="btn-secondary-mono" 
              onClick={() => scrollToSection('how-it-works')}
            >
              <Play size={14} fill="currentColor" />
              <span>Explore How It Works</span>
            </button>
          </div>

          {/* Feature Highlights Grid */}
          <div className="hero-feature-tags">
            <div className="hero-tag">
              <Check size={14} className="tag-icon" />
              <span>Resume-Aware Questions</span>
            </div>
            <div className="hero-tag">
              <Check size={14} className="tag-icon" />
              <span>Real-Time Voice AI</span>
            </div>
            <div className="hero-tag">
              <Check size={14} className="tag-icon" />
              <span>DSA & System Design</span>
            </div>
            <div className="hero-tag">
              <Check size={14} className="tag-icon" />
              <span>Instant Scoring & Roadmap</span>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="hero-trust-bar">
            <p className="trust-label">Engineers practicing on Callback target companies like:</p>
            <div className="company-logos-row">
              <span className="company-logo">Google</span>
              <span className="company-logo">Meta</span>
              <span className="company-logo">Stripe</span>
              <span className="company-logo">OpenAI</span>
              <span className="company-logo">Vercel</span>
              <span className="company-logo">Apple</span>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Mockup Workspace */}
        <div className="hero-right-container">
          <MockupWorkspace />
        </div>
      </div>
    </section>
  );
}
