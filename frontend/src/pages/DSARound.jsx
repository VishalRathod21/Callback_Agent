import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from '../api/client';
import { useInterviewStore } from '../store/interviewStore';
import { useWebSocket } from '../hooks/useWebSocket';
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
        color: active ? '#ffffff' : 'var(--paper-dim)',
        transition: 'all 0.25s var(--ease)',
      }}
    >
      {lang.toUpperCase()}
    </button>
  );
}

export default function DSARound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

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
        .catch(() => setError('Failed to resolve interview workspace context.'));
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
      } catch {
        setError('Error loading the assessment problem. Please try again.');
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

  const { isConnected, connectionStatus, isRecording, hasPermission, startRecording, stopRecording, unlockAudioContext } = useWebSocket({
    sessionId,
    onTranscript: (msg) => addTranscript(msg),
    onAIResponse: (msg) => addTranscript({ speaker: 'interviewer', text: msg.text }),
  });

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
    if (!problem) return;
    try {
      const response = await axios.post(`/interviews/${sessionId}/dsa/hint`, { current_code: code, language });
      setHint(response.data.hint);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => setHint(null), 12000);
    } catch {}
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
      setError(err.response?.data?.detail || 'Failed to submit code solution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const lastCandidateLine = [...transcript].reverse().find(t => t.speaker === 'candidate');

  if (!isConnected) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'var(--stage-black)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', fontFamily: 'var(--font-sans)', color: 'var(--paper)' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2.5px solid var(--card-border)', borderTopColor: 'var(--spotlight)', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>Connecting to interview room...</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)' }}>STATUS: {(connectionStatus || 'CONNECTING').toUpperCase()}</div>
      </div>
    );
  }

  const diffMap = { easy: 'success', medium: 'warning', hard: 'danger' };
  const diffVariant = diffMap[problem?.difficulty?.toLowerCase()] || 'warning';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--stage-black)', color: 'var(--paper)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* ── ROW 1: STATUS BAR ── */}
      <div style={{
        height: '52px',
        background: 'var(--panel-bg)',
        borderBottom: '1px solid var(--card-border)',
        padding: '0 var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        {/* Left: REC + timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="rec-dot" style={{ display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--rec-red)', fontWeight: 700, letterSpacing: '0.06em' }}>LIVE REHEARSAL</span>
          <span className="mono-data" style={{ fontSize: '13px', color: '#ffffff', fontWeight: 600, marginLeft: '6px' }}>{formatTime(sessionSeconds)}</span>
        </div>

        {/* Center */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dim)', letterSpacing: '0.08em', fontWeight: 600 }}>
          ROUND 1 / 3 — DSA SANDBOX COMPILER
        </span>

        {/* Right: problem progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dim)', fontWeight: 600 }}>
            PROBLEM {problemIndex + 1} / 2
          </span>
          <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(problemIndex + 1) / 2 * 100}%`, background: 'var(--spotlight)', borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
      </div>

      {/* ── ROW 2: MAIN PANEL ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} className="dsa-split-editor">

        {/* LEFT: Problem panel */}
        <div style={{
          width: '380px',
          flexShrink: 0,
          background: 'var(--panel-bg)',
          borderRight: '1px solid var(--card-border)',
          overflowY: 'auto',
          padding: '28px var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }} className="dsa-left-rail">
          {loading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)' }}>
              {'> BOOTSTRAPPING CODING RUNTIME...'}
            </div>
          ) : error ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--rec-red)' }}>
              {'> ERR: '}{error}
            </div>
          ) : problem ? (
            <>
              {/* Difficulty + title */}
              <div>
                <Badge variant={diffVariant}>{problem.difficulty}</Badge>
                <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '12px', color: '#ffffff' }}>
                  {problem.title}
                </h2>
              </div>

              {/* Description */}
              <div style={{ fontSize: '14px', color: 'var(--paper-dim)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {problem.description}
              </div>

              {/* Examples */}
              {problem.examples?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontWeight: 700 }}>Test Case Examples</div>
                  {problem.examples.map((ex, idx) => (
                    <div key={idx} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '12px', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--paper-dim)', marginBottom: '10px' }}>
                      <div><span style={{ color: 'var(--spotlight)' }}>Input:</span> {ex.input}</div>
                      <div><span style={{ color: 'var(--spotlight)' }}>Output:</span> {ex.output}</div>
                      {ex.explanation && <div style={{ marginTop: '6px', color: 'var(--paper-dimmer)', fontSize: '11px' }}>// {ex.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Constraints */}
              {problem.constraints?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontWeight: 700 }}>Complexity Constraints</div>
                  <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {problem.constraints.map((c, idx) => (
                      <li key={idx} style={{ fontSize: '13px', color: 'var(--paper-dim)' }}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--rec-red)' }}>
              {'> FAILED TO RETRIEVE PROBLEM SCHEMA.'}
            </div>
          )}
        </div>

        {/* RIGHT: Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {/* Language tabs */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--card-border)', height: '48px', padding: '0 var(--space-4)', background: 'var(--panel-bg)', flexShrink: 0 }}>
            <LangTab lang="python" active={language === 'python'} onClick={() => handleLanguageChange('python')} />
            <LangTab lang="javascript" active={language === 'javascript'} onClick={() => handleLanguageChange('javascript')} />
          </div>

          {/* Hint banner */}
          {hint && (
            <div style={{
              background: 'rgba(242, 184, 75, 0.08)',
              borderBottom: '1px solid rgba(242, 184, 75, 0.2)',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'var(--spotlight)',
              fontSize: '13px',
              flexShrink: 0,
              animation: 'fadeIn 0.2s var(--ease)'
            }}>
              <span>💡 Hint: {hint}</span>
              <Button variant="ghost" size="sm" onClick={() => setHint(null)} style={{ color: 'var(--spotlight)', padding: '0 8px', height: '24px' }}>✕</Button>
            </div>
          )}

          {/* Monaco editor */}
          <div style={{ flex: 1, overflow: 'hidden', background: '#090916' }}>
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(val) => setCode(val || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                lineHeight: 22,
                padding: { top: 16 },
                scrollbar: { vertical: 'visible', horizontal: 'visible' },
                backgroundColor: '#090916',
              }}
            />
          </div>

          {/* Evaluation slide-up panel */}
          {showEvalPanel && evaluation && (
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: '170px',
              background: 'var(--panel-bg)',
              borderTop: '1px solid var(--card-border)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              animation: 'slideUp 250ms var(--ease)',
              zIndex: 10,
            }}>
              {/* Row 1: result label + complexity badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: evaluation.correct ? 'var(--prompter-green)' : 'var(--rec-red)' }}>
                  {evaluation.correct ? '✓ SOLUTIONS ACCEPTED' : '✗ EVALUATION FAILED'}
                </span>
                <Badge variant="default">TIME: {evaluation.time_complexity || 'N/A'}</Badge>
                <Badge variant="default">SPACE: {evaluation.space_complexity || 'N/A'}</Badge>
              </div>
              {/* Row 2: feedback */}
              <div style={{ fontSize: '13px', color: 'var(--paper-dim)', lineHeight: 1.5 }}>
                {evaluation.feedback}
              </div>
              {/* Row 3: next */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dimmer)' }}>
                {evaluation.round_complete ? 'All requirements met. Closing DSA Round...' : 'Loading next problem challenge...'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: CONTROL BAR ── */}
      <div style={{
        height: '64px',
        background: 'var(--panel-bg)',
        borderTop: '1px solid var(--card-border)',
        padding: '0 var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Left: mic button */}
        <Button
          variant={isRecording ? 'danger' : 'outline'}
          size="sm"
          onClick={handleToggleMic}
          icon={<MicIcon color={isRecording ? 'var(--rec-red)' : 'currentColor'} />}
          style={isRecording ? { borderColor: 'var(--rec-red)', background: 'rgba(226, 72, 61, 0.08)' } : { height: '36px' }}
        >
          {isRecording ? 'Listening (Click to stop)' : 'Explain code approach'}
        </Button>

        {/* Center: transcript toast */}
        {isRecording && lastCandidateLine && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 16px',
            fontSize: 'var(--text-xs)',
            color: 'var(--spotlight)',
            fontFamily: 'var(--font-mono)',
            maxWidth: '380px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 10px rgba(242, 184, 75, 0.1)',
          }}>
            🎙️ {lastCandidateLine.text}
          </div>
        )}

        {/* Right: hint + submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="outline" size="sm" onClick={handleGetHint} style={{ height: '36px' }}>Get hint</Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting || loading}
            loading={isSubmitting}
          >
            Submit solution →
          </Button>
        </div>
      </div>
      
      <style>{`
        @media (max-width: 992px) {
          .dsa-left-rail { display: none !important; }
        }
      `}</style>
    </div>
  );
}
