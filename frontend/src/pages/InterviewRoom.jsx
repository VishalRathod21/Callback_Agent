import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useInterviewStore } from '../store/interviewStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatusIndicator from '../components/ui/StatusIndicator';

function AudioVisualizer({ analyser, isRecording, isMuted }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!analyser || !isRecording || isMuted) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#151515';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw subtle grid line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Draw wave
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f2b84b'; // var(--spotlight)
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(242, 184, 75, 0.5)';
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isRecording, isMuted]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={80}
      style={{
        width: '100%',
        height: '80px',
        borderRadius: '12px',
        background: '#151515',
        border: '1px solid var(--card-border)',
        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
      }}
    />
  );
}

const ROUNDS_META = [
  { key: 'dsa',       name: 'DSA Algorithmic',     short: 'DSA' },
  { key: 'technical', name: 'Systems & Architecture', short: 'TECH' },
  { key: 'hr',        name: 'STAR HR Behavioural',  short: 'HR' },
];

export default function InterviewRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [activeRound, setActiveRound] = useState('');
  const [roundStarted, setRoundStarted] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [roundSeconds, setRoundSeconds] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState('Interviewer is connecting...');
  const [roundCompleteInfo, setRoundCompleteInfo] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [shouldAutoEnd, setShouldAutoEnd] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);

  const candidate = useInterviewStore(s => s.candidate);
  const session = useInterviewStore(s => s.session);
  const transcript = useInterviewStore(s => s.transcript);
  const setSession = useInterviewStore(s => s.setSession);
  const addTranscript = useInterviewStore(s => s.addTranscript);
  const setRecording = useInterviewStore(s => s.setRecording);
  const setConnected = useInterviewStore(s => s.setConnected);

  const roundTimerRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const roundStartedRef = useRef(false);
  const audioUnlockedRef = useRef(false);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);
  useEffect(() => { const t = setInterval(() => setSessionSeconds(p => p + 1), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await axios.get(`/interviews/${sessionId}`);
        const d = r.data;
        setSession({ id: d.session_id, currentRound: d.current_round, roundScores: d.round_scores, status: d.status });
        if (d.current_round === 'dsa') navigate(`/interview/${sessionId}/dsa`, { replace: true });
        else setActiveRound(d.current_round);
      } catch (e) { console.error('Session sync failed:', e); }
    };
    check();
  }, [sessionId, navigate, setSession]);

  const handleInterviewComplete = () => { candidate?.id ? navigate(`/report/${candidate.id}`) : navigate('/'); };

  const {
    isConnected, connectionStatus, isRecording, hasPermission, isMuted, toggleMute, analyser,
    startRound, startRecording, stopRecording, stopAudioPlayback, endRound, unlockAudioContext, submitTypedAnswer
  } = useWebSocket({
    sessionId,
    onTranscript: (msg) => { if (voiceMode || msg.speaker !== 'candidate') addTranscript(msg); },
    onAIResponse: (msg) => {
      setCurrentQuestion(msg.text);
      addTranscript({ speaker: 'interviewer', text: msg.text });
      setIsAnalyzing(false);
      setAiSpeaking(true);
      setTimeout(() => setAiSpeaking(false), 3000);
    },
    onRoundComplete: (data) => {
      const cs = useInterviewStore.getState().session;
      const ss = useInterviewStore.getState().setSession;
      const rn = cs?.currentRound || 'dsa';
      ss({ ...cs, roundScores: { ...(cs?.roundScores || {}), [rn]: data.score }, currentRound: data.next_round, status: 'completed' });
      setRoundCompleteInfo({ score: data.score, feedback: data.feedback, nextRound: data.next_round });
      setIsAnalyzing(false);
    },
    onInterviewComplete: handleInterviewComplete,
    onSessionHistory: (msg) => {
      if (msg.round) { setActiveRound(msg.round); setRoundStarted(true); roundStartedRef.current = true; }
      if (msg.current_question) setCurrentQuestion(msg.current_question);
      if (msg.history) useInterviewStore.setState({ transcript: msg.history });
    },
    onRoundShouldEnd: () => setShouldAutoEnd(true),
  });

  const handleSubmitTypedAnswer = () => {
    const t = typedAnswer.trim();
    if (!t || isAnalyzing) return;
    setIsAnalyzing(true);
    addTranscript({ speaker: 'candidate', text: t });
    submitTypedAnswer(t);
    setTypedAnswer('');
  };

  useEffect(() => { setRecording(isRecording); }, [isRecording, setRecording]);
  useEffect(() => { setConnected(isConnected); }, [isConnected, setConnected]);

  useEffect(() => {
    if (isConnected && !roundStartedRef.current && activeRound) {
      roundStartedRef.current = true; setRoundStarted(true);
      startRound(activeRound, candidate?.target_role || 'Software Engineer', session?.orchestrator_state?.resume_text || '');
      if (voiceMode) startRecording();
    }
  }, [isConnected, activeRound, candidate, session, startRound, startRecording, voiceMode]);

  useEffect(() => {
    if (roundStarted && !roundCompleteInfo) { roundTimerRef.current = setInterval(() => setRoundSeconds(p => p + 1), 1000); }
    else { if (roundTimerRef.current) clearInterval(roundTimerRef.current); }
    return () => { if (roundTimerRef.current) clearInterval(roundTimerRef.current); };
  }, [roundStarted, roundCompleteInfo]);

  useEffect(() => {
    if (roundCompleteInfo) {
      const t = setTimeout(() => {
        setRoundCompleteInfo(null); setRoundStarted(false); roundStartedRef.current = false; setRoundSeconds(0);
        if (roundCompleteInfo.nextRound && roundCompleteInfo.nextRound !== 'complete') setActiveRound(roundCompleteInfo.nextRound);
        else setActiveRound('');
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [roundCompleteInfo]);

  useEffect(() => {
    if (shouldAutoEnd) {
      const timer = setTimeout(() => {
        if (voiceMode) stopRecording();
        endRound();
        setShouldAutoEnd(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoEnd, stopRecording, endRound, voiceMode]);

  const handleStartRound = async (rn) => {
    if (!isConnected) return;
    if (voiceMode && !audioUnlockedRef.current) { try { await unlockAudioContext(); audioUnlockedRef.current = true; } catch {}  }
    stopAudioPlayback(); setRoundCompleteInfo(null); setActiveRound(rn); setRoundStarted(true); setRoundSeconds(0);
    setCurrentQuestion('Interviewer is starting the round...');
    setSession({ ...session, currentRound: rn, status: 'active' });
    startRound(rn, candidate?.target_role || 'Software Engineer', session?.orchestrator_state?.resume_text || '');
    if (voiceMode) startRecording();
  };

  const handleEndRound = () => { if (voiceMode) stopRecording(); endRound(); };

  const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`; };

  const activeRoundMeta = ROUNDS_META.find(r => r.key === activeRound);
  const activeRoundIndex = ROUNDS_META.findIndex(r => r.key === activeRound);
  const roundLabel = activeRoundMeta
    ? `ROUND ${activeRoundIndex + 2} / 3 — ${activeRoundMeta.name}`
    : 'INTERVIEW SESSION';

  if (!isConnected) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'var(--stage-black)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', fontFamily: 'var(--font-sans)', color: 'var(--paper)' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2.5px solid var(--card-border)', borderTopColor: 'var(--spotlight)', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>Connecting to interview room...</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)' }}>STATUS: {(connectionStatus || 'CONNECTING').toUpperCase()}</div>
      </div>
    );
  }

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
          <span className="mono-data" style={{ fontSize: '13px', color: '#ffffff', fontWeight: 600, marginLeft: '6px' }}>{fmt(sessionSeconds)}</span>
        </div>

        {/* Center */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dim)', letterSpacing: '0.08em', fontWeight: 600 }}>
          {roundLabel.toUpperCase()}
        </span>

        {/* Right: connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? 'var(--prompter-green)' : 'var(--spotlight)', display: 'inline-block', boxShadow: isConnected ? '0 0 6px var(--prompter-green)' : 'none' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isConnected ? 'var(--prompter-green)' : 'var(--spotlight)', fontWeight: 700 }}>
            {isConnected ? 'STABLE' : 'RECONNECTING'}
          </span>
        </div>
      </div>

      {/* ── ROW 2: MAIN PANEL ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} className="main-room-split">

        {/* LEFT RAIL */}
        <div style={{
          width: '240px',
          flexShrink: 0,
          background: 'var(--panel-bg)',
          borderRight: '1px solid var(--card-border)',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }} className="room-left-rail">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>Evaluation Timeline</div>

          {/* Round timeline */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ position: 'absolute', left: '3px', top: '10px', bottom: '10px', width: '1.5px', background: 'var(--card-border)' }} />

            {ROUNDS_META.map(r => {
              const done = session?.roundScores?.[r.key] !== undefined;
              const act = activeRound === r.key;
              const status = done ? 'complete' : act ? 'active' : 'idle';
              return (
                <div key={r.key} style={{ zIndex: 1 }}>
                  <StatusIndicator
                    status={status}
                    label={r.name}
                    sublabel={done ? `${Math.round(session.roundScores[r.key])}% Score` : act ? 'In progress' : 'Staged'}
                  >
                    {done && <Badge variant="success">{Math.round(session.roundScores[r.key])}%</Badge>}
                  </StatusIndicator>
                  {!done && !act && !activeRound && (
                    <Button variant="outline" size="sm" onClick={() => handleStartRound(r.key)} style={{ marginTop: '8px', marginLeft: '20px', fontSize: '11px', height: '28px', padding: '0 10px' }}>
                      Start round →
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Session ID */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', fontWeight: 500 }}>
              SESSION: {sessionId?.substring(0, 12).toUpperCase() || 'N/A'}
            </div>
          </div>
        </div>

        {/* CENTER PANEL */}
        <div style={{ flex: 1, background: 'transparent', display: 'flex', flexDirection: 'column', padding: '32px', overflow: 'hidden', position: 'relative' }}>
          
          {/* Spotlight drift glow */}
          <div className="spotlight-glow" style={{ top: '30%', left: '50%' }} />

          {/* AI Avatar Orb */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', flexShrink: 0, zIndex: 2 }}>
            <div style={{
              width: '94px', height: '94px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(242, 184, 75, 0.04) 0%, rgba(242, 184, 75, 0.15) 100%)',
              border: `2px solid ${aiSpeaking ? 'var(--spotlight)' : 'var(--card-border)'}`,
              boxShadow: aiSpeaking 
                ? '0 0 35px rgba(242, 184, 75, 0.4), inset 0 0 20px rgba(242, 184, 75, 0.2)' 
                : '0 8px 30px rgba(0, 0, 0, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              transition: 'all 0.5s var(--ease)',
              flexShrink: 0,
            }}
            >
              {/* Outer pulsing ring */}
              <div style={{
                position: 'absolute',
                top: '-8px', left: '-8px', right: '-8px', bottom: '-8px',
                borderRadius: '50%',
                border: '1.5px solid var(--spotlight)',
                opacity: aiSpeaking ? 0.65 : 0.2,
                animation: 'pulse-ring 2.2s cubic-bezier(0.215, 0.610, 0.355, 1) infinite',
              }} />

              {/* Concentric orbital details */}
              <div style={{
                position: 'absolute',
                top: '12px', left: '12px', right: '12px', bottom: '12px',
                borderRadius: '50%',
                border: '1px dashed rgba(242, 184, 75, 0.35)',
                transform: aiSpeaking ? 'rotate(360deg)' : 'none',
                animation: aiSpeaking ? 'spin 7s linear infinite' : 'none',
              }} />

              {/* Core active voice dot */}
              <div style={{
                width: '30px', height: '30px',
                borderRadius: '50%',
                background: aiSpeaking 
                  ? 'radial-gradient(circle, var(--spotlight) 0%, var(--stage-black) 80%)'
                  : 'radial-gradient(circle, var(--paper-dimmer) 0%, var(--panel-bg) 80%)',
                boxShadow: aiSpeaking ? '0 0 15px var(--spotlight)' : 'none',
                margin: 'auto',
              }} />
            </div>
            <div style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: '10px', 
              color: aiSpeaking ? 'var(--spotlight)' : 'var(--paper-dim)', 
              marginTop: '12px', 
              letterSpacing: '0.12em',
              fontWeight: 700,
            }}>
              {aiSpeaking ? 'AI_INTERVIEWER_SPEAKING' : 'PROMPTER_READY'}
            </div>
          </div>

          {/* Current question */}
          <div style={{ textAlign: 'center', marginBottom: '32px', flexShrink: 0, zIndex: 2 }}>
            <p style={{
              fontSize: '18px',
              fontWeight: 500,
              color: '#ffffff',
              lineHeight: 1.6,
              maxWidth: '640px',
              margin: '0 auto',
            }}>
              {activeRound
                ? (roundStarted ? `"${currentQuestion}"` : `Ready to start the ${activeRoundMeta?.name || activeRound} round.`)
                : 'Staging workspace. Select a structured round category on the left to begin.'}
            </p>
          </div>

          {/* Transcript */}
          <div style={{ 
            maxHeight: '320px', 
            overflowY: 'auto', 
            borderTop: '1.5px solid var(--card-border)', 
            flex: 1, 
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 2,
          }}>
            {transcript.map((item, idx) => {
              const isCand = item.speaker === 'candidate';
              return (
                <div key={idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isCand ? 'flex-end' : 'flex-start',
                  width: '100%',
                  animation: 'fadeIn 0.3s var(--ease) both',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: isCand ? 'var(--prompter-green)' : 'var(--spotlight)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {isCand ? 'You (Candidate)' : 'AI Interviewer'}
                  </div>
                  <div style={{ 
                    fontSize: 'var(--text-sm)', 
                    color: isCand ? '#ffffff' : 'var(--paper-dim)', 
                    lineHeight: 1.5,
                    background: isCand ? 'rgba(62, 207, 142, 0.08)' : 'var(--panel-bg)',
                    border: `1px solid ${isCand ? 'rgba(62, 207, 142, 0.2)' : 'var(--card-border)'}`,
                    padding: '10px 16px',
                    borderRadius: '12px',
                    maxWidth: '80%',
                    wordBreak: 'break-word',
                  }}>
                    {item.text}
                  </div>
                </div>
              );
            })}
            {isAnalyzing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--card-border)', borderTopColor: 'var(--spotlight)', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>ANALYZING TRANSCRIPT SPEECH...</span>
              </div>
            )}
            {roundCompleteInfo && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(62, 207, 142, 0.06)', border: '1px solid rgba(62, 207, 142, 0.15)', borderRadius: '12px', marginTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge variant="success">ROUND COMPLETE</Badge>
                  <span style={{ fontSize: 'var(--text-sm)', color: '#ffffff', fontWeight: 600 }}>Score: {Math.round(roundCompleteInfo.score)}%</span>
                </div>
                {roundCompleteInfo.feedback && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', margin: 0, lineHeight: 1.5 }}>
                    {roundCompleteInfo.feedback}
                  </p>
                )}
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Text input (non-voice mode) */}
          {!voiceMode && roundStarted && !roundCompleteInfo && (
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0, zIndex: 2 }}>
              <textarea
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSubmitTypedAnswer(); } }}
                disabled={isAnalyzing}
                placeholder="Type your rehearsal line... (Ctrl+Enter to submit)"
                style={{
                  width: '100%', minHeight: '86px', maxHeight: '150px',
                  background: 'var(--panel-bg)',
                  border: '1.5px solid var(--card-border)',
                  borderRadius: '12px',
                  color: 'var(--paper)',
                  padding: '12px 16px',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-sans)',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  outline: 'none',
                  transition: 'all 0.25s var(--ease)',
                  boxSizing: 'border-box',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'var(--spotlight)';
                  e.target.style.boxShadow = '0 0 10px rgba(242, 184, 75, 0.1)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--card-border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="md" disabled={!typedAnswer.trim() || isAnalyzing} onClick={handleSubmitTypedAnswer}>
                  {isAnalyzing ? 'Evaluating line...' : 'Submit Line'}
                </Button>
              </div>
            </div>
          )}

          {/* Voice input (voice mode) */}
          {voiceMode && roundStarted && !roundCompleteInfo && (
            <div style={{
              marginTop: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '20px',
              background: 'var(--panel-bg)',
              border: '1.5px solid var(--card-border)',
              borderRadius: '16px',
              alignItems: 'center',
              flexShrink: 0,
              zIndex: 2,
              animation: 'fadeIn 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: isRecording ? 'var(--rec-red)' : 'var(--paper-dimmer)',
                    boxShadow: isRecording ? '0 0 8px var(--rec-red)' : 'none',
                    display: 'inline-block'
                  }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: isRecording ? '#ffffff' : 'var(--paper-dimmer)' }}>
                    {isRecording ? 'LIVE MICROPHONE RECORDING' : 'MICROPHONE STANDBY'}
                  </span>
                </div>
                
                {isRecording && (
                  <button
                    onClick={toggleMute}
                    style={{
                      background: isMuted ? 'var(--rec-red)' : 'rgba(255, 255, 255, 0.08)',
                      color: '#ffffff',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isMuted ? '🔇 MUTED (UNMUTE)' : '🎙️ MUTE MIC'}
                  </button>
                )}
              </div>

              <div style={{ width: '100%' }}>
                <AudioVisualizer analyser={analyser} isRecording={isRecording} isMuted={isMuted} />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', width: '100%' }}>
                {!isRecording ? (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={async () => {
                      try {
                        await unlockAudioContext();
                        audioUnlockedRef.current = true;
                        startRecording();
                      } catch (err) {
                        console.error('Mic start error:', err);
                      }
                    }}
                    style={{
                      background: 'var(--spotlight)',
                      color: '#000',
                      boxShadow: '0 4px 15px rgba(242, 184, 75, 0.2)',
                    }}
                  >
                    🎙️ Start Speaking
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => {
                      stopRecording();
                    }}
                  >
                    ⏹️ Stop & Send Response
                  </Button>
                )}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--paper-dimmer)', margin: 0, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                Your voice is processed in real-time. Speak clearly and click Stop when you finish your response.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT RAIL */}
        <div style={{
          width: '220px',
          flexShrink: 0,
          background: 'var(--panel-bg)',
          borderLeft: '1px solid var(--card-border)',
          padding: '24px 20px',
        }} className="room-right-rail">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '20px', fontWeight: 700 }}>Scoring Metrics</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {ROUNDS_META.map(r => {
              const score = session?.roundScores?.[r.key];
              if (score === undefined) return null;
              const pct = Math.round(score);
              const scoreColor = pct >= 75 ? 'var(--prompter-green)' : pct >= 50 ? 'var(--spotlight)' : 'var(--rec-red)';
              return (
                <div key={r.key} style={{ animation: 'fadeIn 0.35s var(--ease) both' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontWeight: 600 }}>{r.short}</span>
                    <span className="mono-data" style={{ fontSize: '16px', fontWeight: 800, color: scoreColor }}>{pct}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: scoreColor, borderRadius: 'var(--radius-full)', boxShadow: `0 0 6px ${scoreColor}` }} />
                  </div>
                </div>
              );
            })}

            {!session?.roundScores && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', textAlign: 'center', marginTop: '16px', lineHeight: 1.5 }}>
                Rounds indicators<br/>will display here<br/>upon completion.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 3: CONTROL BAR ── */}
      <div style={{
        height: '72px',
        background: 'var(--panel-bg)',
        borderTop: '1px solid var(--card-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', left: '24px' }} className="control-left-status">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', fontWeight: 500 }}>
            SESSION STATUS
          </span>
        </div>

        {activeRound && roundStarted && (
          <Button variant="danger" size="sm" onClick={handleEndRound}>End Current Round</Button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dim)', fontWeight: 600 }}>INPUT MODE:</span>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '20px', padding: '3px', border: '1px solid var(--card-border)' }}>
            <button
              onClick={() => {
                setVoiceMode(false);
                stopRecording();
              }}
              style={{
                border: 'none',
                background: !voiceMode ? 'var(--spotlight)' : 'transparent',
                color: !voiceMode ? '#000000' : 'var(--paper-dim)',
                fontWeight: !voiceMode ? 700 : 500,
                fontSize: '11px',
                padding: '4px 12px',
                borderRadius: '16px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.2s ease',
              }}
            >
              KEYBOARD
            </button>
            <button
              onClick={async () => {
                setVoiceMode(true);
                if (roundStarted && !roundCompleteInfo) {
                  try {
                    await unlockAudioContext();
                    audioUnlockedRef.current = true;
                    startRecording();
                  } catch (e) {
                    console.error('Failed to start voice mode:', e);
                  }
                }
              }}
              style={{
                border: 'none',
                background: voiceMode ? 'var(--spotlight)' : 'transparent',
                color: voiceMode ? '#000000' : 'var(--paper-dim)',
                fontWeight: voiceMode ? 700 : 500,
                fontSize: '11px',
                padding: '4px 12px',
                borderRadius: '16px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.2s ease',
              }}
            >
              VOICE
            </button>
          </div>
        </div>

        <div style={{ position: 'absolute', right: '24px' }}>
          {session?.currentRound === 'complete' && (
            <Button variant="primary" size="sm" onClick={handleInterviewComplete}>
              View final evaluation report →
            </Button>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 0.1; }
          100% { transform: scale(1.2); opacity: 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 992px) {
          .room-left-rail, .room-right-rail { display: none !important; }
          .control-left-status { display: none !important; }
        }
      `}</style>
    </div>
  );
}
