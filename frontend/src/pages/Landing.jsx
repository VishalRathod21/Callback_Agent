import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import Navbar from '../components/ui/Navbar';
import './Landing.css';

// ── DRIFTING AURORA BACKGROUND
function AuroraBackground() {
  return (
    <div className="aurora-container">
      <div className="aurora-blob aurora-1" />
      <div className="aurora-blob aurora-2" />
      <div className="aurora-blob aurora-3" />
    </div>
  );
}

// ── TYPEWRITER PREVIEW COMPONENT
function TypewriterPreview() {
  const questions = [
    "Walk me through a time you had to architect a system under significant performance constraints. What tradeoffs did you make?",
    "How would you design a rate limiter that supports 10 million requests per second across distributed nodes?",
    "Tell me about a conflict with a team member on a critical deadline. How did you resolve it?"
  ];

  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");

  useEffect(() => {
    let active = true;
    let timer;
    let charIndex = 0;
    let isTyping = true;

    const type = () => {
      if (!active) return;
      const fullText = questions[questionIndex];
      setCurrentText(fullText.substring(0, charIndex));
      charIndex++;

      if (charIndex > fullText.length) {
        isTyping = false;
        timer = setTimeout(erase, 2500);
      } else {
        timer = setTimeout(type, 28 + Math.random() * 20);
      }
    };

    const erase = () => {
      if (!active) return;
      const fullText = questions[questionIndex];
      setCurrentText(fullText.substring(0, charIndex));
      charIndex--;

      if (charIndex < 0) {
        isTyping = true;
        setQuestionIndex((prev) => (prev + 1) % questions.length);
      } else {
        timer = setTimeout(erase, 12);
      }
    };

    timer = setTimeout(type, 1200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [questionIndex]);

  return (
    <div style={{
      fontSize: '14px',
      color: 'var(--text-primary)',
      lineHeight: 1.65,
      borderLeft: '2px solid var(--accent-gold)',
      paddingLeft: '14px',
      minHeight: '52px',
      fontFamily: 'var(--font-sans)',
    }}>
      {currentText}
      <span className="cursor-blink"></span>
    </div>
  );
}

// ── WAVEFORM COMPONENT
function Waveform() {
  const bars = Array.from({ length: 24 });
  return (
    <div className="waveform">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className="wave-bar"
          animate={{
            scaleY: [0.3, 1, 0.3],
            height: [8, 24, 8]
          }}
          transition={{
            duration: 0.6 + Math.random() * 0.8,
            repeat: Infinity,
            delay: i * 0.03,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

// ── TIMER COMPONENT
function Timer() {
  const [secs, setSecs] = useState(522);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
      00:{m}:{s}
    </span>
  );
}

// ── STATS COUNTER COMPONENT
function StatItem({ target, suffix = "", label, showDivider = true }) {
  const [val, setVal] = useState("0");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (inView) {
      const targetNum = parseFloat(target);
      if (isNaN(targetNum)) return;

      const isFloat = String(target).includes('.');
      let start = 0;
      const duration = 1500;
      let startTime = null;

      const step = (ts) => {
        if (!startTime) startTime = ts;
        const prog = Math.min((ts - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - prog, 3); // easeOutCubic

        let currentVal;
        if (isFloat) {
          currentVal = (start + (targetNum - start) * ease).toFixed(1);
        } else {
          currentVal = Math.floor(start + (targetNum - start) * ease).toLocaleString();
        }

        setVal(currentVal + (targetNum > 100 && !isFloat ? '+' : '') + suffix);

        if (prog < 1) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    }
  }, [inView, target, suffix]);

  return (
    <div className="stat-item" ref={ref}>
      <div style={{ fontSize: 'var(--text-4xl)', fontWeight: 800, color: 'var(--accent-gold)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {val}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
        {label}
      </div>
      {showDivider && <div className="stat-divider" />}
    </div>
  );
}

// ── BENTO PERFORMANCE COMPONENT
function BentoPerformance() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const scores = [
    { label: "Structure", val: 92 },
    { label: "Delivery", val: 84 },
    { label: "Tech Accuracy", val: 89 },
    { label: "Confidence", val: 76 }
  ];

  return (
    <motion.div
      ref={ref}
      className="feature-card-bento wide"
      whileHover={{ y: -4, scale: 1.005, borderColor: "rgba(242, 184, 75, 0.25)" }}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div>
        <div style={{ display: 'inline-flex', padding: '8px', background: 'rgba(242, 184, 75, 0.06)', border: '1px solid rgba(242, 184, 75, 0.2)', borderRadius: '8px', fontSize: '18px', marginBottom: '16px' }}>📊</div>
        <div className="bento-eyebrow">Performance Tracking</div>
        <h3 className="bento-h">Real-time score breakdown across every dimension</h3>
        <p className="bento-p">
          See exactly where you're strong — structure, delivery, technical accuracy, confidence — all scored live per session.
        </p>
      </div>
      <div className="score-bars" style={{ marginTop: '24px' }}>
        {scores.map((score, i) => (
          <div className="sb-row" key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <span className="sb-label" style={{ width: '120px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{score.label}</span>
            <div className="sb-track" style={{ flex: 1, height: '4px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '99px', overflow: 'hidden' }}>
              <motion.div
                className="sb-fill"
                style={{ height: '100%', background: 'var(--accent-gold)', borderRadius: '99px' }}
                initial={{ width: 0 }}
                animate={inView ? { width: `${score.val}%` } : {}}
                transition={{ duration: 1.2, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', width: '28px', textAlign: 'right' }}>{score.val}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  // Animation variants
  const staggerContainer = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const itemFadeUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <div className="landing-root">
      <div className="noise-overlay" />
      <AuroraBackground />
      <Navbar />

      {/* ── HERO SECTION ── */}
      <section className="hero-layout">
        <motion.div 
          className="hero-left"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <motion.div 
            variants={itemFadeUp}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: 'rgba(242, 184, 75, 0.06)',
              border: '1px solid rgba(242, 184, 75, 0.18)',
              borderRadius: '99px',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--accent-gold)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '28px'
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--accent-gold)', boxShadow: '0 0 6px var(--accent-gold)' }} />
            ✦ Rehearse with specialized agents
          </motion.div>

          <motion.h1 className="heading-hero" variants={itemFadeUp}>
            Master the room<br />
            before you <span style={{ color: 'var(--accent-gold)', position: 'relative' }}>walk inside.</span>
          </motion.h1>

          <motion.p 
            variants={itemFadeUp}
            style={{
              fontSize: 'clamp(14px, 2vw, 17px)',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              maxWidth: '540px',
              margin: '0 0 32px 0'
            }}
          >
            Callback is a theater green room for technical professionals. Upload credentials, practice mock behavioral and systems stages, and optimize your pitch before the real interview.
          </motion.p>

          <motion.div className="hero-cta-group" variants={itemFadeUp}>
            <motion.button 
              className="btn-cta-primary"
              onClick={() => navigate('/upload')}
              whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(242, 184, 75, 0.35)' }}
              whileTap={{ scale: 0.98 }}
              style={{
                height: '52px',
                padding: '0 30px',
                background: 'var(--accent-gold)',
                border: 'none',
                borderRadius: '8px',
                color: '#0A0A0B',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              ⚡ Launch Rehearsal Room
            </motion.button>
            <motion.button 
              className="btn-cta-secondary"
              onClick={() => navigate('/pricing')}
              whileHover={{ borderColor: 'rgba(242, 184, 75, 0.3)', color: '#ffffff' }}
              style={{
                height: '52px',
                padding: '0 28px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              Explore Pricing
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Floating preview card */}
        <motion.div 
          className="preview-card-container"
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="preview-card glass-panel" style={{ overflow: 'hidden' }}>
            <div className="preview-topbar">
              <div className="rec-group">
                <span className="rec-dot" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--danger)', fontWeight: 700, letterSpacing: '0.08em' }}>REC</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }}>//</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>STAGE_SESSION_03</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--success-green)' }}>
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--success-green)' }} /> LIVE_FEED
                </span>
                <Timer />
              </div>
            </div>
            <div className="preview-body">
              <div className="preview-left">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--accent-gold)', letterSpacing: '0.06em', marginBottom: '8px' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--accent-gold)' }} /> AI INTERVIEWER
                  </div>
                  <TypewriterPreview />
                </div>
                <Waveform />
              </div>
              <div className="preview-right">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Live Diagnostics</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '42px', fontWeight: 800, color: 'var(--success-green)', lineHeight: 1, fontFamily: 'var(--font-display)' }}>88</span>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>/100</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Structure', val: '92%' },
                    { label: 'Delivery', val: '84%' },
                    { label: 'Tech Accuracy', val: '89%' },
                    { label: 'Confidence', val: '76%' }
                  ].map((metric, index) => (
                    <div key={index}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                        <span>{metric.label}</span>
                        <span>{metric.val}</span>
                      </div>
                      <div style={{ height: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: metric.val, backgroundColor: index % 2 === 0 ? 'var(--success-green)' : 'var(--accent-gold)', borderRadius: '99px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── TRUST STATS BAR ── */}
      <section className="stats-bar">
        <StatItem target="42000" label="Rehearsals completed" />
        <StatItem target="22.5" suffix="%" label="Avg. performance increase" />
        <StatItem target="4.8" suffix="/5" label="Candidate satisfaction" />
        <StatItem target="91.4" suffix="%" label="Hired within 60 days" showDivider={false} />
      </section>

      {/* ── SPECIALIZED SIMULATION ROOMS ── */}
      <section className="rooms-section" style={{ padding: '80px max(24px, calc((100vw - 1200px) / 2))' }}>
        <div className="eyebrow">
          <span className="eyebrow-dot" /> Practice Rooms
        </div>
        <h2 className="heading-section" style={{ margin: '8px 0 var(--space-8) 0' }}>Specialized simulation rooms</h2>
        
        <div className="rooms-grid">
          {/* DSA Algorithmic Round - 2x DOMINANT CARD */}
          <motion.div 
            className="room-card-bento dominant"
            onClick={() => navigate('/upload')}
            whileHover={{ y: -6, borderColor: 'rgba(168, 85, 247, 0.3)' }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
              <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '8px', fontSize: '24px' }}>⚡</div>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent-violet)', background: 'rgba(168, 85, 247, 0.08)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.15)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Most Popular</span>
            </div>
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>DSA Algorithmic Round</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
                Write code in our fully integrated Monaco sandbox editor. Evaluated for execution correctness, algorithmic Big-O complexity, and optimal space-time structures.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span className="room-tag">Monaco Sandbox</span>
                <span className="room-tag">Execution Correctness</span>
                <span className="room-tag">Big-O Complexity</span>
              </div>
            </div>
          </motion.div>

          {/* Systems & Architecture */}
          <motion.div 
            className="room-card-bento"
            onClick={() => navigate('/upload')}
            whileHover={{ y: -6, borderColor: 'rgba(59, 130, 246, 0.3)' }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', fontSize: '24px', alignSelf: 'flex-start' }}>🏗️</div>
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>Systems & Architecture</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                Design replication models, partition strategies, failovers, and scalable caching architectures.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span className="room-tag">System Design</span>
                <span className="room-tag">Caching</span>
              </div>
            </div>
          </motion.div>

          {/* STAR Behavioral */}
          <motion.div 
            className="room-card-bento"
            onClick={() => navigate('/upload')}
            whileHover={{ y: -6, borderColor: 'rgba(62, 207, 142, 0.3)' }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(62, 207, 142, 0.06)', border: '1px solid rgba(62, 207, 142, 0.2)', borderRadius: '8px', fontSize: '24px', alignSelf: 'flex-start' }}>🎭</div>
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>STAR Behavioral</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                Rehearse conflict, leadership, and ownership scenarios scored on clarity, pacing, and delivery.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span className="room-tag">Communication</span>
                <span className="room-tag">STAR</span>
              </div>
            </div>
          </motion.div>

          {/* HR & Negotiation */}
          <motion.div 
            className="room-card-bento"
            onClick={() => navigate('/upload')}
            whileHover={{ y: -6, borderColor: 'rgba(242, 184, 75, 0.3)' }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(242, 184, 75, 0.06)', border: '1px solid rgba(242, 184, 75, 0.2)', borderRadius: '8px', fontSize: '24px', alignSelf: 'flex-start' }}>💼</div>
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>Salary Negotiation</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                Navigate compensation packages and recruiter alignment screens. Evaluated for tone positioning.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span className="room-tag">Offer Strategy</span>
                <span className="room-tag">Negotiation</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── PLATFORM FEATURES BENTO ── */}
      <section style={{ padding: '0 max(24px, calc((100vw - 1200px) / 2)) 80px' }}>
        <div className="eyebrow">
          <span className="eyebrow-dot" /> Platform Features
        </div>
        <h2 className="heading-section" style={{ margin: '8px 0 var(--space-8) 0' }}>Everything you need to land the role</h2>

        <div className="features-grid">
          {/* Feature 1: Performance (Dominant 2x wide card) */}
          <BentoPerformance />

          {/* Feature 2: Leaderboard (1x card) */}
          <motion.div 
            className="feature-card-bento"
            whileHover={{ y: -4, scale: 1.005, borderColor: "rgba(255, 255, 255, 0.08)" }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <div style={{ display: 'inline-flex', padding: '8px', background: 'rgba(242, 184, 75, 0.06)', border: '1px solid rgba(242, 184, 75, 0.2)', borderRadius: '8px', fontSize: '18px', marginBottom: '16px' }}>🏆</div>
              <div className="bento-eyebrow">Leaderboard</div>
              <h3 className="bento-h">See where you rank globally</h3>
              <p className="bento-p">Compare metrics against engineering peers globally.</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '16px' }}>
              <div className="lb-grid-row first">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700 }}>#1</span>
                  <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 500 }}>Arjun R.</span>
                </div>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--success-green)', fontWeight: 600 }}>94%</span>
              </div>
              <div className="lb-grid-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>#2</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Priya S.</span>
                </div>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--success-green)' }}>91%</span>
              </div>
              <div className="lb-grid-row you">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700 }}>#4</span>
                  <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>You</span>
                </div>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--success-green)', fontWeight: 700 }}>88%</span>
              </div>
            </div>
          </motion.div>

          {/* Feature 3: History (2x wide card) */}
          <motion.div 
            className="feature-card-bento wide"
            whileHover={{ y: -4, scale: 1.005, borderColor: "rgba(255, 255, 255, 0.08)" }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <div style={{ display: 'inline-flex', padding: '8px', background: 'rgba(242, 184, 75, 0.06)', border: '1px solid rgba(242, 184, 75, 0.2)', borderRadius: '8px', fontSize: '18px', marginBottom: '16px' }}>🕐</div>
              <div className="bento-eyebrow">Interview History</div>
              <h3 className="bento-h">Every session saved — track your improvement arc</h3>
              <p className="bento-p">Review full transcripts, complexity diagnostics, and targeted AI recommendations from past attempts.</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
              {[
                { type: '🏗️', role: 'Systems & Architecture', time: '2 days ago · 47 min', score: '88%', status: 'Passed', color: 'var(--success-green)' },
                { type: '⚡', role: 'DSA Algorithmic Round', time: '5 days ago · 38 min', score: '74%', status: 'Review', color: 'var(--accent-gold)' }
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '16px' }}>{item.type}</span>
                    <div>
                      <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: 500 }}>{item.role}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.time}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color }}>{item.score}</span>
                    <span style={{ fontSize: '8px', fontWeight: 600, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', padding: '2px 6px', background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30`, borderRadius: '4px' }}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Feature 4: Practice Mode (1x card) */}
          <motion.div 
            className="feature-card-bento"
            whileHover={{ y: -4, scale: 1.005, borderColor: "rgba(255, 255, 255, 0.08)" }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <div style={{ display: 'inline-flex', padding: '8px', background: 'rgba(242, 184, 75, 0.06)', border: '1px solid rgba(242, 184, 75, 0.2)', borderRadius: '8px', fontSize: '18px', marginBottom: '16px' }}>🔄</div>
              <div className="bento-eyebrow">Practice Mode</div>
              <h3 className="bento-h">Unlimited retries, zero judgment</h3>
              <p className="bento-p">Attempt rounds indefinitely. Dynamic prompt triggers generate unique follow-ups every retry.</p>
            </div>
            
            <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Systems Round · 3 attempts</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>64</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: 'var(--text-secondary)' }}>72</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: 'var(--success-green)', fontWeight: 700 }}>88</span>
                <span style={{ fontSize: '10px', color: 'var(--success-green)', marginLeft: 'auto', fontWeight: 600 }}>↑ +24</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── RECRUITER / B2B SECTION ── */}
      <section style={{ padding: '0 max(24px, calc((100vw - 1200px) / 2)) 80px' }} id="recruiter-section">
        <div className="recruiter-cta-band">
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div className="bento-eyebrow" style={{ color: 'var(--accent-gold)' }}>For Recruiters & Hiring Teams</div>
            <h2 className="heading-section" style={{ color: '#ffffff', margin: '8px 0 16px 0', lineHeight: 1.15 }}>Screen smarter.<br />Hire faster.</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '480px', marginBottom: '24px' }}>
              Utilize Callback to automate pre-screening at scale. Conduct AI-graded simulations covering DSAs, systems design, and behavioral benchmarks.
            </p>
            <div style={{ display: 'flex', gap: '32px' }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-gold)', fontFamily: 'var(--font-display)' }}>80%</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.02em' }}>Screening time saved</div>
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-gold)', fontFamily: 'var(--font-display)' }}>3x</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.02em' }}>More candidates screened</div>
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-gold)', fontFamily: 'var(--font-display)' }}>94%</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.02em' }}>Manager satisfaction</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }} className="rec-btns">
            <motion.button 
              onClick={() => navigate('/upload')}
              whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(242, 184, 75, 0.25)' }}
              style={{ height: '44px', padding: '0 24px', background: 'var(--accent-gold)', color: '#0A0A0B', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              Request recruiter demo →
            </motion.button>
            <button 
              onClick={() => navigate('/upload')}
              style={{ height: '44px', padding: '0 24px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 200ms ease' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
            >
              View admin dashboard
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '32px max(24px, calc((100vw - 1200px) / 2))',
        background: 'rgba(10,10,11,0.5)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-gold)' }} />
          Callback
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          {['Privacy', 'Terms', 'Docs', 'Contact'].map((l, i) => (
            <span key={i} onClick={() => navigate('/')} style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 150ms ease' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Built for engineers, by engineers.
        </div>
      </footer>
    </div>
  );
}
