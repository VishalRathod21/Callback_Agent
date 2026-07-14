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

/* ── Mic SVG icon ── */
const MicIcon = ({ color = 'currentColor' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

/* ── Language tab ── */
function LangTab({ lang, active, onClick }) {
  return (
    <button
      onClick={() => onClick(lang)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--spotlight)' : '2px solid transparent',
        padding: '0 16px',
        height: '48px',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--text-primary)' : 'var(--paper-dim)',
        transition: 'all 0.25s var(--ease)',
      }}
    >
      <span className={active ? "text-glow-gold" : ""}>
        {lang.toUpperCase()}
      </span>
    </button>
  );
}

export default function DSARound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const candidate = useInterviewStore((state) => state.candidate);
  const session = useInterviewStore((state) => state.session);
  const transcript = useInterviewStore((state) => state.transcript);
  const setCandidate = useInterviewStore((state) => state.setCandidate);
  const setSession = useInterviewStore((state) => state.setSession);
  const addTranscript = useInterviewStore((state) => state.addTranscript);
  const setRecording = useInterviewStore((state) => state.setRecording);
  const setConnected = useInterviewStore((state) => state.setConnected);

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

  const hintTimeoutRef = useRef(null);
  const startTranscriptIndexRef = useRef(0);
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    if (!session || !candidate) {
      axios.get(`/interviews/${sessionId}`)
        .then((res) => {
          const data = res.data;
          setSession({ id: data.session_id, currentRound: data.current_round, roundScores: data.round_scores, status: data.status });
          if (data.candidate_id) {
            setCandidate({ id: data.candidate_id, name: data.candidate_name, role: data.target_role, status: data.status });
          }
        })
        .catch((err) => setError(err.message || 'Failed to resolve interview workspace context.'));
    }
  }, [sessionId, session, candidate, setSession, setCandidate]);

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        setLoading(true); setError('');
        const res = await axios.get(`/interviews/${sessionId}/dsa/problem`);
        setProblem(res.data);
        if (res.data?.starter_code) setCode(res.data.starter_code[language] || '');
        startTranscriptIndexRef.current = transcript.length;
      } catch (err) {
        setError(err.message || 'Error loading the assessment problem. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchProblem();
  }, [sessionId]);

  useEffect(() => {
    const t = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const { isConnected, status: connectionStatus, isRecording, hasPermission, startRecording, stopRecording, unlockAudio: unlockAudioContext } = useWebSocket({
    sessionId,
    enabled: isAuthenticated && !authLoading,
    onCandidateTranscript: (msg) => addTranscript({ speaker: 'candidate', text: msg.text }),
    onAITranscript: (msg) => addTranscript({ speaker: 'interviewer', text: msg.text }),
  });

  // Allow the DSA UI to render once the problem is loaded regardless of WS status.
  // The WebSocket here is only used for optional voice explanation; the core experience
  // (problem statement, editor, submit) must not be blocked by connection state.
  const [wsTimedOut, setWsTimedOut] = useState(false);
  useEffect(() => {
    // Give WS 8 seconds to connect; after that, show UI anyway
    const t = setTimeout(() => setWsTimedOut(true), 8000);
    if (isConnected) clearTimeout(t);
    return () => clearTimeout(t);
  }, [isConnected]);
  const showUI = isConnected || wsTimedOut || !loading;

  useEffect(() => { setRecording(isRecording); }, [isRecording, setRecording]);
  useEffect(() => { setConnected(isConnected); }, [isConnected, setConnected]);
  useEffect(() => { return () => { if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); }; }, []);

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    if (problem?.starter_code) setCode(problem.starter_code[lang] || '');
  };

  const getVerbalExplanation = () => transcript
    .filter((t, idx) => idx >= startTranscriptIndexRef.current && t.speaker === 'candidate')
    .map(t => t.text).join(' ');

  const handleToggleMic = async () => {
    if (!audioUnlockedRef.current) {
      try { await unlockAudioContext(); audioUnlockedRef.current = true; } catch {}
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
      hintTimeoutRef.current = setTimeout(() => setHint(null), 12000);
    } catch {} finally {
      setIsHintLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!problem || isSubmitting) return;
    try {
      setIsSubmitting(true); setError(''); stopRecording();
      const response = await axios.post(`/interviews/${sessionId}/dsa/submit`, {
        code, language,
        verbal_explanation: getVerbalExplanation() || null,
        problem_index: problemIndex,
      });
      const data = response.data;
      setEvaluation(data.evaluation);
      setShowEvalPanel(true);
      setTimeout(() => {
        setEvaluation(null); setShowEvalPanel(false); setHint(null);
        if (data.round_complete) {
          navigate(`/interview/${sessionId}`);
        } else if (data.next_problem) {
          setProblem(data.next_problem);
          setProblemIndex(p => p + 1);
          if (data.next_problem.starter_code) setCode(data.next_problem.starter_code[language] || '');
          startTranscriptIndexRef.current = transcript.length;
        }
      }, 2500);
    } catch (err) {
      setError(err.message || 'Failed to submit code solution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const lastCandidateLine = [...transcript].reverse().find(t => t.speaker === 'candidate');

  // Only show the full-page spinner briefly while the problem is still loading.
  // Once the problem is fetched (or WS has had 8s to connect), show the full UI.
  if (!showUI) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'var(--stage-black)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', fontFamily: 'var(--font-sans)', color: 'var(--paper)' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2.5px solid var(--card-border)', borderTopColor: 'var(--spotlight)', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Loading DSA sandbox...</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)' }}>STATUS: {(connectionStatus || 'CONNECTING').toUpperCase()}</div>
      </div>
    );
  }

  const diffMap = { easy: 'success', medium: 'warning', hard: 'danger' };
  const diffVariant = diffMap[problem?.difficulty?.toLowerCase()] || 'warning';

  return (
    <div className="landing-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="noise-overlay" />
      
      {/* Drifting subtle auroras */}
      <div className="aurora-container">
        <div className="aurora-blob aurora-1" style={{ opacity: 0.06 }} />
        <div className="aurora-blob aurora-2" style={{ opacity: 0.06 }} />
      </div>

      {/* ── ROW 1: STATUS BAR (STICKY GLASS) ── */}
      <div className="glass-panel" style={{
        height: '52px',
        borderRadius: 0,
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10,
        background: 'var(--card-bg)',
        backdropFilter: 'blur(30px) saturate(180%)'
      }}>
        {/* Left: Live status + timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)', animation: 'breathing-pulse 1.8s ease-in-out infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--danger)', fontWeight: 700, letterSpacing: '0.06em' }}>LIVE REHEARSAL</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, marginLeft: '6px', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(sessionSeconds)}
          </span>
        </div>

        {/* Center */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 700 }}>
          ROUND 1 / 3 — DSA SANDBOX COMPILER
        </span>

        {/* Right: problem progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            PROBLEM {problemIndex + 1} / 2
          </span>
          <div style={{ width: '80px', height: '4px', background: 'var(--border-strong)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(problemIndex + 1) / 2 * 100}%`, background: 'var(--accent)', borderRadius: '99px' }} />
          </div>
        </div>
      </div>

      {/* ── ROW 2: MAIN WORKSPACE ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        
        {/* LEFT: Glass Problem Statement Panel */}
        <div className="glass-panel" style={{
          width: '380px',
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderLeft: 'none',
          borderRight: '1px solid var(--border-glass)',
          flexShrink: 0,
          background: 'var(--card-bg)',
          backdropFilter: 'blur(30px) saturate(180%)',
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {loading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
              {'> BOOTSTRAPPING CODING RUNTIME...'}
            </div>
          ) : error ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--danger)' }}>
              {'> ERR: '}{error}
            </div>
          ) : problem ? (
            <>
              {/* Difficulty badge + Title */}
              <div>
                <Badge variant={diffVariant}>{problem.difficulty}</Badge>
                <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  {problem.title}
                </h2>
              </div>

              {/* Description */}
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                {problem.description}
              </div>

              {/* Test Cases */}
              {problem.examples?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontWeight: 700 }}>Test Case Examples</div>
                  {problem.examples.map((ex, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-inset)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      <div><span style={{ color: 'var(--accent)' }}>Input:</span> {ex.input}</div>
                      <div><span style={{ color: 'var(--accent)' }}>Output:</span> {ex.output}</div>
                      {ex.explanation && <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '10px' }}>// {ex.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Constraints */}
              {problem.constraints?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontWeight: 700 }}>Complexity Constraints</div>
                  <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {problem.constraints.map((c, idx) => (
                      <li key={idx} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--danger)' }}>
              {'> FAILED TO RETRIEVE PROBLEM SCHEMA.'}
            </div>
          )}
        </div>

        {/* RIGHT: Editor Dashboard */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          
          {/* Language Tabs Panel */}
          <div className="glass-panel" style={{
            height: '48px',
            borderRadius: 0,
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: '1px solid var(--border-glass)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            background: 'var(--card-bg)',
            backdropFilter: 'blur(20px)',
            flexShrink: 0
          }}>
            <LangTab lang="python" active={language === 'python'} onClick={() => handleLanguageChange('python')} />
            <LangTab lang="javascript" active={language === 'javascript'} onClick={() => handleLanguageChange('javascript')} />
          </div>

          {/* Hint Banner Overlay */}
          <AnimatePresence>
            {hint && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-panel"
                style={{
                  borderRadius: 0,
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: '1px solid var(--accent-border)',
                  background: 'var(--accent-subtle)',
                  padding: '10px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: 'var(--accent)',
                  fontSize: '13px',
                  flexShrink: 0,
                  zIndex: 8,
                }}
              >
                <span className="text-glow-gold">💡 Hint: {hint}</span>
                <button onClick={() => setHint(null)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '0 8px', fontSize: '14px' }}>✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Monaco Editor Container */}
          <div style={{ flex: 1, overflow: 'hidden', background: '#0A0A0B' }}>
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(val) => setCode(val || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 22,
                padding: { top: 16 },
                scrollbar: { vertical: 'visible', horizontal: 'visible' },
                backgroundColor: '#0A0A0B',
              }}
            />
          </div>

          {/* Evaluation slide-up dashboard panel */}
          <AnimatePresence>
            {showEvalPanel && evaluation && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="glass-panel"
                style={{
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0,
                  height: '170px',
                  borderRadius: 0,
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  borderTop: '1px solid var(--border-glass)',
                  background: 'rgba(10, 10, 11, 0.9)',
                  backdropFilter: 'blur(30px) saturate(180%)',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  zIndex: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className={evaluation.correct ? "text-glow-green" : "text-glow-red"} style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: evaluation.correct ? 'var(--success)' : 'var(--danger)' }}>
                    {evaluation.correct ? '✓ SOLUTIONS ACCEPTED' : '✗ EVALUATION FAILED'}
                  </span>
                  <Badge variant="default">TIME: {evaluation.time_complexity || 'N/A'}</Badge>
                  <Badge variant="default">SPACE: {evaluation.space_complexity || 'N/A'}</Badge>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {evaluation.feedback}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {evaluation.round_complete ? 'All requirements met. Closing DSA Round...' : 'Loading next problem challenge...'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── ROW 3: CONTROL BAR (GLASS FOOTER) ── */}
      <div className="glass-panel" style={{
        height: '64px',
        borderRadius: 0,
        borderBottom: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: '1px solid var(--border-glass)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10,
        background: 'var(--card-bg)',
        backdropFilter: 'blur(30px) saturate(180%)',
        position: 'relative'
      }}>
        {/* Left: Speak explain code */}
        <Button
          variant={isRecording ? 'danger' : 'outline'}
          size="sm"
          onClick={handleToggleMic}
          icon={<MicIcon color={isRecording ? 'var(--danger)' : 'currentColor'} />}
          style={isRecording ? { borderColor: 'var(--danger)', background: 'rgba(226, 72, 61, 0.08)' } : { height: '36px' }}
        >
          {isRecording ? 'Listening (Click to stop)' : 'Explain code approach'}
        </Button>

        {/* Center: Live speech transcription overlay + WS status */}
        {isRecording && lastCandidateLine ? (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 10, 11, 0.85)',
            border: '1px solid var(--border-glass)',
            borderRadius: '99px',
            padding: '6px 16px',
            fontSize: '12px',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            maxWidth: '380px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          }}>
            🎙️ {lastCandidateLine.text}
          </div>
        ) : !isConnected ? (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-muted)',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-muted)', animation: 'breathing-pulse 1.5s ease-in-out infinite' }} />
            MIC UNAVAILABLE — {connectionStatus?.toUpperCase()}
          </div>
        ) : null}

        {/* Right: Hint + Submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGetHint} 
            disabled={isHintLoading}
            style={{ height: '36px' }}
          >
            {isHintLoading ? 'Synthesizing hint...' : 'Get hint'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting || loading}
            loading={isSubmitting}
            style={{ height: '36px' }}
          >
            {isSubmitting ? 'Reviewing your code...' : 'Submit solution →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
