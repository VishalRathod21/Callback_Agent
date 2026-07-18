import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/ui/Navbar';
import Button from '../components/ui/Button';
import laptopImg from '../assets/Laptop_image.png';
import './Landing.css';

const chartData = {
  overall: [65, 70, 72, 78, 80, 85, 87],
  confidence: [60, 68, 75, 78, 84, 88, 91],
  technical: [55, 62, 70, 75, 78, 82, 84],
  delivery: [68, 72, 76, 80, 83, 87, 90],
  eyecontact: [50, 58, 62, 70, 72, 75, 78]
};

function AnimatedNumber({ value, duration = 600 }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseInt(value, 10);
    if (isNaN(end)) {
      setCurrent(value);
      return;
    }
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = progress * (2 - progress); // easeOutQuad
      const currentVal = Math.round(start + (end - start) * easeProgress);
      setCurrent(currentVal);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{current}%</span>;
}

export default function Landing() {
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeMetric, setActiveMetric] = useState('overall');
  const [sectionRef, setSectionRef] = useState(null);
  const [sectionInView, setSectionInView] = useState(false);
  const [hoveredStep, setHoveredStep] = useState(null);
  const [hoveredTag, setHoveredTag] = useState(null);

  useEffect(() => {
    if (!sectionRef) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSectionInView(true);
      }
    }, { threshold: 0.20 });
    observer.observe(sectionRef);
    return () => observer.disconnect();
  }, [sectionRef]);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: "How does the AI Interview work?",
      a: "Callback uses advanced speech recognition and code compilation to analyze your mock performance. It evaluates syntax, structure, complexity, pacing, and delivery to create a detailed score breakdown."
    },
    {
      q: "Is my data and video recording secure?",
      a: "Yes. All your practice data and sessions are kept completely confidential. We do not sell your interview recordings or scorecards to third parties."
    },
    {
      q: "Can I get a refund if I'm not satisfied?",
      a: "Absolutely. If Callback Pro doesn't help you improve your confidence, you can request a full refund within 14 days of upgrade."
    },
    {
      q: "Does Callback provide real interview questions?",
      a: "Yes, our question banks are updated daily with verified behavioral and systems design questions from Google, Meta, Amazon, and leading tech giants."
    }
  ];

  return (
    <div className="landing-root">
      <div className="noise-overlay" />
      <Navbar />

      {/* ── B. HERO SECTION ── */}
      <section className="hero-layout">
        <div className="hero-left">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.4, delay: 0.1 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'linear-gradient(135deg, rgba(217,142,43,0.08), rgba(124,58,237,0.06))',
              border: '1px solid rgba(217, 142, 43, 0.2)',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--accent-brand)',
              letterSpacing: '0.04em',
              marginBottom: '24px',
              animation: 'float-badge 3s ease-in-out infinite'
            }}
          >
            <span>✨</span>
            <span>AI-Powered Mock Interviews</span>
            <span style={{ background: 'var(--accent-brand)', color: '#fff', padding: '2px 8px', borderRadius: '99px', fontSize: '9px', fontWeight: 800 }}>NEW</span>
          </motion.div>

          <h1 className="heading-hero" style={{ margin: '0 0 24px 0' }}>
            <span style={{ display: 'block', overflow: 'hidden' }}>
              <motion.span
                style={{ display: 'inline-block' }}
                initial={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)', y: '100%' }}
                animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', y: 0 }}
                transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5, delay: 0.2 }}
              >
                Ace Every Interview
              </motion.span>
            </span>
            <span style={{ display: 'block', overflow: 'hidden' }}>
              <motion.span
                style={{ display: 'inline-block' }}
                initial={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)', y: '100%' }}
                animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', y: 0 }}
                transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5, delay: 0.28 }}
              >
                with <span className="gradient-text">AI-Powered</span> Practice
              </motion.span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5, delay: 0.4 }}
            style={{ fontSize: '17px', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '500px', margin: '0 0 32px 0' }}
          >
            Real-time AI interviews that evaluate communication, technical skills, confidence and problem-solving — so you walk in prepared.
          </motion.p>

          <div className="hero-cta-group">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5, delay: 0.5 }}
            >
              <Button 
                variant="secondary" 
                size="lg" 
                onClick={() => navigate('/')} 
                icon={<span style={{ fontSize: '13px' }}>▶</span>}
                className="btn-secondary"
              >
                Watch Demo
              </Button>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5, delay: 0.56 }}
            >
              <Button 
                variant="primary" 
                size="lg" 
                onClick={() => navigate('/upload')} 
                style={{ boxShadow: '0 8px 24px rgba(27,35,64,0.15)' }}
                className="btn-primary"
              >
                Start Free Interview →
              </Button>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.65, duration: 0.4 }}
            style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>✓ No credit card</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>✓ Free forever plan</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>✓ 10k+ users</span>
          </motion.div>
        </div>

        <div className="laptop-3d-wrapper" style={{ perspective: '2000px' }}>
          <motion.div
            style={{ position: 'relative', width: '100%', maxWidth: '580px', cursor: 'pointer', transformStyle: 'preserve-3d' }}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5, delay: 0.6 }}
            whileHover={{ scale: 1.04, rotateX: 4, rotateY: -4, z: 10, transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] } }}
          >
            <img src={laptopImg} alt="Callback Mock Interview Stage" style={{ width: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 30px 60px rgba(27, 35, 64, 0.18))' }} />
          </motion.div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ padding: '0 max(24px, calc((100vw - 1200px) / 2))', position: 'relative', zIndex: 1 }}>
        <div className="stats-bar">
          {[{ num: '50,000+', label: 'Interviews Conducted' }, { num: '4.9/5', label: 'Average Rating' }, { num: '95%', label: 'Success Rate' }, { num: '500+', label: 'Companies Covered' }].map((s, i) => (
            <motion.div key={i} className="stat-item" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div className="stat-number">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── COMPANY LOGOS ── */}
      <section style={{ padding: '32px max(24px, calc((100vw - 1200px) / 2))', borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)', background: '#FFFFFF', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '20px' }}>Trusted by candidates targeting</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', flexWrap: 'wrap', alignItems: 'center' }}>
          {['Google', 'Amazon', 'Microsoft', 'Meta', 'Apple', 'Netflix', 'Adobe'].map((c, idx) => (
            <span key={idx} style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', opacity: 0.3, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em', transition: 'opacity 0.2s' }} onMouseEnter={e => e.target.style.opacity = '0.7'} onMouseLeave={e => e.target.style.opacity = '0.3'}>{c}</span>
          ))}
        </div>
      </section>

      {/* ── D. PRACTICE ROOM CARDS (3 columns) ── */}
      <section className="rooms-section" id="rooms-section" style={{ padding: '100px max(24px, calc((100vw - 1200px) / 2))' }}>
        <motion.div style={{ textAlign: 'center', marginBottom: '56px' }} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="eyebrow-dot" /> Practice Rooms
          </div>
          <h2 className="heading-section">Specialized mock interview environments</h2>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '12px', maxWidth: '520px', margin: '12px auto 0' }}>Choose your track and get AI-tailored questions based on your resume and target role.</p>
        </motion.div>

        <div className="practice-selector-container">
          {[
            { icon: '🖥️', title: 'Software Engineer', desc: 'DSA, System Design, Coding and more. Write fully compiled code inside our sandbox.' },
            { icon: '📊', title: 'Data Scientist', desc: 'ML, Statistics, SQL, Python and more. Run diagnostics on model layouts and queries.' },
            { icon: '📋', title: 'Product Manager', desc: 'Case Studies, Product Sense, Strategy and more. Evaluate delivery pacing and structure.' }
          ].map((card, idx) => (
            <div 
              className={`practice-selector-row role-${idx}`} 
              key={idx} 
              onClick={() => navigate('/upload')}
            >
              <div className="practice-left-accent-bar" />
              <span className="practice-row-icon">{card.icon}</span>
              <div className="practice-row-text">
                <h3 className="practice-row-title">{card.title}</h3>
                <p className="practice-row-desc">{card.desc}</p>
              </div>
              <div className="practice-row-arrow">→</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── E. HOW IT WORKS ── */}
      <section className="how-it-works-section" style={{ padding: '90px max(24px, calc((100vw - 1200px) / 2))', background: '#FFFFFF', borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 className="heading-section">How It Works?</h2>
        </div>

        <div className="timeline-container">
          {/* Horizontal line (desktop) */}
          <div className="timeline-line-horizontal-wrapper">
            <svg className="timeline-line-svg-h" viewBox="0 0 1000 10" preserveAspectRatio="none">
              {/* Background track */}
              <path d="M 0,5 L 1000,5" fill="none" stroke="#EAE6DD" strokeWidth="3" />
              
              {/* Active segments */}
              {[
                "M 0,5 L 125,5",
                "M 125,5 L 375,5",
                "M 375,5 L 625,5",
                "M 625,5 L 875,5",
                "M 875,5 L 1000,5"
              ].map((dVal, sIdx) => {
                const isGlowing = hoveredStep === sIdx || (sIdx === 0 && hoveredStep === 0);
                return (
                  <motion.path
                    key={sIdx}
                    d={dVal}
                    fill="none"
                    stroke={isGlowing ? "var(--accent-brand)" : "rgba(217, 142, 43, 0.3)"}
                    strokeWidth={isGlowing ? "5" : "3"}
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: sIdx * 0.15 }}
                    style={{
                      filter: isGlowing ? "drop-shadow(0 0 6px var(--accent-brand))" : "none",
                      transition: "stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease"
                    }}
                  />
                );
              })}
            </svg>
          </div>

          {/* Vertical line (mobile) */}
          <div className="timeline-line-vertical-wrapper">
            <svg className="timeline-line-svg-v" viewBox="0 0 10 1000" preserveAspectRatio="none">
              {/* Background track */}
              <path d="M 5,0 L 5,1000" fill="none" stroke="#EAE6DD" strokeWidth="3" />
              
              {/* Active segments */}
              {[
                "M 5,0 L 5,125",
                "M 5,125 L 5,375",
                "M 5,375 L 5,625",
                "M 5,625 L 5,875",
                "M 5,875 L 5,1000"
              ].map((dVal, sIdx) => {
                const isGlowing = hoveredStep === sIdx || (sIdx === 0 && hoveredStep === 0);
                return (
                  <motion.path
                    key={sIdx}
                    d={dVal}
                    fill="none"
                    stroke={isGlowing ? "var(--accent-brand)" : "rgba(217, 142, 43, 0.3)"}
                    strokeWidth={isGlowing ? "5" : "3"}
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: sIdx * 0.15 }}
                    style={{
                      filter: isGlowing ? "drop-shadow(0 0 6px var(--accent-brand))" : "none",
                      transition: "stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease"
                    }}
                  />
                );
              })}
            </svg>
          </div>

          <div className="timeline-steps">
            {[
              { num: '01', icon: '💡', title: 'Choose Role', desc: 'Select the role and duration of interview' },
              { num: '02', icon: '💬', title: 'AI Asks Questions', desc: 'AI interviewer asks tailored questions in real-time' },
              { num: '03', icon: '🎤', title: 'Answer Naturally', desc: 'Speak or type your answers like a real interview' },
              { num: '04', icon: '📋', title: 'Get Detailed Report', desc: 'Receive AI feedback with scores and suggestions' }
            ].map((step, idx) => (
              <div 
                className="timeline-step" 
                key={idx}
                onMouseEnter={() => setHoveredStep(idx)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                {/* Desktop top section */}
                <div className="timeline-step-top-desktop">
                  <div className="timeline-step-icon-bounce">
                    {step.icon}
                  </div>
                  <h4 className="timeline-step-title">
                    {step.title}
                  </h4>
                </div>

                {/* The Node on the line */}
                <div className="timeline-node-wrapper">
                  <motion.div 
                    className="timeline-node"
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 260, 
                      damping: 15,
                      delay: idx * 0.3 + 0.3 
                    }}
                  >
                    {step.num}
                  </motion.div>
                </div>

                {/* Desktop bottom section & Mobile text container */}
                <div className="timeline-step-content-box">
                  <div className="timeline-step-mobile-header">
                    <span className="timeline-step-mobile-icon">{step.icon}</span>
                    <h4 className="timeline-step-mobile-title">{step.title}</h4>
                  </div>
                  <p className="timeline-step-desc">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── F. WHY CALLBACK GRID ── */}
      <section className="features-section" id="features-section" style={{ padding: '90px max(24px, calc((100vw - 1200px) / 2))' }}>
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 className="heading-section">Why Callback?</h2>
        </div>

        <div className="why-editorial-list">
          {[
            { icon: '🎙️', title: 'AI Voice Interview', desc: 'Experience real-time voice conversations with AI Interviewers.' },
            { icon: '📄', title: 'Resume Based Questions', desc: 'Questions are generated from your resume and experience.' },
            { icon: '💻', title: 'Coding Round', desc: 'Live coding evaluation with AI-powered assistance.' },
            { icon: '👥', title: 'Behavioral Round', desc: 'HR-style behavioral questions and situational scenarios.' },
            { icon: '⚡', title: 'Instant Feedback', desc: 'Communication, Grammar, Confidence, Eye Contact, Vocabulary and more.' },
            { icon: '📊', title: 'ATS Resume Review', desc: 'Get your resume reviewed and optimized for ATS systems.' }
          ].map((item, idx) => {
            const numStr = String(idx + 1).padStart(2, '0');
            const cycleIdx = idx % 3;
            return (
              <motion.div 
                className={`why-editorial-row accent-row-${cycleIdx}`}
                key={idx} 
                initial={{ opacity: 0, y: 24 }} 
                whileInView={{ opacity: 1, y: 0 }} 
                viewport={{ once: true }} 
                transition={{ delay: idx * 0.08 }}
              >
                <div className={`why-editorial-number accent-color-${cycleIdx}`}>{numStr}</div>
                <div className="why-editorial-heading-group">
                  <span className="why-editorial-icon">{item.icon}</span>
                  <h4 className="why-editorial-title">{item.title}</h4>
                </div>
                <div className="why-editorial-desc">{item.desc}</div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── G. DETAILED ANALYTICS ── */}
      <section 
        ref={setSectionRef}
        className="analytics-section" 
        style={{ 
          padding: '120px max(24px, calc((100vw - 1200px) / 2))', 
          background: '#FAF9F6', 
          borderTop: '1px solid rgba(27, 35, 64, 0.04)', 
          borderBottom: '1px solid rgba(27, 35, 64, 0.04)', 
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Ambient Aurora Blobs */}
        <div className="aurora-blob aurora-1" />
        <div className="aurora-blob aurora-2" />

        <style>{`
          .analytics-section {
            --accent-brand: #D98E2B;
            --ease-micro: cubic-bezier(0.34, 1.56, 0.64, 1);
            --ease-entrance: cubic-bezier(0.22, 1, 0.36, 1);
            --ease-exit: cubic-bezier(0.4, 0, 1, 1);
          }

          /* Ambient Aurora Animation */
          .aurora-blob {
            position: absolute;
            filter: blur(140px);
            border-radius: 50%;
            opacity: 0.08;
            pointer-events: none;
            z-index: 0;
            will-change: transform;
          }
          .aurora-1 {
            width: 450px;
            height: 450px;
            background: radial-gradient(circle, #D98E2B 0%, transparent 70%);
            top: -100px;
            left: -100px;
            animation: float-aurora-1 26s ease-in-out infinite;
          }
          .aurora-2 {
            width: 550px;
            height: 550px;
            background: radial-gradient(circle, #7C3AED 0%, transparent 70%);
            bottom: -150px;
            right: -100px;
            animation: float-aurora-2 32s ease-in-out infinite;
          }
          @keyframes float-aurora-1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(80px, 50px) scale(1.15); }
          }
          @keyframes float-aurora-2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-60px, -70px) scale(0.9); }
          }

          /* Easing & Stagger Reveals */
          .reveal-item {
            opacity: 0;
            transform: translateY(24px) scale(0.98);
            transition: opacity 500ms var(--ease-entrance),
                        transform 500ms var(--ease-entrance);
            will-change: transform, opacity;
          }
          .reveal-item.visible {
            opacity: 1;
            transform: translateY(0) scale(1);
          }

          .analytics-eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(217, 142, 43, 0.08);
            color: #D98E2B;
            padding: 6px 14px;
            border-radius: 99px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 24px;
            border: 1px solid rgba(217, 142, 43, 0.15);
          }
          .analytics-heading {
            font-size: clamp(34px, 4vw, 50px);
            font-weight: 850;
            color: #0F172A; /* Deep Navy */
            line-height: 1.12;
            letter-spacing: -0.04em;
            margin-bottom: 24px;
            font-family: var(--font-display);
          }
          .analytics-desc {
            font-size: 15.5px;
            color: #4A5568;
            line-height: 1.8;
            margin-bottom: 36px;
            max-width: 480px;
          }
          .analytics-checklist {
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .analytics-check-item {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .analytics-check-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background: rgba(5, 150, 105, 0.08);
            border: 1px solid rgba(5, 150, 105, 0.2);
            color: #059669;
            border-radius: 50%;
            font-size: 12px;
            font-weight: 800;
            flex-shrink: 0;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
          .analytics-check-text {
            font-size: 14.5px;
            font-weight: 600;
            color: #1E293B;
          }

          /* Dashboard Mockup Frame */
          .db-mock-wrapper {
            perspective: 1400px;
            width: 100%;
            z-index: 10;
          }
          .db-mock-container {
            background: #0B0F19; /* SaaS Dark Navy Charcoal */
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            box-shadow: 
              0 30px 60px -15px rgba(0, 0, 0, 0.35), 
              0 0 0 1px rgba(255, 255, 255, 0.03),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
            overflow: hidden;
            display: grid;
            grid-template-columns: 150px 1fr;
            transition: transform 600ms var(--ease-entrance), box-shadow 600ms var(--ease-entrance);
            transform: rotateX(3deg) rotateY(-6deg) rotateZ(0.5deg);
            transform-style: preserve-3d;
          }
          .db-mock-container:hover {
            transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) translateY(-6px);
            box-shadow: 
              0 45px 90px -20px rgba(0, 0, 0, 0.55), 
              0 0 0 1px rgba(255, 255, 255, 0.05),
              inset 0 1px 0 rgba(255, 255, 255, 0.15);
          }
          @media (max-width: 992px) {
            .db-mock-container {
              transform: none !important;
            }
          }
          @media (max-width: 680px) {
            .db-mock-container {
              grid-template-columns: 1fr;
            }
            .db-sidebar {
              border-right: none;
              border-bottom: 1px solid rgba(255, 255, 255, 0.06);
              padding: 16px 20px;
            }
          }
          .db-sidebar {
            background: #070A12;
            padding: 28px 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            border-right: 1px solid rgba(255, 255, 255, 0.06);
          }
          .db-main {
            background: #0C111D; /* Deep Rich Dark Charcoal */
            padding: 32px;
          }
          .db-nav-item {
            font-size: 11px;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.45);
            cursor: pointer;
            transition: color 250ms var(--ease-micro), transform 250ms var(--ease-micro), background-color 250ms var(--ease-micro);
            padding: 7px 10px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .db-nav-item:hover {
            color: #FFFFFF;
            background: rgba(255, 255, 255, 0.04);
            transform: translateX(3px);
          }
          .db-nav-item.active {
            color: #D98E2B;
            background: rgba(217, 142, 43, 0.1);
            border: 1px solid rgba(217, 142, 43, 0.15);
          }
          
          /* Interactive Stat Cards */
          .db-stat-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 24px;
          }
          @media (max-width: 640px) {
            .db-stat-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          @media (max-width: 440px) {
            .db-stat-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          .db-stat-card {
            background: rgba(255, 255, 255, 0.02);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 14px;
            padding: 14px 12px;
            text-align: left;
            transition: 
              transform 300ms var(--ease-micro), 
              background-color 300ms var(--ease-micro), 
              border-color 300ms var(--ease-micro), 
              box-shadow 300ms var(--ease-micro);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            cursor: pointer;
            position: relative;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
          }
          .db-stat-card:hover {
            transform: translateY(-6px) scale(1.015);
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(217, 142, 43, 0.4);
            box-shadow: 
              0 12px 24px -8px rgba(0, 0, 0, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          .db-stat-card.active {
            background: rgba(217, 142, 43, 0.08);
            border-color: rgba(217, 142, 43, 0.5);
            box-shadow: 
              0 12px 24px -8px rgba(217, 142, 43, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          .db-stat-icon-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.04);
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 8px;
            transition: transform 300ms var(--ease-micro) 50ms, background-color 300ms var(--ease-micro), color 300ms var(--ease-micro);
          }
          .db-stat-card:hover .db-stat-icon-wrapper {
            background: rgba(217, 142, 43, 0.15);
            color: #D98E2B;
            transform: scale(1.08) rotate(4deg);
          }
          .db-stat-card.active .db-stat-icon-wrapper {
            background: #D98E2B;
            color: #FFFFFF;
          }
          .db-stat-label {
            font-size: 8.5px;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.04em;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .db-stat-value {
            font-size: 16px;
            font-weight: 850;
            color: #FFFFFF;
            line-height: 1.2;
          }
          .db-stat-trend {
            font-size: 9px;
            font-weight: 700;
            color: #10B981; /* Emerald-500 */
            display: flex;
            align-items: center;
            gap: 2px;
            margin-top: 6px;
          }
          
          /* Chart Card */
          .db-chart-card {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 14px;
            padding: 20px;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
            transition: border-color 300ms var(--ease-micro), box-shadow 300ms var(--ease-micro);
          }
          .db-chart-card:hover {
            border-color: rgba(217, 142, 43, 0.2);
          }

          /* Waveform elements */
          .waveform-container {
            display: flex;
            gap: 2px;
            align-items: center;
            height: 12px;
          }
          .wave-bar {
            width: 1.5px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 99px;
          }
          .db-stat-card:hover .wave-bar {
            background: #D98E2B;
          }
          @keyframes wave-1 { 0%, 100% { height: 3px; } 50% { height: 10px; } }
          @keyframes wave-2 { 0%, 100% { height: 4px; } 50% { height: 12px; } }
          @keyframes wave-3 { 0%, 100% { height: 2px; } 50% { height: 8px; } }
          @keyframes wave-4 { 0%, 100% { height: 5px; } 50% { height: 11px; } }
          .wave-bar-1 { animation: wave-1 0.74s ease-in-out infinite; }
          .wave-bar-2 { animation: wave-2 0.96s ease-in-out infinite 0.1s; }
          .wave-bar-3 { animation: wave-3 0.65s ease-in-out infinite 0.2s; }
          .wave-bar-4 { animation: wave-4 0.82s ease-in-out infinite 0.05s; }

          /* Custom Bar Chart styling */
          .chart-bars-row {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            height: 90px;
            padding-top: 10px;
            position: relative;
          }
          .chart-bar-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: 0 4px;
            position: relative;
            cursor: pointer;
          }
          .chart-bar-fill {
            width: 100%;
            max-width: 24px;
            border-radius: 4px 4px 0 0;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-bottom: none;
            transition: 
              height 400ms var(--ease-entrance), 
              background 300ms var(--ease-micro), 
              border-color 300ms var(--ease-micro),
              box-shadow 300ms var(--ease-micro);
            height: 0;
            position: relative;
          }
          .chart-bar-container:hover .chart-bar-fill {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.2);
          }
          .chart-bar-container.highlighted .chart-bar-fill {
            background: linear-gradient(to top, #D98E2B, #FF9F43);
            border-color: rgba(255, 255, 255, 0.2);
            box-shadow: 0 4px 12px rgba(217, 142, 43, 0.35);
          }
          
          /* Tooltip styles */
          .chart-tooltip {
            position: absolute;
            bottom: 100%;
            background: #1E293B;
            color: #FFFFFF;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 700;
            margin-bottom: 6px;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 200ms var(--ease-micro), transform 200ms var(--ease-micro);
            pointer-events: none;
            white-space: nowrap;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
          .chart-bar-container:hover .chart-tooltip {
            opacity: 1;
            transform: translateY(0);
          }
        `}</style>

        <div className="split-deep-dive">
          {/* Left Text Column */}
          <div className={`reveal-item ${sectionInView ? 'visible' : ''}`} style={{ transitionDelay: '0ms' }}>
            <div className="analytics-eyebrow">
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#D98E2B', boxShadow: '0 0 8px #D98E2B' }} />
              Detailed Analytics
            </div>
            <h2 className="analytics-heading">Track. Improve. Succeed.</h2>
            <p className="analytics-desc">
              Get in-depth analysis of your performance across multiple parameters. We analyze facial expressions, speech speed, fillers, and core knowledge.
            </p>

            <div className="analytics-checklist">
              {[
                "Overall Score & Sectional Breakdown",
                "Performance Trends & Progress over time",
                "Strengths & Key Areas of Improvement",
                "Interactive video playback with audio transcripts"
              ].map((item, idx) => (
                <div 
                  className={`analytics-check-item reveal-item ${sectionInView ? 'visible' : ''}`} 
                  key={idx} 
                  style={{ transitionDelay: `${80 + idx * 80}ms` }}
                >
                  <span className="analytics-check-icon">✓</span>
                  <span className="analytics-check-text">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Dashboard Mockup Column */}
          <div className="db-mock-wrapper">
            <div 
              className={`db-mock-container reveal-item ${sectionInView ? 'visible' : ''}`} 
              style={{ transitionDelay: '300ms' }}
            >
              {/* Sidebar */}
              <div className="db-sidebar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FFFFFF', fontWeight: 800, fontSize: '12px', marginBottom: '20px', letterSpacing: '-0.02em' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-brand)', boxShadow: '0 0 10px var(--accent-brand)' }} />
                  Callback
                </div>
                {[
                  { label: 'Dashboard', active: true },
                  { label: 'Interviews' },
                  { label: 'Practice' },
                  { label: 'Reports' },
                  { label: 'Resume Review' },
                  { label: 'Settings' }
                ].map((item, idx) => (
                  <div key={idx} className={`db-nav-item ${item.active ? 'active' : ''}`}>
                    <span style={{ fontSize: '10px' }}>
                      {idx === 0 && '📊'}
                      {idx === 1 && '💬'}
                      {idx === 2 && '🎯'}
                      {idx === 3 && '📈'}
                      {idx === 4 && '📄'}
                      {idx === 5 && '⚙️'}
                    </span>
                    {item.label}
                  </div>
                ))}
              </div>

              {/* Main Panel */}
              <div className="db-main">
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Welcome back, Vishal! 👋</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent-brand)', background: 'rgba(217, 142, 43, 0.15)', border: '1px solid rgba(217, 142, 43, 0.2)', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.04em' }}>Pro Account</span>
                </div>
                
                {/* Stat Cards Grid with Icons */}
                <div className="db-stat-grid">
                  {[
                    {
                      id: 'overall',
                      title: 'Overall Score',
                      val: 87,
                      chg: '↑ 12%',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                        </svg>
                      )
                    },
                    {
                      id: 'confidence',
                      title: 'Confidence',
                      val: 91,
                      chg: '↑ 4%',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                        </svg>
                      )
                    },
                    {
                      id: 'technical',
                      title: 'Technical',
                      val: 84,
                      chg: '↑ 10%',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                        </svg>
                      )
                    },
                    {
                      id: 'delivery',
                      title: 'Delivery',
                      val: 90,
                      chg: '↑ 15%',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/>
                        </svg>
                      ),
                      extra: (
                        <div className="waveform-container" style={{ marginTop: '4px' }}>
                          <span className="wave-bar wave-bar-1" />
                          <span className="wave-bar wave-bar-2" />
                          <span className="wave-bar wave-bar-3" />
                          <span className="wave-bar wave-bar-4" />
                        </div>
                      )
                    },
                    {
                      id: 'eyecontact',
                      title: 'Eye Contact',
                      val: 78,
                      chg: '↑ 8%',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      )
                    }
                  ].map((stat) => (
                    <div 
                      key={stat.id} 
                      className={`db-stat-card ${activeMetric === stat.id ? 'active' : ''}`}
                      onClick={() => setActiveMetric(stat.id)}
                    >
                      <div>
                        <div className="db-stat-icon-wrapper">
                          {stat.icon}
                        </div>
                        <div className="db-stat-label">{stat.title}</div>
                        <div className="db-stat-value">
                          <AnimatedNumber value={stat.val} duration={500} />
                        </div>
                      </div>
                      {stat.extra ? stat.extra : <div className="db-stat-trend">{stat.chg}</div>}
                    </div>
                  ))}
                </div>

                {/* Animated/Gradient Trend Chart Card */}
                <div className="db-chart-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', marginBottom: '16px' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Performance Trend ({activeMetric})</span>
                    <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                      ↑ {activeMetric === 'overall' ? '12%' : activeMetric === 'confidence' ? '4%' : activeMetric === 'technical' ? '10%' : activeMetric === 'delivery' ? '15%' : '8%'} vs baseline
                    </span>
                  </div>
                  
                  {/* Grid of bars */}
                  <div className="chart-bars-row">
                    {/* Y-axis grid lines */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 0 }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.05)', width: '100%', height: 0 }} />
                      ))}
                    </div>

                    {chartData[activeMetric].map((score, sIdx) => {
                      const isLatest = sIdx === 6;
                      return (
                        <div 
                          key={sIdx} 
                          className={`chart-bar-container ${isLatest ? 'highlighted' : ''}`}
                        >
                          <div className="chart-tooltip">{score}%</div>
                          <div 
                            className="chart-bar-fill" 
                            style={{ height: sectionInView ? `${score}%` : '0%' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Chart X axis labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '8.5px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.3)', letterSpacing: '0.02em', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                    <span>Sess 1</span>
                    <span>Sess 2</span>
                    <span>Sess 3</span>
                    <span>Sess 4</span>
                    <span>Sess 5</span>
                    <span>Sess 6</span>
                    <span style={{ color: 'var(--accent-brand)' }}>Latest</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── I. INTERVIEW CATEGORIES ── */}
      <section style={{ padding: '90px max(24px, calc((100vw - 1200px) / 2))', textAlign: 'center', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="eyebrow-dot" /> Interview Topics
          </div>
          <h2 className="heading-section" style={{ marginBottom: '36px' }}>Topics & technologies covered</h2>
        </motion.div>

        <div className="cloud-container">
          {/* Connection Lines (low-opacity SVGs connecting related topics) */}
          <svg className="cloud-connections-svg">
            <line x1="22%" y1="78%" x2="12%" y2="55%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="25%" y1="30%" x2="50%" y2="50%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="50%" y1="50%" x2="88%" y2="55%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="88%" y1="55%" x2="80%" y2="75%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="30%" y1="10%" x2="42%" y2="15%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="42%" y1="15%" x2="52%" y2="8%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="75%" y1="35%" x2="68%" y2="60%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="62%" y1="80%" x2="68%" y2="60%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="60%" y1="20%" x2="68%" y2="60%" stroke="rgba(217, 142, 43, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
          </svg>

          {[
            { name: 'System Design', importance: 'high', type: 'filled', x: 50, y: 50, id: 'sys-design' },
            { name: 'DSA', importance: 'high', type: 'outlined', x: 25, y: 30, id: 'dsa' },
            { name: 'AI / ML', importance: 'high', type: 'underlined', x: 75, y: 35, id: 'ai-ml' },
            { name: 'Frontend', importance: 'medium', type: 'outlined', x: 12, y: 55, id: 'frontend' },
            { name: 'Backend', importance: 'medium', type: 'filled', x: 88, y: 55, id: 'backend' },
            { name: 'React', importance: 'medium', type: 'underlined', x: 22, y: 78, id: 'react' },
            { name: 'Node.js', importance: 'medium', type: 'outlined', x: 80, y: 75, id: 'nodejs' },
            { name: 'DevOps', importance: 'medium', type: 'filled', x: 42, y: 15, id: 'devops' },
            { name: 'SQL', importance: 'medium', type: 'outlined', x: 60, y: 20, id: 'sql' },
            { name: 'Python', importance: 'medium', type: 'underlined', x: 62, y: 80, id: 'python' },
            { name: 'Java', importance: 'low', type: 'outlined', x: 40, y: 85, id: 'java' },
            { name: 'AWS', importance: 'low', type: 'filled', x: 30, y: 10, id: 'aws' },
            { name: 'Docker', importance: 'low', type: 'outlined', x: 52, y: 8, id: 'docker' },
            { name: 'Kubernetes', importance: 'low', type: 'underlined', x: 92, y: 18, id: 'k8s' },
            { name: 'Data Science', importance: 'medium', type: 'filled', x: 68, y: 60, id: 'datascience' },
            { name: 'HR & Behavior', importance: 'medium', type: 'outlined', x: 36, y: 65, id: 'hr-behavior' },
            { name: 'Product Manager', importance: 'medium', type: 'underlined', x: 50, y: 32, id: 'pm' }
          ].map((tag, idx) => {
            let translateX = 0;
            let translateY = 0;

            if (hoveredTag && hoveredTag.id !== tag.id) {
              const dx = tag.x - hoveredTag.x;
              const dy = tag.y - hoveredTag.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < 25 && distance > 0) {
                const force = (25 - distance) / 25;
                translateX = (dx / distance) * force * 16;
                translateY = (dy / distance) * force * 16;
              }
            }

            return (
              <div
                className="cloud-tag-wrapper"
                key={tag.id}
                style={{
                  left: `${tag.x}%`,
                  top: `${tag.y}%`,
                  transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px)`
                }}
                onMouseEnter={() => setHoveredTag(tag)}
                onMouseLeave={() => setHoveredTag(null)}
              >
                <div className={`cloud-tag-bobbing bob-delay-${idx % 5}`}>
                  <span className={`tag-pill importance-${tag.importance} type-${tag.type}`}>
                    {tag.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── J. LOVED BY THOUSANDS OF CANDIDATES ── */}
      <section style={{ padding: '100px max(24px, calc((100vw - 1200px) / 2))', background: 'transparent', borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)' }}>
        <motion.div style={{ textAlign: 'center', marginBottom: '56px' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="eyebrow-dot" /> Success Stories
          </div>
          <h2 className="heading-section">Loved by Thousands of Candidates</h2>
        </motion.div>

        <div className="testimonials-grid">
          {[
            { quote: "Callback helped me crack my dream job at Google. The AI feedback is super accurate!", name: "Rohit Verma", role: "SDE @ Google", avatar: "👨" },
            { quote: "The most realistic mock interview platform I've used. Highly recommended!", name: "Ananya Singh", role: "DS @ Microsoft", avatar: "👩" },
            { quote: "The detailed analytics and resume review feature is a game changer!", name: "Karan Mehta", role: "PM @ Amazon", avatar: "👨" }
          ].map((t, idx) => (
            <motion.div 
              className="testimonial-pull-quote-col" 
              key={idx} 
              initial={{ opacity: 0, y: 30 }} 
              whileInView={{ opacity: 1, y: 0 }} 
              viewport={{ once: true }} 
              transition={{ delay: idx * 0.15, duration: 0.6, ease: "easeOut" }}
            >
              <div className="testimonial-quote-mark">“</div>
              <div>
                <div className="testimonial-stars">★★★★★</div>
                <blockquote className="testimonial-quote-text">
                  “{t.quote}”
                </blockquote>
              </div>
              <div>
                <div className="testimonial-attribution-divider" />
                <div className="testimonial-meta-row">
                  <div className="testimonial-avatar-inline">{t.avatar}</div>
                  <div>
                    <h4 className="testimonial-attribution-name">{t.name}</h4>
                    <p className="testimonial-attribution-role">{t.role}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── K. PRICING ── */}
      <section className="pricing-section" id="pricing-section" style={{ padding: '100px max(24px, calc((100vw - 1200px) / 2))' }}>
        <motion.div style={{ textAlign: 'center', marginBottom: '56px' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="eyebrow-dot" /> Simple Plans
          </div>
          <h2 className="heading-section">Transparent, Simple Pricing</h2>
        </motion.div>

        <div className="pricing-grid">
          {/* Free Tier */}
          <motion.div className="pricing-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0 }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '14px', color: 'var(--text-primary)' }}>Free</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '24px' }}>
                <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)' }}>₹0</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>/ forever</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {['3 Mock Interviews / month', 'Basic Performance Report', 'Resume Review (Limited)', 'Community Support'].map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent-brand)' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="secondary" size="md" fullWidth onClick={() => navigate('/upload')} style={{ marginTop: '24px' }}>
              Get Started
            </Button>
          </motion.div>

          {/* Pro Tier (Popular) */}
          <motion.div className="pricing-card popular" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <span className="pricing-popular-badge">Most Popular</span>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '14px', color: 'var(--text-primary)' }}>Pro</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '24px' }}>
                <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)' }}>₹499</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>/ month</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {['Unlimited Mock Interviews', 'Detailed AI Performance Breakdown', 'Resume Review (Full ATS Opt)', 'Priority Support & Feedback', 'Performance Analytics Trendline'].map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent-brand)' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="primary" size="md" fullWidth onClick={() => navigate('/upload')} style={{ marginTop: '24px' }}>
              Start Pro Trial
            </Button>
          </motion.div>

          {/* Enterprise Tier */}
          <motion.div className="pricing-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '14px', color: 'var(--text-primary)' }}>Enterprise</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '24px' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>Custom Pricing</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {['Team Roles & Permissions', 'Bulk Interview Creation', 'Company-Wide Metrics Dashboard', 'Dedicated Success Manager'].map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent-brand)' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="secondary" size="md" fullWidth onClick={() => navigate('/upload')} style={{ marginTop: '24px' }}>
              Contact Sales
            </Button>
          </motion.div>
        </div>

        {/* Accordion FAQ Component */}
        <div className="faq-container" id="about-section">
          <motion.div style={{ textAlign: 'center', margin: '80px 0 40px' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="heading-section" style={{ fontSize: '28px' }}>Frequently Asked Questions</h2>
          </motion.div>
          {faqs.map((faq, index) => (
            <motion.div className="faq-item" key={index} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }}>
              <button className="faq-question" onClick={() => toggleFaq(index)}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{faq.q}</span>
                <span className={`faq-chevron ${activeFaq === index ? 'open' : ''}`}>▼</span>
              </button>
              <div className={`faq-answer ${activeFaq === index ? 'open' : ''}`}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>{faq.a}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── L. CLOSING CTA BANNER ── */}
      <section style={{ padding: '0 max(24px, calc((100vw - 1200px) / 2)) 100px' }}>
        <motion.div className="closing-cta-band" initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <h2 className="heading-section" style={{ marginBottom: '16px' }}>Ready to crack your next interview?</h2>
          <p style={{ fontSize: '15px', maxWidth: '540px', margin: '0 auto 32px', lineHeight: 1.7 }}>
            Join 50,000+ candidates who have already improved their interview performance.
          </p>
          <Button variant="secondary" size="lg" onClick={() => navigate('/upload')} style={{ background: 'var(--accent-brand)', color: '#FFFFFF', border: 'none', boxShadow: '0 8px 24px rgba(217, 142, 43, 0.25)' }}>
            Start Free Interview →
          </Button>
        </motion.div>
      </section>

      {/* ── M. FOOTER ── */}
      <footer className="footer-container">
        <div className="footer-column">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-brand)' }} />
            Callback
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: '220px' }}>
            AI-powered mock interviews to help you practice, improve and get hired.
          </p>
        </div>
        
        <div className="footer-column">
          <h4>Product</h4>
          <ul>
            <li><span onClick={() => navigate('/upload')} style={{ cursor: 'pointer' }}>Features</span></li>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Interview Library</span></li>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Pricing</span></li>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Integrations</span></li>
          </ul>
        </div>
        <div className="footer-column">
          <h4>Company</h4>
          <ul>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>About Us</span></li>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Careers</span></li>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Contact</span></li>
            <li><span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Privacy Policy</span></li>
          </ul>
        </div>
      </footer>
      <div style={{ textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--border-glass)', background: 'transparent', fontSize: '11px', color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} Callback. All rights reserved.
      </div>
    </div>
  );
}
