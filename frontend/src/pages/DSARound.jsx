import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from '../api/client';
import { useInterviewStore } from '../store/interviewStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import './DSARound.css';

// ── SVG ICONS ──
const MicIcon = ({ color = 'currentColor' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const MicOffIcon = ({ color = 'currentColor' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 10v-1m14 0v1a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

const SparklesIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.34 6.34l2.83 2.83M14.83 14.83l2.83 2.83M6.34 17.66l2.83-2.83M14.83 9.17l2.83-2.83"/>
  </svg>
);

const TerminalIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="4 17 10 11 4 5"/>
    <line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
);

export default function DSARound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Zustand Store
  const candidate = useInterviewStore((state) => state.candidate);
  const session = useInterviewStore((state) => state.session);
  const transcript = useInterviewStore((state) => state.transcript);
  const setCandidate = useInterviewStore((state) => state.setCandidate);
  const setSession = useInterviewStore((state) => state.setSession);
  const addTranscript = useInterviewStore((state) => state.addTranscript);
  const setRecording = useInterviewStore((state) => state.setRecording);
  const setConnected = useInterviewStore((state) => state.setConnected);

  // Layout States
  const [activeSidebarTab, setActiveSidebarTab] = useState('briefing'); // 'briefing' | 'complexity'
  const [problemIndex, setProblemIndex] = useState(0);
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [hint, setHint] = useState(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [showEvalPanel, setShowEvalPanel] = useState(false);
  const [volume, setVolume] = useState(0);

  // Compiler animation simulation
  const [compilerStep, setCompilerStep] = useState(0);

  const hintTimeoutRef = useRef(null);
  const startTranscriptIndexRef = useRef(0);
  const audioUnlockedRef = useRef(false);
  const barRefsArr = useRef([]);
  const rafRef = useRef(null);

  // Restore interview workspace context on mount / refresh
  useEffect(() => {
    if (!session || !candidate) {
      axios.get(`/interviews/${sessionId}`)
        .then((res) => {
          const data = res.data;
          setSession({
            id: data.session_id,
            currentRound: data.current_round,
            roundScores: data.round_scores,
            status: data.status
          });
          if (data.candidate_id) {
            setCandidate({
              id: data.candidate_id,
              name: data.candidate_name,
              role: data.target_role,
              status: data.status
            });
          }
        })
        .catch((err) => setError(err.message || 'Failed to resolve interview workspace context.'));
    }
  }, [sessionId, session, candidate, setSession, setCandidate]);

  // Fetch DSA Problem
  useEffect(() => {
    const fetchProblem = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await axios.get(`/interviews/${sessionId}/dsa/problem`);
        setProblem(res.data);
        if (res.data?.starter_code) {
          setCode(res.data.starter_code[language] || '');
        }
        startTranscriptIndexRef.current = transcript.length;
      } catch (err) {
        setError(err.message || 'Error loading the assessment problem. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchProblem();
  }, [sessionId]);

  // Session elapsed timer
  useEffect(() => {
    const t = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // WebSocket
  const {
    isConnected, status: connectionStatus, isRecording, hasPermission, voiceEnabled,
    startRecording, stopRecording, unlockAudio: unlockAudioContext, turnState
  } = useWebSocket({
    sessionId,
    enabled: isAuthenticated && !authLoading,
    onCandidateTranscript: (msg) => addTranscript({ speaker: 'candidate', text: msg.text }),
    onAITranscript: (msg) => addTranscript({ speaker: 'interviewer', text: msg.text }),
    volume: v => setVolume(v),
  });

  const [wsTimedOut, setWsTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWsTimedOut(true), 8000);
    if (isConnected) clearTimeout(t);
    return () => clearTimeout(t);
  }, [isConnected]);

  const showUI = isConnected || wsTimedOut || !loading;

  useEffect(() => { setRecording(isRecording); }, [isRecording, setRecording]);
  useEffect(() => { setConnected(isConnected); }, [isConnected, setConnected]);
  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    if (problem?.starter_code) {
      setCode(problem.starter_code[lang] || '');
    }
  };

  const getVerbalExplanation = () => transcript
    .filter((t, idx) => idx >= startTranscriptIndexRef.current && t.speaker === 'candidate')
    .map(t => t.text).join(' ');

  const handleToggleMic = async () => {
    if (!audioUnlockedRef.current) {
      try {
        await unlockAudioContext();
        audioUnlockedRef.current = true;
      } catch {}
    }
    isRecording ? stopRecording() : startRecording();
  };

  const handleGetHint = async () => {
    if (!problem || isHintLoading) return;
    try {
      setIsHintLoading(true);
      const response = await axios.post(`/interviews/${sessionId}/dsa/hint`, { current_code: code, language });
      setHint(response.data.hint);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => setHint(null), 15000);
    } catch {} finally {
      setIsHintLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!problem || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setError('');
      stopRecording();
      setCompilerStep(1);

      // Trigger beautiful compiler node stages
      const compilerInterval = setInterval(() => {
        setCompilerStep(prev => {
          if (prev >= 4) {
            clearInterval(compilerInterval);
            return 4;
          }
          return prev + 1;
        });
      }, 700);

      const response = await axios.post(`/interviews/${sessionId}/dsa/submit`, {
        code,
        language,
        verbal_explanation: getVerbalExplanation() || null,
        problem_index: problemIndex,
      });
      
      const data = response.data;
      
      // Delay response reveal slightly to let the gorgeous execution pipeline complete
      setTimeout(() => {
        setEvaluation(data.evaluation);
        setShowEvalPanel(true);
        setCompilerStep(0);
        
        // Auto-advance to next round or next challenge
        setTimeout(() => {
          setEvaluation(null);
          setShowEvalPanel(false);
          setHint(null);
          if (data.round_complete) {
            navigate(`/interview/${sessionId}`);
          } else if (data.next_problem) {
            setProblem(data.next_problem);
            setProblemIndex(p => p + 1);
            if (data.next_problem.starter_code) {
              setCode(data.next_problem.starter_code[language] || '');
            }
            startTranscriptIndexRef.current = transcript.length;
          }
        }, 3200);
      }, 2000);

    } catch (err) {
      setError(err.message || 'Failed to submit code solution.');
      setCompilerStep(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  // Footer audio visualizer bars loop
  useEffect(() => {
    const bars = barRefsArr.current;
    let frame = 0;
    const animate = () => {
      frame++;
      bars.forEach((b, i) => {
        if (!b) return;
        let h, bg;
        const wave = Math.sin((i / bars.length) * Math.PI * 2 + frame / 15);
        if (isRecording && !muted) {
          const v = volume + 0.05;
          h = 4 + wave * 30 * v * (0.6 + Math.random() * 0.4);
          bg = '#ffffff';
        } else {
          h = 3 + Math.sin(i * 0.3 + frame / 40) * 1.5;
          bg = 'rgba(255,255,255,0.06)';
        }
        b.style.height = Math.max(3, Math.min(32, h)) + 'px';
        b.style.backgroundColor = bg;
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isRecording, volume]);

  const lastCandidateLine = [...transcript].reverse().find(t => t.speaker === 'candidate');
  const muted = !isRecording;

  // Determine active milestone based on session state variables
  const getActiveMilestone = () => {
    if (showEvalPanel) return 4; // Evaluation / Review
    if (hint) return 3; // Optimization
    if (code !== (problem?.starter_code?.[language] || '')) return 2; // Development / Coding
    if (transcript.length > startTranscriptIndexRef.current) return 1; // Planning
    return 0; // Briefing
  };
  const activeMilestone = getActiveMilestone();

  // Highlighted Big-O complexity curves
  const getComplexityHighlight = () => {
    const codeStr = code.toLowerCase();
    const timeComp = evaluation?.time_complexity?.toLowerCase() || '';
    if (timeComp.includes('o(n^2)') || codeStr.includes('for') && codeStr.split('for').length > 2) return 'n2';
    if (timeComp.includes('o(n log n)')) return 'nlogn';
    if (timeComp.includes('o(n)') || codeStr.includes('for') || codeStr.includes('while')) return 'n';
    if (timeComp.includes('o(log n)') || codeStr.includes('binary') || codeStr.includes('mid')) return 'logn';
    return '1';
  };
  const complexityHighlight = getComplexityHighlight();

  if (!showUI) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', fontFamily: 'var(--font-sans)', color: '#fff' }}>
        <div className="museum-background">
          <div className="aurora-glow" />
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.06)', borderTopColor: '#ffffff', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>BOOTSTRAPPING CODING RUNTIME...</div>
        <div style={{ fontSize: '11px', color: '#555555', fontFamily: 'var(--font-code)' }}>STATUS: {(connectionStatus || 'CONNECTING').toUpperCase()}</div>
      </div>
    );
  }

  const diffVariant = problem?.difficulty?.toLowerCase() === 'easy' ? 'success' : problem?.difficulty?.toLowerCase() === 'medium' ? 'warning' : 'danger';

  return (
    <div className="dsa-workspace-root">
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

      {/* ── HEADER STATUS DOCK ── */}
      <div style={{
        height: '60px',
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
        {/* Left: session telemetry */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: '9px', color: '#888888', fontWeight: 700, letterSpacing: '0.08em' }}>SYS_DSA_RUNTIME: STABLE</span>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: '12px', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(sessionSeconds)}
          </span>
        </div>

        {/* Center: Dynamic Milestone Timeline */}
        <div className="milestones-timeline">
          {['Briefing', 'Planning', 'Coding', 'Optimization', 'Review'].map((step, idx) => (
            <div key={idx} className={`milestone-node-dsa ${idx < activeMilestone ? 'completed' : idx === activeMilestone ? 'active' : ''}`}>
              <div className="milestone-circle" />
              <span>{step}</span>
              {idx < 4 && <span style={{ color: 'rgba(255,255,255,0.06)', margin: '0 4px' }}>//</span>}
            </div>
          ))}
        </div>

        {/* Right: Challenge tracking */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: '9.5px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            PROBLEM {problemIndex + 1} / 2
          </span>
          <div style={{ width: '80px', height: '2px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(problemIndex + 1) / 2 * 100}%`, background: '#ffffff', borderRadius: '99px' }} />
          </div>
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div className="dsa-grid">
        
        {/* LEFT PANEL: Conversational briefing / complexity */}
        <div className="dsa-sidebar">
          
          {/* Subtab selection */}
          <div className="dsa-tab-bar">
            <button
              onClick={() => setActiveSidebarTab('briefing')}
              className={`dsa-tab-button ${activeSidebarTab === 'briefing' ? 'active' : ''}`}
            >
              Challenge Briefing
            </button>
            <button
              onClick={() => setActiveSidebarTab('complexity')}
              className={`dsa-tab-button ${activeSidebarTab === 'complexity' ? 'active' : ''}`}
            >
              Complexity Profile
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeSidebarTab === 'briefing' ? (
              <motion.div
                key="briefing"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
              >
                {loading ? (
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '10px', color: '#555' }}>Initializing problem briefing...</span>
                ) : error ? (
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '10px', color: '#D32F2F' }}>ERR: {error}</span>
                ) : problem ? (
                  <>
                    {/* Header meta */}
                    <div>
                      <Badge variant={diffVariant}>{problem.difficulty}</Badge>
                      <h2 style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-0.02em', marginTop: '10px', color: '#ffffff' }}>
                        {problem.title}
                      </h2>
                    </div>

                    {/* AI Introduction note */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.6, color: '#a3a3a3' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontFamily: 'var(--font-code)', fontSize: '8px', color: '#ffffff', textTransform: 'uppercase' }}>
                        <SparklesIcon size={12} /> AI ASSISTANT CONCEPT BRIEF
                      </div>
                      "Let's tackle this constraint layout. Look closely at how the input scales. Optimize for both speed and memory bounds."
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: '13.5px', color: '#a3a3a3', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                      {problem.description}
                    </div>

                    {/* Examples */}
                    {problem.examples?.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'var(--font-code)', fontSize: '9px', color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>EXAMPLES</div>
                        {problem.examples.map((ex, idx) => (
                          <div key={idx} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '10px', fontFamily: 'var(--font-code)', fontSize: '11px', color: '#a3a3a3', marginBottom: '8px' }}>
                            <div><span style={{ color: '#ffffff' }}>Input:</span> {ex.input}</div>
                            <div><span style={{ color: '#ffffff' }}>Output:</span> {ex.output}</div>
                            {ex.explanation && <div style={{ marginTop: '4px', color: '#555555', fontSize: '10px' }}>// {ex.explanation}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Constraints */}
                    {problem.constraints?.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'var(--font-code)', fontSize: '9px', color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>CONSTRAINTS</div>
                        <ul style={{ margin: 0, paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {problem.constraints.map((c, idx) => (
                            <li key={idx} style={{ fontSize: '12.5px', color: '#888888' }}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                key="complexity"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
              >
                <div className="complexity-box">
                  <div style={{ fontFamily: 'var(--font-code)', fontSize: '9px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Big-O SCALABILITY MODEL
                  </div>
                  
                  {/* SVG Complexity Curve graphs */}
                  <svg className="complexity-graph-svg" viewBox="0 0 100 50">
                    {/* O(1) */}
                    <path d="M 0 45 L 100 45" className={`complexity-curve ${complexityHighlight === '1' ? 'active' : ''}`} />
                    <text x="80" y="42" className={`complexity-label ${complexityHighlight === '1' ? 'active' : ''}`}>O(1)</text>

                    {/* O(log N) */}
                    <path d="M 0 45 Q 30 35 100 32" className={`complexity-curve ${complexityHighlight === 'logn' ? 'active' : ''}`} />
                    <text x="80" y="28" className={`complexity-label ${complexityHighlight === 'logn' ? 'active' : ''}`}>O(log N)</text>

                    {/* O(N) */}
                    <path d="M 0 45 L 100 15" className={`complexity-curve ${complexityHighlight === 'n' ? 'active' : ''}`} strokeDasharray="1 1" />
                    <text x="80" y="11" className={`complexity-label ${complexityHighlight === 'n' ? 'active' : ''}`}>O(N)</text>

                    {/* O(N log N) */}
                    <path d="M 0 45 Q 40 25 100 5" className={`complexity-curve ${complexityHighlight === 'nlogn' ? 'active' : ''}`} />
                    <text x="70" y="5" className={`complexity-label ${complexityHighlight === 'nlogn' ? 'active' : ''}`}>O(N log N)</text>

                    {/* O(N^2) */}
                    <path d="M 0 45 Q 15 45 40 0" className={`complexity-curve ${complexityHighlight === 'n2' ? 'active' : ''}`} />
                    <text x="22" y="12" className={`complexity-label ${complexityHighlight === 'n2' ? 'active' : ''}`}>O(N²)</text>
                  </svg>

                  <div style={{ marginTop: '14px', fontSize: '11px', lineHeight: 1.5, color: '#888888', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                    Active algorithm highlights curve based on structure logic scans and evaluation response indices.
                  </div>
                </div>

                {/* Simulated telemetry gauges */}
                <div className="complexity-box" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#888888' }}>COMPILER RUNTIME DIAGNOSTICS</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#555' }}>V8 SANDBOX CPU:</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{isSubmitting ? 'HIGH (RE-COMPILING)' : '0.04%'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#555' }}>MEMORY CONSUMED:</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{evaluation?.space_complexity ? evaluation.space_complexity : '3.8 MB'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#555' }}>TESTS RUN TIME:</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{evaluation?.time_complexity ? evaluation.time_complexity : 'N/A'}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT PANEL: Code Editor & Orb */}
        <div className="editor-glass-container">
          
          {/* Header language tabs */}
          <div className="editor-header-tabs">
            <div style={{ display: 'flex', height: '100%' }}>
              <button
                onClick={() => handleLanguageChange('python')}
                className={`editor-tab ${language === 'python' ? 'active' : ''}`}
              >
                Python 3.10
              </button>
              <button
                onClick={() => handleLanguageChange('javascript')}
                className={`editor-tab ${language === 'javascript' ? 'active' : ''}`}
              >
                Node.js (ES6)
              </button>
            </div>

            {/* Embedded compiler state loader */}
            {compilerStep > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#ffffff' }}>
                <TerminalIcon size={12} />
                <span>
                  {compilerStep === 1 && '1/4 LEXICAL ANALYSIS...'}
                  {compilerStep === 2 && '2/4 INTERMEDIATE AST...'}
                  {compilerStep === 3 && '3/4 INJECTING UNIT TESTS...'}
                  {compilerStep === 4 && '4/4 EXECUTING METRICS...'}
                </span>
                <span className="hologram-cursor" style={{ height: '8px', width: '2px' }} />
              </div>
            )}
          </div>

          {/* Hint notification Banner */}
          <AnimatePresence>
            {hint && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#ffffff',
                  fontSize: '13px',
                  zIndex: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SparklesIcon size={14} />
                  <span>{hint}</span>
                </div>
                <button
                  onClick={() => setHint(null)}
                  style={{ background: 'none', border: 'none', color: '#555555', cursor: 'pointer', fontSize: '13px', padding: '4px' }}
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Monaco Editor Canvas */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(val) => setCode(val || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 22,
                padding: { top: 16 },
                scrollbar: { vertical: 'visible', horizontal: 'visible' },
                backgroundColor: '#050505',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                fontLigatures: true,
                renderLineHighlight: 'all',
                lineNumbersMinChars: 3
              }}
            />
          </div>

          {/* Floating reactive ThreeJS core */}
          <div style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            width: '90px',
            height: '90px',
            zIndex: 9,
            pointerEvents: 'none',
            borderRadius: '50%',
            background: 'rgba(5, 5, 5, 0.6)',
            backdropFilter: 'blur(15px)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}>
            <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', border: '2px solid rgba(255, 255, 255, 0.1)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.2)', animation: 'pulse 2s infinite' }} />
              <div style={{ position: 'absolute', inset: 15, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.15)', animation: 'pulse 2s infinite reverse' }} />
            </div>
          </div>

          {/* Evaluation Result overlay */}
          <AnimatePresence>
            {showEvalPanel && evaluation && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="slide-up-eval"
              >
                <div className="eval-header">
                  <span style={{ color: evaluation.correct ? '#ffffff' : '#D32F2F' }}>
                    {evaluation.correct ? '✓ COMPILATION SUCCESSFUL' : '✗ SANDBOX METRIC ERRORS'}
                  </span>
                  <Badge variant="default">TIME: {evaluation.time_complexity || 'N/A'}</Badge>
                  <Badge variant="default">SPACE: {evaluation.space_complexity || 'N/A'}</Badge>
                </div>
                
                <div className="eval-feedback-text">
                  {evaluation.feedback}
                </div>

                <div style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {evaluation.round_complete ? 'Round challenges complete. Closing compiler context...' : 'Advancing to next problem stage...'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>

      {/* ── FOOTER TOOL DOCK ── */}
      <div className="dsa-footer-dock">
        {/* Voice explanations mic controls */}
        <Button
          variant={isRecording ? 'danger' : 'outline'}
          size="sm"
          onClick={handleToggleMic}
          disabled={voiceEnabled === false}
          icon={voiceEnabled === false || muted ? <MicOffIcon color="currentColor" /> : <MicIcon color="currentColor" />}
          style={isRecording ? { borderColor: '#ffffff', background: 'rgba(255,255,255,0.06)' } : { height: '36px' }}
        >
          {voiceEnabled === false ? 'Voice disabled' : isRecording ? 'Listening (Click to stop)' : 'Explain code approach'}
        </Button>

        {/* Live dynamic Speech text waveform overlay */}
        {isRecording && lastCandidateLine ? (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 10, 10, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '99px',
            padding: '6px 16px',
            fontSize: '11px',
            color: '#ffffff',
            fontFamily: 'var(--font-code)',
            maxWidth: '380px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'node-pulse-glow 1.5s infinite alternate' }} />
            <span>{lastCandidateLine.text}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '30px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i}
                   ref={el => { barRefsArr.current[i] = el; }}
                   style={{ width: '2px', borderRadius: '4px', height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', transition: 'background-color 200ms ease' }} />
            ))}
          </div>
        )}

        {/* Action button controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGetHint}
            disabled={isHintLoading || !problem}
            style={{ height: '36px' }}
          >
            {isHintLoading ? 'Synthesizing hint...' : 'Get hint'}
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting || loading || !problem}
            loading={isSubmitting}
            style={{ height: '36px' }}
          >
            {isSubmitting ? 'Reviewing code...' : 'Submit solution →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
