import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/ui/Navbar';
import HeroCanvas from '../components/ui/HeroCanvas';
import Lenis from 'lenis';
import './Landing.css';

const CHAPTER_DATA = [
  { 
    id: 0, 
    shortLabel: "01 Intro", 
    eyebrow: "01 / INTERVIEW OPERATING SYSTEM", 
    title: "CALLBACK.", 
    desc: "The ultra-realistic AI mock interview chamber for software engineers. Upload your resume, speak to adaptive interviewer panels, solve coding problems in real-time, and receive detailed diagnostic speech and technical feedback." 
  },
  { 
    id: 1, 
    shortLabel: "02 Resume", 
    eyebrow: "02 / RESUME ANALYSIS", 
    title: "RESUME INTAKE.", 
    desc: "Uplink your credentials. Our AI scans your real projects and background, formulating custom-tailored, project-specific questions rather than generic templates." 
  },
  { 
    id: 2, 
    shortLabel: "03 Panel", 
    eyebrow: "03 / PANEL SYNTHESIS", 
    title: "BOARD ASSEMBLES.", 
    desc: "Three specialized AI interviewers assemble (e.g. Deep-Dive Architect, Fast-Paced Startup Lead). They query you in different styles, simulating a real cross-functional panel." 
  },
  { 
    id: 3, 
    shortLabel: "04 Voice", 
    eyebrow: "04 / VOICE INTERACTIVE", 
    title: "REAL VOICE FEEDBACK.", 
    desc: "Talk naturally. Our low-latency vocal sensor measures your speech cadence, identifies filler words, and triggers context-aware follow-up questions." 
  },
  { 
    id: 4, 
    shortLabel: "05 Coding", 
    eyebrow: "05 / CODING INTERACTIVE", 
    title: "SANDBOX RUNTIME.", 
    desc: "Write clean algorithms in the integrated editor. The AI runs tests against your logic while you explain your time and space complexity out loud." 
  },
  { 
    id: 5, 
    shortLabel: "06 Analysis", 
    eyebrow: "06 / DIAGNOSTICS ENGINE", 
    title: "DETAILED METRICS.", 
    desc: "Get instant scorecards evaluating technical accuracy, system scalability, speech speed, filler words, and communication authority." 
  },
  { 
    id: 6, 
    shortLabel: "07 Evolved", 
    eyebrow: "07 / RESUME ITERATION", 
    title: "RESUME REWRITES.", 
    desc: "The loop closes. Callback identifies gaps in your interview performance, automatically suggests ATS keyword optimization, and rewrites bullet points." 
  },
  { 
    id: 7, 
    shortLabel: "08 Success", 
    eyebrow: "08 / CALLBACK CONFIDENCE", 
    title: "CHAMBER COMPLETE.", 
    desc: "Practice anytime. No scheduling, no peer pressure. Master the real pressure of tech interviews and land your callbacks." 
  }
];

