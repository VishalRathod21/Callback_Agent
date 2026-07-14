import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';

// ── TYPEWRITER HOOK ──
function useTypewriter(text, isActive) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isActive || !text) {
      setDisplayed(text || '');
      indexRef.current = text?.length || 0;
      return;
    }
    // Reset and start typing
    setDisplayed('');
    indexRef.current = 0;
    const type = () => {
      if (indexRef.current < text.length) {
        indexRef.current++;
        setDisplayed(text.slice(0, indexRef.current));
        const ch = text[indexRef.current - 1];
        const delay = ['.','?','!',','].includes(ch) ? 180 : 25 + Math.random() * 15;
        timerRef.current = setTimeout(type, delay);
      }
    };
    timerRef.current = setTimeout(type, 200);
    return () => clearTimeout(timerRef.current);
  }, [text, isActive]);

  const isDone = displayed.length >= (text?.length || 0);
  return { displayed, isDone };
}

// ── SVG ICONS ──
const MicIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

const MicOffIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 10v-1m14 0v1a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

const AIIcon = ({ size = 28, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z"/>
    <circle cx="9" cy="9" r="1" fill={color}/>
    <circle cx="15" cy="9" r="1" fill={color}/>
    <path d="M9 14s1 1 3 1 3-1 3-1"/>
  </svg>
);

const UserIcon = ({ size = 28, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="4"/>
    <path d="M4 21v-1a8 8 0 0 1 16 0v1"/>
  </svg>
);

const SendIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22,2 15,22 11,13 2,9"/>
  </svg>
);

// Thinking messages list
const THINKING_MESSAGES = [
  "Analyzing your answer",
  "Structuring follow-up",
  "Preparing next question",
  "Formulating perspective"
];

export default function InterviewRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const stateData = location.state || {};
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // State
  const [currentRound, setCurrentRound] = useState(stateData.currentRound || 'technical');
  const [targetRole, setTargetRole] = useState(stateData.targetRole || 'Software Engineer');
  const [resumeContext, setResumeContext] = useState(stateData.resumeContext || '');
  const [candidateId, setCandidateId] = useState(stateData.candidateId);
  const [transcript, setTranscript] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [turnState, setTurnState] = useState('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [typingQuestion, setTypingQuestion] = useState('');
  
  // Thinking status loop
  const [thinkingIndex, setThinkingIndex] = useState(0);

  // Cycle thinking message
  useEffect(() => {
    if (turnState !== 'processing') return;
    const interval = setInterval(() => {
      setThinkingIndex(prev => (prev + 1) % THINKING_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [turnState]);

  // Fetch session parameters on reload if location.state is lost
  useEffect(() => {
    if (!candidateId) {
      axios.get(`/interviews/${sessionId}`)
        .then((res) => {
          const data = res.data;
          if (data.candidate_id) setCandidateId(data.candidate_id);
          if (data.current_round) setCurrentRound(data.current_round);
          if (data.target_role) setTargetRole(data.target_role);
          if (data.resume_text) setResumeContext(data.resume_text);
        })
        .catch((err) => console.error('[InterviewRoom] Failed to fetch session:', err));
    }
  }, [sessionId, candidateId]);

  // Refs
  const videoRef        = useRef(null);
  const cameraStreamRef = useRef(null);
  const transcriptRef   = useRef(null);
  const roundStartedRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const barRefsArr      = useRef([]);
  const rafRef          = useRef(null);

  // Typewriter — active when AI is speaking
  const { displayed: typedQuestion, isDone: typingDone } = useTypewriter(
    typingQuestion,
    turnState === 'ai_speaking'
  );

  // When new question arrives, trigger typewriter
  useEffect(() => {
    if (currentQuestion) setTypingQuestion(currentQuestion);
  }, [currentQuestion]);

  // Timer
  useEffect(() => {
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatTime = s => {
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  };

  // Camera stream setup
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false,
    })
    .then(stream => {
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
    })
    .catch(() => setCameraError(true));
    return () => cameraStreamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // WebSocket + audio hook
  const {
    isConnected, status, isRecording, hasPermission, isSpeaking,
    startRound, sendText, endRound, startRecording, stopRecording, destroyAll,
  } = useWebSocket({
    sessionId,
    enabled: isAuthenticated && !authLoading,
    onAITranscript: ({ text }) => {
      setCurrentQuestion(text);
      addTranscript('interviewer', text);
    },
    onCandidateTranscript: ({ text }) => addTranscript('candidate', text),
    onStateChange: (state) => setTurnState(state),
    onRoundComplete: (data) => {
      stopRecording();
      const nextR = data.next_round;
      if (nextR && nextR !== 'complete') {
        setCurrentRound(nextR);
        setTranscript([]);
        setCurrentQuestion('');
        setTypingQuestion('');
        setTurnState('idle');
        roundStartedRef.current = false;
      } else {
        navigate(`/report/${candidateId}`, { state: { roundData: data } });
      }
    },
    onError: (msg) => console.error('[Interview]', msg),
    volume: v => setVolume(v),
    muted,
  });

  const addTranscript = (speaker, text) => {
    setTranscript(prev => [...prev, { speaker, text, time: formatTime(elapsedSec) }]);
  };

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript.length]);

  // Auto-start round when connected
  useEffect(() => {
    if (isConnected && !roundStartedRef.current) {
      if (!location.state && !candidateId) return;
      roundStartedRef.current = true;
      startRound(currentRound, targetRole, resumeContext);
    }
  }, [isConnected, startRound, currentRound, targetRole, resumeContext, candidateId, location.state]);

  // Cleanup on unmount
  useEffect(() => () => destroyAll?.(), []);

  // Waveform animation
  useEffect(() => {
    const bars = barRefsArr.current;
    let frame = 0;
    const animate = () => {
      frame++;
      bars.forEach((b, i) => {
        if (!b) return;
        let h, bg;
        const wave = Math.sin((i / bars.length) * Math.PI * 2 + frame / 15);
        const wave2 = Math.sin((i / bars.length) * Math.PI + frame / 20);
        if (turnState === 'listening' && isRecording && !muted) {
          const v = volume + 0.05;
          h = 4 + wave * wave2 * 44 * v * (0.5 + Math.random() * 0.5);
          bg = 'var(--success)'; // Green
        } else if (turnState === 'ai_speaking') {
          h = 6 + (wave * 0.5 + 0.5) * 32;
          bg = 'var(--spotlight)'; // Blue
        } else if (turnState === 'processing') {
          h = 4; // Flat / still during thinking state
          bg = 'rgba(255, 255, 255, 0.04)';
        } else {
          h = 4 + Math.sin(i * 0.4 + frame / 40) * 2;
          bg = 'rgba(255, 255, 255, 0.06)';
        }
        b.style.height = Math.max(4, Math.min(48, h)) + 'px';
        b.style.background = bg;
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [turnState, isRecording, muted, volume]);

  const handleMicToggle = async () => {
    if (!audioUnlockedRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        await ctx.resume();
        await ctx.close();
        audioUnlockedRef.current = true;
      } catch(e) {}
    }
    setMuted(m => !m);
    if (muted && turnState === 'listening') startRecording();
  };

  // State configurations (including Thinking status label states)
  const stateConfig = {
    ai_speaking: { label: 'AI SPEAKING', color: 'var(--spotlight)', pulse: true },
    listening:   { label: muted ? 'MUTED' : 'LISTENING', color: muted ? 'var(--spotlight)' : 'var(--success)', pulse: !muted },
    processing:  { label: THINKING_MESSAGES[thinkingIndex].toUpperCase(), color: 'var(--spotlight)', pulse: false },
    idle:        { label: 'CONNECTING', color: 'var(--text-muted)', pulse: false },
  };
  const cfg = stateConfig[turnState] || stateConfig.idle;

  const BARS = 48;
  barRefsArr.current = barRefsArr.current.slice(0, BARS);

  return (
    <div className="landing-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="noise-overlay" />
      
      {/* ── DRIVER AURORA BACKGROUNDS (Dimmed subtly in thinking state) ── */}
      <div className="aurora-container" style={{ transition: 'opacity 500ms ease' }}>
        <div className="aurora-blob aurora-1" style={{ opacity: turnState === 'processing' ? 0.04 : 0.08 }} />
        <div className="aurora-blob aurora-2" style={{ opacity: turnState === 'processing' ? 0.04 : 0.08 }} />
      </div>

      {/* ── TOP BAR (STICKY GLASS) ── */}
      <div className="glass-panel" style={{
        height: '56px',
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
        zIndex: 10,
        background: 'var(--card-bg)',
        backdropFilter: 'blur(30px) saturate(180%)'
      }}>
        {/* Left: REC Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ position: 'relative', width: '8px', height: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)', animation: 'breathing-pulse 1.8s ease-in-out infinite' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--danger)', fontWeight: 700, letterSpacing: '0.06em' }}>REC</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(elapsedSec)}
          </span>
        </div>

        {/* Center: turn state badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '99px', background: `${cfg.color}08`, border: `1px solid ${cfg.color}25` }}>
          {cfg.pulse && (
            <motion.div
              style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.color }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            />
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: cfg.color, letterSpacing: '0.04em' }}>
            {cfg.label}
          </span>
        </div>

        {/* Right: Round Info + End Interview */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {currentRound === 'technical' ? 'Technical Round' : 'HR Round'}
          </span>
          <button
            onClick={endRound}
            style={{
              height: '30px',
              padding: '0 14px',
              background: 'rgba(226, 72, 61, 0.08)',
              border: '1px solid rgba(226, 72, 61, 0.2)',
              borderRadius: '6px',
              color: 'var(--danger)',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'all 200ms ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(226, 72, 61, 0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(226, 72, 61, 0.08)'; }}
          >
            End Interview
          </button>
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        
        {/* ── LEFT SIDEBAR: Camera & Live Transcript ── */}
        <div className="glass-panel" style={{
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderLeft: 'none',
          borderRight: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--card-bg)',
          backdropFilter: 'blur(30px) saturate(180%)'
        }}>
          {/* Camera Frame */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
            <div style={{
              background: '#000',
              borderRadius: '12px',
              overflow: 'hidden',
              aspectRatio: '4/3',
              border: '1px solid var(--border)',
              position: 'relative',
              boxShadow: 'var(--shadow-md)'
            }}>
              {!cameraError ? (
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-inset)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserIcon size={24} color="var(--text-muted)" />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>CAMERA BLOCKED</span>
                </div>
              )}
              {/* Mic state badge overlay */}
              <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(10,10,11,0.85)', backdropFilter: 'blur(4px)', borderRadius: '4px', border: '1px solid var(--border)', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isRecording && isSpeaking && !muted ? 'var(--success)' : 'var(--text-muted)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {muted ? 'MUTED' : isRecording ? (isSpeaking ? 'SPEAKING' : 'LISTENING') : 'OFF'}
                </span>
              </div>
            </div>
          </div>

          {/* Transcript Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
              Live Transcript
            </div>
            <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <AnimatePresence initial={false}>
                {transcript.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: entry.speaker === 'interviewer' ? 'var(--accent)' : 'var(--success)' }}>
                        {entry.speaker === 'interviewer' ? 'AI' : 'YOU'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>{entry.time}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{entry.text}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {turnState === 'processing' && (
                <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)' }}>AI</span>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', animation: 'breathing-pulse 1.2s infinite' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ height: '8px', width: '90%', borderRadius: '4px', background: 'linear-gradient(90deg, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.03) 75%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.5s infinite linear' }} />
                    <div style={{ height: '8px', width: '70%', borderRadius: '4px', background: 'linear-gradient(90deg, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.03) 75%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.5s infinite linear 300ms' }} />
                  </div>
                </div>
              )}

              {transcript.length === 0 && turnState !== 'processing' && (
                <div style={{ padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Transcript will stream here...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT MAIN PANEL: AI Speaker and Waveform ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* AI Center Speaking Orb & Question */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px' }}>
            
            {/* Speaking Orb Container */}
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              
              {/* Outer glow aura rings for speaking and listening */}
              <AnimatePresence>
                {turnState === 'ai_speaking' && (
                  <>
                    <motion.div
                      style={{ position: 'absolute', inset: -20, borderRadius: '50%', background: 'radial-gradient(circle, rgba(110, 168, 254, 0.08) 0%, transparent 70%)', zIndex: -1 }}
                      animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      style={{ position: 'absolute', inset: -40, borderRadius: '50%', background: 'radial-gradient(circle, rgba(110, 168, 254, 0.04) 0%, transparent 70%)', zIndex: -1 }}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.5, 0.2] }}
                      transition={{ duration: 3.2, delay: 0.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </>
                )}
                {turnState === 'listening' && !muted && (
                  <motion.div
                    style={{ position: 'absolute', inset: -24, borderRadius: '50%', background: 'radial-gradient(circle, rgba(62, 207, 142, 0.08) 0%, transparent 70%)', zIndex: -1 }}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </AnimatePresence>

              {/* Rotating conic-gradient border for Thinking (processing) state */}
              {turnState === 'processing' && (
                <motion.div
                  style={{
                    position: 'absolute',
                    inset: -3,
                    borderRadius: '50%',
                    background: 'conic-gradient(from 0deg, var(--spotlight) 0%, transparent 60%, var(--spotlight) 100%)',
                    zIndex: 0
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                />
              )}

              {/* Core Avatar Sphere */}
              <motion.div
                style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(21, 24, 29, 0.75)',
                  border: turnState === 'processing' ? '2px solid transparent' : `2px solid ${
                    turnState === 'ai_speaking' ? 'var(--spotlight)'
                    : turnState === 'listening' ? 'var(--success)'
                    : 'rgba(255,255,255,0.06)'
                  }`,
                  boxShadow: turnState === 'ai_speaking'
                    ? '0 0 30px rgba(110, 168, 254, 0.2)'
                    : turnState === 'listening'
                    ? '0 0 30px rgba(62, 207, 142, 0.2)'
                    : '0 8px 32px rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(20px)',
                  transition: 'border-color 300ms ease, box-shadow 300ms ease',
                  position: 'relative',
                  zIndex: 1
                }}
                animate={turnState === 'ai_speaking' ? { scale: [1, 1.03, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <AIIcon size={36} color={
                  turnState === 'ai_speaking' ? 'var(--spotlight)'
                  : turnState === 'listening' ? 'var(--success)' : 'var(--text-muted)'
                } />
              </motion.div>

              {/* Float state tag */}
              <div style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: turnState === 'ai_speaking' ? 'var(--spotlight)'
                            : turnState === 'listening' ? 'var(--success)' : 'var(--border-strong)',
                borderRadius: '99px',
                padding: '2px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: '8px',
                color: turnState === 'ai_speaking' ? '#0A0A0B' : '#ffffff',
                fontWeight: 700,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                transition: 'all 300ms ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 2
              }}>
                {turnState === 'ai_speaking' ? 'SPEAKING'
                 : turnState === 'listening' ? 'LISTENING'
                 : turnState === 'processing' ? 'PROCESSING'
                 : 'STANDBY'}
              </div>
            </div>

            {/* Display Question text */}
            <div style={{ maxWidth: '640px', textAlign: 'center', minHeight: '120px', marginTop: '16px' }}>
              {turnState === 'processing' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {THINKING_MESSAGES[thinkingIndex]}...
                  </span>
                  <div style={{ width: '48px', height: '3px', background: 'var(--border-strong)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', background: 'var(--spotlight)', borderRadius: '99px', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1s infinite linear' }} />
                  </div>
                </div>
              ) : typedQuestion ? (
                <span style={{ fontSize: '18px', fontWeight: 500, lineHeight: 1.7, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
                  {typedQuestion}
                  {!typingDone && <span className="cursor-blink" style={{ display: 'inline-block', width: '2px', height: '16px', background: 'var(--text-primary)', marginLeft: '2px', verticalAlign: 'text-bottom', animation: 'cursor-blink 0.9s ease infinite' }} />}
                </span>
              ) : (
                <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {isConnected ? 'Preparing stage rounds...' : 'Establishing secure handshake...'}
                </span>
              )}
            </div>
          </div>

          {/* ── WAVEFORM INTEGRATION ── */}
          <div style={{ padding: '0 40px', background: 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyComposite: 'center', gap: '3px', height: '48px', justifyContent: 'center' }}>
              {Array.from({ length: BARS }).map((_, i) => (
                <div key={i}
                     ref={el => { barRefsArr.current[i] = el; }}
                     style={{ width: '3px', borderRadius: '99px', height: '4px', background: 'var(--border-strong)', transition: 'background 200ms ease' }} />
              ))}
            </div>
          </div>

          {/* ── CONTROLS BAR (GLASS FOOTER) ── */}
          <div style={{
            padding: '16px 32px 24px',
            background: 'var(--card-bg)',
            borderTop: '1px solid var(--border)',
            backdropFilter: 'blur(30px) saturate(180%)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '700px', margin: '0 auto' }}>
              {/* Mic mute button */}
              <button
                onClick={handleMicToggle}
                title={muted ? 'Unmute microphone' : 'Mute microphone'}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 200ms ease',
                  background: muted ? 'rgba(110, 168, 254, 0.08)' : isRecording ? 'rgba(62, 207, 142, 0.08)' : 'var(--bg-inset)',
                  outline: muted ? '2px solid var(--spotlight)' : isRecording ? '2px solid var(--success)' : '2px solid var(--border-strong)',
                }}
              >
                {muted
                  ? <MicOffIcon size={18} color="var(--spotlight)" />
                  : <MicIcon size={18} color={isRecording ? 'var(--success)' : 'var(--text-muted)'} />}
              </button>

              {/* Text input */}
              <input
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) handleTextSend(); }}
                placeholder={turnState === 'ai_speaking' ? "Wait for AI to finish speaking..." : "Type response and press Enter..."}
                disabled={turnState === 'ai_speaking' || turnState === 'processing'}
                className="glass-input"
                style={{
                  flex: 1,
                  height: '48px',
                  fontSize: '13px',
                  opacity: (turnState === 'ai_speaking' || turnState === 'processing') ? 0.45 : 1,
                  transition: 'all 200ms ease'
                }}
              />

              {/* Send button */}
              <button
                onClick={handleTextSend}
                disabled={!textInput.trim() || turnState === 'ai_speaking'}
                style={{
                  height: '48px',
                  padding: '0 20px',
                  background: 'var(--spotlight)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: '#0A0A0B',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: (!textInput.trim() || turnState === 'ai_speaking') ? 0.4 : 1,
                  transition: 'all 150ms ease'
                }}
              >
                <SendIcon size={14} /> Send
              </button>
            </div>

            {/* Connection status line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '700px', margin: '8px auto 0', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--text-muted)' }} />
              <span>{status.toUpperCase()}</span>
              {hasPermission === false && (
                <span style={{ color: 'var(--danger)', marginLeft: '8px' }}>— MIC ACCESS BLOCKED: Allow mic permissions</span>
              )}
              <span style={{ marginLeft: 'auto' }}>SESSION: {sessionId?.slice(0, 8)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function handleTextSend() {
    if (!textInput.trim()) return;
    addTranscript('candidate', textInput);
    sendText(textInput);
    setTextInput('');
  }
}
