import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Navbar from '../components/ui/Navbar';
import './Landing.css';

/* ── Live Typewriter Transcript Line ── */
function TypewriterTranscript() {
  const lines = [
    { type: 'interviewer', text: 'Tell me about a time you had to make a complex architecture trade-off.' },
    { type: 'candidate', text: 'In my last role, we had to choose between a Cassandra database for write throughput versus PostgreSQL for relational schema validation. I led a comparative benchmark measuring latency...' }
  ];

  const [visibleChars, setVisibleChars] = useState(0);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);

  useEffect(() => {
    const textToType = lines[currentLineIdx].text;
    const t = setInterval(() => {
      setVisibleChars(prev => {
        if (prev < textToType.length) {
          return prev + 2; // type speed
        } else {
          clearInterval(t);
          // Wait 3 seconds, then cycle to next line
          setTimeout(() => {
            setCurrentLineIdx(prevIdx => (prevIdx + 1) % lines.length);
            setVisibleChars(0);
          }, 3500);
          return prev;
        }
      });
    }, 35);
    return () => clearInterval(t);
  }, [currentLineIdx]);

  return (
    <div className="typewriter-transcript">
      {lines.map((line, idx) => {
        if (idx > currentLineIdx) return null;
        const textToShow = idx === currentLineIdx 
          ? line.text.substring(0, visibleChars) 
          : line.text;

        const isTyping = idx === currentLineIdx && visibleChars < line.text.length;

        return (
          <div key={idx} className={`typewriter-line ${line.type}`}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '10px', display: 'block', marginBottom: '2px', fontFamily: 'var(--font-sans)' }}>
              {line.type === 'interviewer' ? 'AI INTERVIEWER' : 'REHEARSING (YOU)'}
            </span>
            <span className={isTyping ? 'typewriter-caret' : ''}>
              {textToShow}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Count Up Stats Counter ── */
function StatCounter({ target, suffix, prefix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const end = parseFloat(target);
        if (isNaN(end)) return;

        const duration = 1500;
        const startTime = performance.now();

        const animate = (time) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // easeOutExpo
          const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          const current = start + (end - start) * ease;
          
          if (target.includes('.')) {
            setVal(current.toFixed(1));
          } else {
            setVal(Math.floor(current));
          }

          if (progress < 1) requestAnimationFrame(animate);
          else setVal(end);
        };
        requestAnimationFrame(animate);
        observer.disconnect();
      }
    }, { threshold: 0.1 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="social-stat-num mono-data">
      {prefix}{val.toLocaleString()}{suffix}
    </span>
  );
}

/* ── Horizontal metric bar-fill ── */
function MetricBar({ label, value }) {
  const [width, setWidth] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setWidth(value);
        observer.disconnect();
      }
    }, { threshold: 0.2 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--paper-dim)', marginBottom: '5px', fontWeight: 600, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{width}%</span>
      </div>
      <div style={{ height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${width}%`, background: 'var(--spotlight)', borderRadius: 'var(--radius-full)', transition: 'width 1.5s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: '0 0 8px rgba(242,184,75,0.2)' }} />
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  // Scroll reveal cards
  const cardRefs = useRef([]);
  cardRefs.current = [];

  const addToRefs = (el) => {
    if (el && !cardRefs.current.includes(el)) cardRefs.current.push(el);
  };

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    cardRefs.current.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-root">
      <Navbar />

      {/* Spotlight drifting glows */}
      <div className="spotlight-glow" style={{ top: '15%', left: '30%' }} />
      <div className="spotlight-glow" style={{ top: '60%', left: '80%' }} />

      {/* HERO SECTION */}
      <section className="hero-container">
        <div className="hero-eyebrow">
          <Badge variant="warning">✦ Rehearse with specialized agents</Badge>
        </div>
        <h1 className="hero-headline">
          Master the room before you <span className="highlight">walk inside it.</span>
        </h1>
        <p className="hero-subtext">
          Callback is a theater green room for technical professionals. Upload your credentials, practice mock behavioral and systems stages, and optimize your pitch before the real interview.
        </p>

        <div className="hero-actions">
          <Button variant="primary" size="lg" onClick={() => navigate('/upload')}>
            Launch Rehearsal Room
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate('/pricing')}>
            Explore Pricing Plans
          </Button>
        </div>

        {/* Signature Hero Mockup Stage Visual */}
        <div className="stage-visual-panel">
          {/* Left panel: prompter transcript */}
          <div>
            <div className="stage-rec-header">
              <div className="stage-rec-tag">
                <span className="rec-dot" />
                <span>REC // STAGE_SESSION_03</span>
              </div>
              <div className="voice-wave-container">
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
              </div>
            </div>
            <TypewriterTranscript />
          </div>

          {/* Right panel: metrics */}
          <div className="stage-metrics-panel">
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 700 }}>
                Live diagnostics
              </div>
              <div className="stage-score-large">
                <span className="stage-score-val">88</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', color: 'var(--paper-dimmer)' }}>/100</span>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <MetricBar label="Structure & Framework" value={92} />
              <MetricBar label="Delivery & Pacing" value={84} />
              <MetricBar label="Technical Accuracy" value={89} />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE GRID SECTION */}
      <section className="landing-section">
        <div className="section-header">
          <Badge variant="default">PRACTICE ROOMS</Badge>
          <h2 className="section-title">Specialized simulation rooms</h2>
          <p className="section-desc">Choose your stage. Each environment tests specific criteria modeled on actual high-growth tech rubrics.</p>
        </div>

        <div className="practice-grid">
          {[
            {
              title: 'STAR Behavioral Room',
              desc: 'Rehearse project conflict and ownership scenarios. Evaluated for STAR methodology alignment, pacing, and presence.',
              accent: 'var(--prompter-green)',
              tags: ['Communication', 'Leadership', 'STAR Framework']
            },
            {
              title: 'Systems & Architecture Room',
              desc: 'Design replication models, failovers, and caching architectures. Focuses on data modeling consistency and scalability tradeoffs.',
              accent: 'var(--blue)',
              tags: ['System Design', 'Caching', 'Replication']
            },
            {
              title: 'HR & Salary Negotiations',
              desc: 'Navigate tricky salary negotiations and recruiter alignment screens. Evaluated for tone control, positioning, and leverage.',
              accent: 'var(--spotlight)',
              tags: ['Offer Strategy', 'Alignment', 'HR Screen']
            },
            {
              title: 'DSA Algorithmic Round',
              desc: 'Write code in our sandbox compiler. Evaluated for execution correctness, Big-O complexity, and handling of tricky edge cases.',
              accent: 'var(--rec-red)',
              tags: ['Monaco Sandbox', 'Correctness', 'Time Complexity']
            }
          ].map((item, idx) => (
            <div
              key={idx}
              ref={addToRefs}
              className="practice-card"
              style={{ opacity: 0, transform: 'translateY(24px)', transition: 'all 0.6s var(--ease)' }}
            >
              <div className="practice-card-accent-tab" style={{ backgroundColor: item.accent }} />
              <div className="practice-card-body">
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
              <div className="practice-card-footer">
                {item.tags.map((tag, tIdx) => (
                  <Badge key={tIdx} variant="default">{tag}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <section className="social-proof-strip">
        <div className="social-proof-container">
          <div className="social-stat-item">
            <StatCounter target="42000" suffix="+" />
            <div className="social-stat-label">Rehearsals Completed</div>
          </div>
          <div className="social-stat-item">
            <StatCounter target="22.5" suffix="%" />
            <div className="social-stat-label font-sans">Avg. Performance Increase</div>
          </div>
          <div className="social-stat-item">
            <StatCounter target="4.8" suffix="/5" />
            <div className="social-stat-label">Candidate Satisfaction</div>
          </div>
          <div className="social-stat-item">
            <StatCounter target="91.4" suffix="%" />
            <div className="social-stat-label">Hired Within 60 Days</div>
          </div>
        </div>
      </section>

      {/* FINAL CTA BAND */}
      <section className="final-cta-band">
        <div className="final-cta-container">
          <h2>Ready to walk into the room?</h2>
          <p>Don't wing your next critical session. Run through the scenes, practice your lines, and walk on stage with absolute certainty.</p>
          <Button variant="primary" size="lg" onClick={() => navigate('/upload')}>
            Launch Rehearsal Room
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div>© {new Date().getFullYear()} Callback Inc. All rights reserved.</div>
          <div>BACKSTAGE MOCK INTERVIEWS // REHEARSE SECURELY</div>
        </div>
      </footer>
    </div>
  );
}
