import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';
import Orb from '../components/ui/Orb';
import './InterviewRoom.css';

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
    setDisplayed('');
    indexRef.current = 0;
    
    const type = () => {
      if (indexRef.current < text.length) {
        indexRef.current++;
        setDisplayed(text.slice(0, indexRef.current));
        const ch = text[indexRef.current - 1];
        const delay = ['.','?','!',','].includes(ch) ? 160 : 20 + Math.random() * 15;
        timerRef.current = setTimeout(type, delay);
      }
    };
    timerRef.current = setTimeout(type, 150);
    return () => clearTimeout(timerRef.current);
  }, [text, isActive]);

  const isDone = displayed.length >= (text?.length || 0);
  return { displayed, isDone };
}

// ── SVG ICONS ──
const MicIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

const MicOffIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 10v-1m14 0v1a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

const UserIcon = ({ size = 26, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="4"/>
    <path d="M4 21v-1a8 8 0 0 1 16 0v1"/>
  </svg>
);

const SendIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22,2 15,22 11,13 2,9"/>
  </svg>
);

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
  
  // Real-time telemetry simulations
  const [telemetryState, setTelemetryState] = useState({
    confidence: 92,
    pacing: 130,
    clarity: 98,
    latency: 12
  });

  // Thinking messages index
  const [thinkingIndex, setThinkingIndex] = useState(0);

  // Fluctuating telemetry
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetryState(prev => ({
        confidence: Math.round(88 + Math.random() * 8),
        pacing: Math.round(124 + Math.random() * 12),
        clarity: Math.round(95 + Math.random() * 4),
        latency: Math.round(9 + Math.random() * 6)
      }));
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  // Cycle thinking status
  useEffect(() => {
    if (turnState !== 'processing') return;
    const interval = setInterval(() => {
      setThinkingIndex(prev => (prev + 1) % THINKING_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [turnState]);

  // Fetch session parameters if lost on refresh
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
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const transcriptRef = useRef(null);
  const roundStartedRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const barRefsArr = useRef([]);
  const rafRef = useRef(null);

  // Typewriter
  const { displayed: typedQuestion, isDone: typingDone } = useTypewriter(
    typingQuestion,
    turnState === 'ai_speaking'
  );

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

  // Camera stream
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

  // WebSocket hook
  const {
    isConnected, status, isRecording, hasPermission, isSpeaking, voiceEnabled,
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

  // Auto scroll transcript
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
  useEffect(() => {
    return () => {
      if (destroyAll) destroyAll();
    };
  }, [destroyAll]);

  // Foot Waveform
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
          h = 4 + wave * wave2 * 38 * v * (0.5 + Math.random() * 0.5);
          bg = '#ffffff';
        } else if (turnState === 'ai_speaking') {
          h = 6 + (wave * 0.5 + 0.5) * 28;
          bg = 'rgba(255,255,255,0.7)';
        } else if (turnState === 'processing') {
          h = 3;
          bg = 'rgba(255,255,255,0.15)';
        } else {
          h = 3 + Math.sin(i * 0.4 + frame / 40) * 1.5;
          bg = 'rgba(255,255,255,0.06)';
        }
        b.style.height = Math.max(3, Math.min(36, h)) + 'px';
        b.style.backgroundColor = bg;
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

  const handleTextSend = () => {
    if (!textInput.trim()) return;
    addTranscript('candidate', textInput);
    sendText(textInput);
    setTextInput('');
  };

  // State mapping
  const stateConfig = {
    ai_speaking: { label: 'AI SPEAKING', color: '#ffffff', pulse: true },
    listening:   {
      label: voiceEnabled === false ? 'YOUR TURN' : (muted ? 'MUTED' : 'LISTENING'),
      color: voiceEnabled === false ? '#ffffff' : (muted ? '#ffffff' : '#ffffff'),
      pulse: voiceEnabled === false ? false : !muted
    },
    processing:  { label: THINKING_MESSAGES[thinkingIndex].toUpperCase(), color: '#888888', pulse: false },
    idle:        { label: 'ESTABLISHING SECURE CONNECTION', color: '#555555', pulse: false },
  };
  const cfg = stateConfig[turnState] || stateConfig.idle;

  const BARS = 32;
  barRefsArr.current = barRefsArr.current.slice(0, BARS);

  // Dynamic Completed Question Nodes
  const totalQuestions = 5;
  const currentIdx = Math.min(totalQuestions - 1, Math.floor(transcript.length / 2));

  return (
    <div className="interview-room-root">
      <div className="noise-overlay" />
      
      {/* Background Museum Depth Layers */}
      <div className="museum-background">
        <div className="aurora-glow" />
        <div className="light-cloud-1" />
        <div className="volumetric-light-ray" />
        <div className="volumetric-light-ray-2" />
      </div>

      {/* Global telemetry Frame HUD */}
      <div className="hud-corner top-left" />
      <div className="hud-corner top-right" />
      <div className="hud-corner bottom-left" />
      <div className="hud-corner bottom-right" />

      {/* ── TOP HUD (GLASS HEADER) ── */}
      <div style={{
        height: '64px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        flexShrink: 0,
        zIndex: 10,
        background: 'rgba(5, 5, 5, 0.4)',
        backdropFilter: 'blur(30px)'
      }}>
        {/* Left: Recording status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              animation: 'node-pulse-glow 1.5s infinite alternate'
            }} />
            <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#888888', fontWeight: 700, letterSpacing: '0.08em' }}>SYS_REC: ACTIVE</span>
          </div>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: '11px', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(elapsedSec)}
          </span>
        </div>

        {/* Center: Interactive Stage progress timeline */}
        <div className="timeline-container">
          {Array.from({ length: totalQuestions }).map((_, idx) => (
            <React.Fragment key={idx}>
              <div className={`timeline-node ${idx < currentIdx ? 'completed' : idx === currentIdx ? 'active' : ''}`} />
              {idx < totalQuestions - 1 && (
                <div className={`timeline-line ${idx < currentIdx ? 'active' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Right: Round Details & Exit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: '10px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {currentRound === 'technical' ? 'TECHNICAL_CHAMBER' : 'HR_CHAMBER'}
          </span>
          <button
            onClick={endRound}
            className="luxury-button-glass"
            style={{ padding: '6px 16px', fontSize: '9.5px', height: '30px', fontFamily: 'var(--font-code)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            End Session
          </button>
        </div>
      </div>

      {/* ── WORKSPACE GRID ── */}
      <div className="interview-workspace">
        
        {/* ── LEFT PANEL: Camera & Live Transcript ── */}
        <div className="sidebar-glass">
          {/* Camera Frame */}
          <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
            <div className="camera-preview-box">
              {!cameraError ? (
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <UserIcon size={22} color="#555555" />
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#555555', letterSpacing: '0.04em' }}>CAMERA_SCAN_BLOCKED</span>
                </div>
              )}
              
              <div className="camera-preview-overlay-badge">
                <span style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: isRecording && isSpeaking && !muted ? '#ffffff' : '#444444'
                }} />
                <span>{muted ? 'MUTED' : isRecording ? (isSpeaking ? 'SPEAKING' : 'SCANNING') : 'STANDBY'}</span>
              </div>
            </div>
          </div>

          {/* Transcript Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '10px 20px', fontFamily: 'var(--font-code)', fontSize: '9px', color: '#555555', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.03)', flexShrink: 0, fontWeight: 700 }}>
              TRANSCRIPTION_FLOW
            </div>
            
            <div ref={transcriptRef} className="live-transcript-flow">
              <AnimatePresence initial={false}>
                {transcript.map((entry, idx) => {
                  const isActiveMsg = idx === transcript.length - 1;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className={`transcript-message ${isActiveMsg ? 'active' : ''}`}
                    >
                      <div className={`transcript-meta ${entry.speaker === 'interviewer' ? 'ai' : 'user'}`}>
                        <span>{entry.speaker === 'interviewer' ? 'AI_CHAMBER' : 'YOU'}</span>
                        <span>// {entry.time}</span>
                      </div>
                      <div className="transcript-content">{entry.text}</div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {turnState === 'processing' && (
                <div className="transcript-message active">
                  <div className="transcript-meta ai">
                    <span>AI_CHAMBER</span>
                    <span className="hologram-cursor" style={{ height: '7px', width: '2px', verticalAlign: 'middle' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
                    <div style={{ height: '5px', width: '90%', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.04)' }} />
                    <div style={{ height: '5px', width: '70%', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.03)' }} />
                  </div>
                </div>
              )}

              {transcript.length === 0 && turnState !== 'processing' && (
                <div style={{ padding: '40px 0', fontFamily: 'var(--font-code)', fontSize: '10px', color: '#444444', textAlign: 'center' }}>
                  AWAITING INITIAL TRANSCRIPT TELEMETRY...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER MAIN STAGE: Core and Hologram Question ── */}
        <div className="center-room-stage" style={{ position: 'relative' }}>
          
          {/* Orbital visual backdrop */}
          <div className="circular-waveform-ring" />

          {/* Core Orb canvas */}
          <div style={{ width: '260px', height: '260px', position: 'relative', zIndex: 3 }}>
            <Orb turnState={turnState} volume={volume} />
          </div>

          {/* Hologram project question */}
          <div className="hologram-question-box">
            {turnState === 'processing' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#888888', fontFamily: 'var(--font-code)' }}>
                  {THINKING_MESSAGES[thinkingIndex].toUpperCase()}
                </span>
                <span className="hologram-cursor" />
              </div>
            ) : typedQuestion ? (
              <div className="hologram-headline">
                {typedQuestion}
                {!typingDone && <span className="hologram-cursor" />}
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: '#555555', fontFamily: 'var(--font-code)' }}>
                {isConnected ? 'INITIALIZING STAGE DATA...' : 'ESTABLISHING SECURE SCANNING CHANNELS...'}
              </span>
            )}
          </div>

          {/* ── LIVE PERFORMANCE HUD ── */}
          <div className="intelligence-hud">
            <div className={`intelligence-item ${turnState === 'listening' ? 'active' : ''}`}>
              <span>CONFIDENCE</span>
              <span className="intelligence-value">{telemetryState.confidence}%</span>
            </div>
            
            <div className={`intelligence-item ${turnState === 'listening' ? 'active' : ''}`}>
              <span>PACING</span>
              <span className="intelligence-value">{telemetryState.pacing} WPM</span>
            </div>

            <div className="intelligence-item">
              <span>LATENCY</span>
              <span className="intelligence-value">{telemetryState.latency}MS</span>
            </div>

            <div className="intelligence-item">
              <span>EYE_CONTACT</span>
              <div className="circular-eye-tracker" />
            </div>

            <div className="intelligence-item">
              <span>VOICE_CLARITY</span>
              <span className="intelligence-value">{telemetryState.clarity}%</span>
            </div>
          </div>

          {/* ── FOOT CONTROLS DOCK ── */}
          <div style={{ position: 'absolute', bottom: '36px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '100%', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
            
            {/* Visual waveform audio bars */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '36px', width: '100%', justifyContent: 'center' }}>
              {Array.from({ length: BARS }).map((_, i) => (
                <div key={i}
                     ref={el => { barRefsArr.current[i] = el; }}
                     style={{ width: '2px', borderRadius: '4px', height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', transition: 'background-color 200ms ease' }} />
              ))}
            </div>

            <div className="foot-controls-dock" style={{ width: '100%' }}>
              {/* Mic toggle */}
              <button
                onClick={handleMicToggle}
                disabled={voiceEnabled === false}
                className={`foot-mic-button ${isRecording && !muted ? 'active' : ''}`}
                title={muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {voiceEnabled === false || muted ? (
                  <MicOffIcon size={16} color="currentColor" />
                ) : (
                  <MicIcon size={16} color="currentColor" />
                )}
              </button>

              {/* Text Input */}
              <input
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) handleTextSend(); }}
                placeholder={turnState === 'ai_speaking' ? "Awaiting vocal cadence..." : "Type response to the chamber..."}
                disabled={turnState === 'ai_speaking' || turnState === 'processing'}
                className="foot-input"
              />

              {/* Send Button */}
              <button
                onClick={handleTextSend}
                disabled={!textInput.trim() || turnState === 'ai_speaking'}
                className="foot-send-button"
              >
                <SendIcon size={12} /> Send
              </button>
            </div>

            {/* Subhud details */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '8px', fontFamily: 'var(--font-code)', color: '#444444' }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: isConnected ? '#ffffff' : '#333333' }} />
              <span>SYS_GATEWAY: {status.toUpperCase()}</span>
              <span>//</span>
              <span>SESSION_ID: {sessionId?.slice(0, 10).toUpperCase()}</span>
              {hasPermission === false && (
                <span style={{ color: '#D32F2F' }}>// MIC_ACCESS_DENIED</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