export default function Landing() {
  const navigate = useNavigate();
  
  // Story states
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(0);

  // States for the interactive voice test (Chapter 4)
  const [demoState, setDemoState] = useState('idle');
  const [demoVolume, setDemoVolume] = useState(0);
  const [isDemoRecording, setIsDemoRecording] = useState(false);
  const [demoTranscript, setDemoTranscript] = useState("Click to activate your microphone and test the AI chamber response.");
  
  // Refs for audio analyzer
  const demoAudioCtxRef = useRef(null);
  const demoAnalyserRef = useRef(null);
  const demoStreamRef = useRef(null);
  const demoTimerRef = useRef(null);

  // Mouse telemetry position
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [telemetry, setTelemetry] = useState({ pitch: '0°', yaw: '0°', zoom: '1.0X' });

  // 1. Initialize Lenis Smooth Scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.6,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    const handleScroll = () => {
      const storyScrollHeight = window.innerHeight * 7;
      const currentScroll = window.scrollY;
      const progress = Math.min(1.0, currentScroll / storyScrollHeight);
      
      setScrollProgress(progress);
      
      const chapterIndex = Math.min(7, Math.floor(progress * 7.99));
      setCurrentChapter(chapterIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      lenis.destroy();
    };
  }, []);

  // 2. Global Mouse Telemetry
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      
      const px = ((e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)) * 30;
      const py = -((e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)) * 30;
      
      setTelemetry({
        pitch: `${py.toFixed(1)}°`,
        yaw: `${px.toFixed(1)}°`,
        zoom: (1.0 + Math.abs(px) * 0.003).toFixed(2) + 'X'
      });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 3. Voice Recording sandbox handlers (Chapter 4)
  const startDemoMic = async () => {
    try {
      if (isDemoRecording) {
        stopDemoMicAndProcess();
        return;
      }

      setDemoTranscript("Sensor recording... Speak technical description now.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      demoStreamRef.current = stream;
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      demoAudioCtxRef.current = ctx;
      
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      demoAnalyserRef.current = analyser;
      
      setIsDemoRecording(true);
      setDemoState('listening');

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!demoAnalyserRef.current) return;
        demoAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(avg / 60, 1.0);
        setDemoVolume(normalized);
        
        if (demoStreamRef.current) {
          requestAnimationFrame(updateVolume);
        }
      };
      updateVolume();

      demoTimerRef.current = setTimeout(() => {
        stopDemoMicAndProcess();
      }, 4000);

    } catch (err) {
      console.warn('Mic block, running simulator:', err);
      setDemoTranscript("Sensor processing simulated audio frequency...");
      setDemoState('listening');
      setIsDemoRecording(true);
      
      let t = 0;
      const interval = setInterval(() => {
        setDemoVolume(Math.abs(Math.sin(t)) * 0.7);
        t += 0.35;
      }, 80);

      demoTimerRef.current = setTimeout(() => {
        clearInterval(interval);
        stopDemoMicAndProcess();
      }, 3500);
    }
  };

  const stopDemoMicAndProcess = () => {
    if (demoStreamRef.current) {
      demoStreamRef.current.getTracks().forEach(track => track.stop());
      demoStreamRef.current = null;
    }
    if (demoAudioCtxRef.current && demoAudioCtxRef.current.state !== 'closed') {
      demoAudioCtxRef.current.close();
    }
    clearTimeout(demoTimerRef.current);
    setIsDemoRecording(false);
    setDemoVolume(0);
    setDemoState('processing');
    setDemoTranscript("Decompressing CADENCE telemetry, filler rate index, and clarity vectors...");

    setTimeout(() => {
      setDemoState('ai_speaking');
      setDemoTranscript('"Telemetry approved. Consistency score: 94%. Welcome to the Callback Chamber."');

      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance("Telemetry approved. Consistency score 94%. Welcome to the Callback Chamber.");
        utterance.onend = () => {
          setDemoState('idle');
          setDemoVolume(0);
          setDemoTranscript("Demo complete. Press vocal sensor to test again.");
        };
        window.speechSynthesis.speak(utterance);
      } else {
        setTimeout(() => {
          setDemoState('idle');
          setDemoVolume(0);
          setDemoTranscript("Demo complete. Press vocal sensor to test again.");
        }, 3200);
      }
    }, 1800);
  };

  return (
    <div className="landing-root">
      <div className="noise-overlay" />
      
      {/* 3D Story Section Container (800vh height track) */}
      <div className="story-scroll-track">
        
        {/* Cinematic sticky overlay containing all UI, narrative overlay text, and dots */}
        <div className="cinematic-overlay">
          <Navbar />

          {/* Global Telemetry HUD Frame */}
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />
          <div className="global-hud">
            <div>SYS_LOCK: SEC_0{currentChapter + 1}</div>
            <div>CHAMBER_STATUS: RUNNING // {Math.round(scrollProgress * 100)}%</div>
          </div>

          {/* Active Chapter Headline - Bottom Left */}
          <div className="chapter-text-container">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentChapter}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.8 }}
              >
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> {CHAPTER_DATA[currentChapter].eyebrow}
                </div>
                <h1 className="luxury-headline chapter-headline" style={{ margin: '8px 0 16px 0' }}>
                  {CHAPTER_DATA[currentChapter].title}
                </h1>
                <p className="luxury-subcopy chapter-subcopy" style={{ marginBottom: '24px' }}>
                  {CHAPTER_DATA[currentChapter].desc}
                </p>

                {/* Chapter 0 CTA */}
                {currentChapter === 0 && (
                  <motion.div 
                    className="cta-group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    style={{ marginTop: '20px' }}
                  >
                    <button 
                      className="luxury-button-solid"
                      onClick={() => navigate('/upload')}
                    >
                      Start Free
                    </button>
                    <button 
                      className="luxury-button-glass"
                      onClick={() => {
                        const targetScroll = window.innerHeight * 7;
                        window.scrollTo({ top: targetScroll, behavior: 'smooth' });
                      }}
                    >
                      Watch Story
                    </button>
                  </motion.div>
                )}

                {/* Special interactive voice test inside Chapter 4 */}
                {currentChapter === 3 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    style={{ width: '100%', maxWidth: '340px', marginTop: '12px' }}
                  >
                    <button
                      className="luxury-button-solid"
                      onClick={startDemoMic}
                      style={{ width: '100%', height: '42px', fontSize: '11px', padding: '0 16px' }}
                    >
                      {demoState === 'listening' ? 'Sensor Recording...' : demoState === 'processing' ? 'Processing...' : 'Test Vocal Sensor'}
                    </button>
                    <p style={{ fontSize: '10px', color: '#888888', marginTop: '8px', lineHeight: 1.4, fontFamily: 'var(--font-code)' }}>
                      {demoTranscript}
                    </p>
                  </motion.div>
                )}

                {/* Special interactive compile tag inside Chapter 5 */}
                {currentChapter === 4 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ fontSize: '10px', color: '#666666', fontFamily: 'var(--font-code)', marginTop: '8px' }}
                  >
                    &gt; compiling... state: RUN_OK (time complexity: O(log N))
                  </motion.div>
                )}

                {/* Chapter 8 CTA */}
                {currentChapter === 7 && (
                  <motion.div 
                    className="cta-group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <button 
                      className="luxury-button-solid"
                      onClick={() => navigate('/upload')}
                    >
                      Enter Chamber
                    </button>
                    <button 
                      className="luxury-button-glass"
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Replay Journey
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Chapter Navigation Dots on the Right */}
          <div className="chapter-nav-dots">
            {CHAPTER_DATA.map((ch, idx) => (
              <div 
                key={ch.id} 
                className={`nav-dot ${idx === currentChapter ? 'active' : ''}`}
                onClick={() => {
                  const targetScroll = (idx / 7) * (window.innerHeight * 7);
                  window.scrollTo({ top: targetScroll, behavior: 'smooth' });
                }}
              >
                <span className="nav-dot-tooltip">{ch.shortLabel}</span>
              </div>
            ))}
          </div>

          {/* Dynamic Scroll mouse indicator */}
          {currentChapter === 0 && (
            <div className="scroll-indicator">
              <span>SCROLL TO DESCEND</span>
              <div className="scroll-indicator-mouse">
                <div className="scroll-indicator-wheel" />
              </div>
            </div>
          )}
        </div>

        {/* Centerpiece 3D Canvas */}
        <HeroCanvas turnState={demoState} volume={demoVolume} phase={currentChapter} />
      </div>

      {/* Detailed Landing Page Content Section */}
      <div className="details-section">
        <div className="details-container">
          
          {/* Section 1: What is Callback & Who is it for */}
          <section className="details-block">
            <div className="section-header">
              <span className="eyebrow"><span className="eyebrow-dot" /> THE SYSTEM</span>
              <h2 className="luxury-section-title">WHAT IS CALLBACK?</h2>
              <p className="luxury-section-desc">
                Callback is the complete, always-available AI Interview Prep suite. It is designed to bridge the gap between solving coding problems in isolation and performing under pressure in front of real panels.
              </p>
            </div>
            
            <div className="audience-grid">
              <div className="audience-card">
                <div className="card-hud-id">AUDIENCE // 01</div>
                <h3>Students & Freshers</h3>
                <p>Build confidence for campus recruitment and FAANG screenings. Master standard DSA patterns while practicing your verbal communication.</p>
              </div>
              <div className="audience-card">
                <div className="card-hud-id">AUDIENCE // 02</div>
                <h3>Experienced Engineers</h3>
                <p>Prepare for senior/lead roles. Practice defending your architectural choices, explaining trade-offs, and diving deep into your actual resume experience.</p>
              </div>
              <div className="audience-card">
                <div className="card-hud-id">AUDIENCE // 03</div>
                <h3>Specialized Tech Tracks</h3>
                <p>Tailored interview modules for AI/ML, Backend, Frontend, Full Stack, Data Science, and Product Management engineering.</p>
              </div>
            </div>
          </section>

          {/* Section 2: Why it Exists (The Problem) */}
          <section className="details-block">
            <div className="problem-comparison">
              <div className="problem-panel solo-trap">
                <div className="panel-hud">DIAGNOSTIC // THE SOLO PREP TRAP</div>
                <h3>Staring at a text screen.</h3>
                <ul>
                  <li>Candidates memorize coding templates but struggle to talk through their logic.</li>
                  <li>Static platforms never test your poise, speech pacing, or project defense.</li>
                  <li>Real interview pressure cannot be replicated by reading tutorials.</li>
                </ul>
              </div>
              
              <div className="problem-panel callback-solution">
                <div className="panel-hud">SOLUTION // THE CALLBACK CHAMBER</div>
                <h3>Active, adaptive simulation.</h3>
                <ul>
                  <li>Defend your actual resume choices against a dynamic AI panel.</li>
                  <li>Low-latency speech sensing forces you to explain trade-offs under pressure.</li>
                  <li>Solve coding challenges while receiving real-time voice follow-ups.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3: How it Works */}
          <section className="details-block">
            <div className="section-header">
              <span className="eyebrow"><span className="eyebrow-dot" /> PIPELINE</span>
              <h2 className="luxury-section-title">THE INTEGRATED JOURNEY</h2>
              <p className="luxury-section-desc">
                A seamless, continuous preparation loop that connects your resume directly to your performance scorecards.
              </p>
            </div>
            
            <div className="journey-flow">
              <div className="journey-step">
                <div className="step-num">01</div>
                <div className="step-content">
                  <h4>Uplink Resume</h4>
                  <p>Upload your PDF. Callback parses your real projects, technologies, and achievements.</p>
                </div>
              </div>
              <div className="journey-step">
                <div className="step-num">02</div>
                <div className="step-content">
                  <h4>Panel Synthesis</h4>
                  <p>AI generates three specialized interviewer personas matching your target company profile.</p>
                </div>
              </div>
              <div className="journey-step">
                <div className="step-num">03</div>
                <div className="step-content">
                  <h4>The Chamber</h4>
                  <p>Engage in a live technical/voice interview, combining coding sandboxes with verbal explanations.</p>
                </div>
              </div>
              <div className="journey-step">
                <div className="step-num">04</div>
                <div className="step-content">
                  <h4>Real-Time Follow-Ups</h4>
                  <p>The panel doesn't stick to templates. It dynamically probes your limits based on your live answers.</p>
                </div>
              </div>
              <div className="journey-step">
                <div className="step-num">05</div>
                <div className="step-content">
                  <h4>Diagnostics & Scorecards</h4>
                  <p>Receive comprehensive analytics on communication pace, runtime complexity, and code accuracy.</p>
                </div>
              </div>
              <div className="journey-step">
                <div className="step-num">06</div>
                <div className="step-content">
                  <h4>Resume Optimization Loop</h4>
                  <p>Callback updates your resume ATS tags and bullet points based on your verified performance.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Why Candidates Choose Callback */}
          <section className="details-block">
            <div className="section-header">
              <span className="eyebrow"><span className="eyebrow-dot" /> CAPABILITIES</span>
              <h2 className="luxury-section-title">WHY ENGINEERS PREP HERE</h2>
            </div>
            
            <div className="capabilities-grid">
              <div className="capability-item">
                <h4>Practice Anytime</h4>
                <p>No scheduling conflicts or calendar management. The chamber is ready when you are.</p>
              </div>
              <div className="capability-item">
                <h4>Speech Telemetry</h4>
                <p>Track your WPM pace, vocal clarity, and filler-word patterns in real-time.</p>
              </div>
              <div className="capability-item">
                <h4>Adaptive Follow-Ups</h4>
                <p>AI interviewers query your logic, asking "Why?" to test depth of understanding.</p>
              </div>
              <div className="capability-item">
                <h4>Integrated Compiler</h4>
                <p>A sandboxed environment to write, test, and explain your code side-by-side.</p>
              </div>
              <div className="capability-item">
                <h4>Privacy-First Tech</h4>
                <p>Your speech logs, code, and resume data are processed securely and belong to you.</p>
              </div>
              <div className="capability-item">
                <h4>Confidence Metrics</h4>
                <p>Measure performance improvements across multiple sessions to track readiness.</p>
              </div>
            </div>
          </section>

          {/* Section 5: The Comparison Matrix */}
          <section className="details-block">
            <div className="section-header">
              <span className="eyebrow"><span className="eyebrow-dot" /> BENCHMARK</span>
              <h2 className="luxury-section-title">HOW CALLBACK COMPARES</h2>
              <p className="luxury-section-desc">
                An objective breakdown of how Callback integrates features that generic or human-based tools leave fragmented.
              </p>
            </div>
            
            <div className="comparison-table-wrapper">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th className="highlight-column">Callback</th>
                    <th>LeetCode</th>
                    <th>ChatGPT</th>
                    <th>Interviewing.io</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Interactive Voice Flow</td>
                    <td className="highlight-column">Yes (Ultra-low latency)</td>
                    <td>No</td>
                    <td>Text / General Voice</td>
                    <td>Yes (Human-based)</td>
                  </tr>
                  <tr>
                    <td>Sandbox Compiler</td>
                    <td className="highlight-column">Yes (Integrated)</td>
                    <td>Yes</td>
                    <td>No</td>
                    <td>Yes</td>
                  </tr>
                  <tr>
                    <td>Resume-Aware Queries</td>
                    <td className="highlight-column">Yes (Tailored)</td>
                    <td>No</td>
                    <td>No</td>
                    <td>Interviewer Dependent</td>
                  </tr>
                  <tr>
                    <td>Live Follow-Up Logic</td>
                    <td className="highlight-column">Yes</td>
                    <td>No</td>
                    <td>Basic</td>
                    <td>Yes</td>
                  </tr>
                  <tr>
                    <td>Instant Speech Analytics</td>
                    <td className="highlight-column">Yes</td>
                    <td>No</td>
                    <td>No</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>No Scheduling / Booking</td>
                    <td className="highlight-column">Yes</td>
                    <td>Yes</td>
                    <td>Yes</td>
                    <td>No (Requires Booking)</td>
                  </tr>
                  <tr>
                    <td>Cost per Session</td>
                    <td className="highlight-column">Always Free Tier / Low Pricing</td>
                    <td>Premium Tier</td>
                    <td>API / Monthly Fee</td>
                    <td>$150 – $250 / session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 6: Interview Types */}
          <section className="details-block">
            <div className="section-header text-center">
              <span className="eyebrow"><span className="eyebrow-dot" /> PATHWAYS</span>
              <h2 className="luxury-section-title">AVAILABLE INTERVIEW TRACKS</h2>
            </div>
            <div className="pathways-grid">
              <span className="pathway-tag">DSA & Algorithms</span>
              <span className="pathway-tag">System Design</span>
              <span className="pathway-tag">Machine Learning & AI</span>
              <span className="pathway-tag">Backend Scalability</span>
              <span className="pathway-tag">Frontend Architecture</span>
              <span className="pathway-tag">Full Stack Systems</span>
              <span className="pathway-tag">Behavioral & Leadership</span>
              <span className="pathway-tag">Product Engineering</span>
              <span className="pathway-tag">HR & General Placement</span>
            </div>
          </section>

          {/* Section 7: Trust Section */}
          <section className="details-block trust-section">
            <div className="trust-grid">
              <div className="trust-column">
                <h3>Our Privacy Pledge</h3>
                <p>Callback stores your uploaded resume and speech transcripts in encrypted vault storage. We never share your data or use it to train public, open-source models.</p>
              </div>
              <div className="trust-column">
                <h3>Adaptive Rigor</h3>
                <p>Our rubric engine is built on standard tech hiring practices used by engineering managers at Netflix, Google, Stripe, and leading startups.</p>
              </div>
            </div>
            
            <div className="final-cta">
              <h2>Ready to enter the Chamber?</h2>
              <button className="luxury-button-solid" onClick={() => navigate('/upload')}>
                Start Your Interview
              </button>
            </div>
          </section>
          
        </div>
      </div>
    </div>
  );
}
