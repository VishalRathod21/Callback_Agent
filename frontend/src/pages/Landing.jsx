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
    shortLabel: "01 Awakens", 
    eyebrow: "01 / SYSTEM AWAKENING", 
    title: "THE CORE INITS.", 
    desc: "Enter an infinite digital chamber. A silent, obsidian AI Core floats in the center, awaiting your credentials to materialize." 
  },
  { 
    id: 1, 
    shortLabel: "02 Resume", 
    eyebrow: "02 / CREDENTIAL SCANNER", 
    title: "RESUME INTAKE.", 
    desc: "Your experience page drifts into the field. Holographic lasers sweep, resolving skills and experience into glowing energy nodes." 
  },
  { 
    id: 2, 
    shortLabel: "03 Panel", 
    eyebrow: "03 / PANEL SYNTHESIS", 
    title: "BOARD ASSEMBLES.", 
    desc: "Floating nodes gather around the Core. Three specialized AI personas assemble from pure light, constructing your interview panel." 
  },
  { 
    id: 3, 
    shortLabel: "04 Voice", 
    eyebrow: "04 / VOCAL SENSORS", 
    title: "SOUND & SYNTAX.", 
    desc: "Adaptive microphones record your presentation. The Core deforms dynamically, checking speech rhythm and technical authority." 
  },
  { 
    id: 4, 
    shortLabel: "05 Coding", 
    eyebrow: "05 / COMPILER SANDBOX", 
    title: "SYNTAX RUNTIME.", 
    desc: "Step inside a floating coding workspace. Sandbox compilers evaluate logic, complexity, and algorithmic performance." 
  },
  { 
    id: 5, 
    shortLabel: "06 Analysis", 
    eyebrow: "06 / DATA DIAGNOSTICS", 
    title: "PRECISE REPORT.", 
    desc: "Structured logs gather into an interactive metrics dashboard. Verify your score in communication, architecture, and complexity." 
  },
  { 
    id: 6, 
    shortLabel: "07 Evolved", 
    eyebrow: "07 / RESUME UPGRADE", 
    title: "PROFILE REWRITTEN.", 
    desc: "Metrics collapse back to morph your original document. ATS keywords optimize and description bullet points rewrite dynamically." 
  },
  { 
    id: 7, 
    shortLabel: "08 Success", 
    eyebrow: "08 / CALLBACK READY", 
    title: "ASCEND THE CHAMBER.", 
    desc: "Invitations materialize. You are ready to face the real interview board with confidence. Enter the chamber now." 
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
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      const currentScroll = window.scrollY;
      const progress = totalScroll > 0 ? currentScroll / totalScroll : 0;
      
      setScrollProgress(progress);
      
      // Map progress (0.0 to 1.0) into chapter index (0 to 7)
      const chapterIndex = Math.min(7, Math.floor(progress * 8));
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
    <div className="landing-root" style={{ height: '800vh' }}>
      <div className="noise-overlay" />
      
      {/* Cinematic fixed overlay containing all UI, narrative overlay text, and dots */}
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
                const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
                const targetScroll = (idx / 7) * totalHeight;
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
  );
}
