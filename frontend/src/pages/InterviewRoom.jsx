/* Interview room — voice/text conversation with the AI interviewer over the v2 WebSocket protocol. */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Mic, MicOff, Send, PhoneOff, Bot, Volume2, Keyboard, Radio, Loader2, CheckCircle2, AlertTriangle, ChevronRight, Sparkles, Flag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket, STATES } from '../hooks/useWebSocket';
import { getInterview } from '../api/endpoints';
import {
  Button, Badge, Modal, Spinner, ErrorState, Tooltip, Alert, toneForDifficulty, toneForScore, sourceLabel, sourceTone, roundLabel, fmtScore,
} from '../components/ui';
import { Logo } from '../components/layout/AppShell';

/* ── State presentation ─────────────────────────────────────────────────── */
const STATE_META = {
  [STATES.INITIALIZING]: { label: 'Initializing', tone: 'neutral', icon: Loader2, spin: true, hint: 'Connecting to the interview engine…' },
  [STATES.GENERATING]: { label: 'Generating question', tone: 'primary', icon: Sparkles, spin: false, hint: 'The interviewer is preparing the next question.' },
  [STATES.SPEAKING]: { label: 'Interviewer speaking', tone: 'primary', icon: Volume2, spin: false, hint: 'Listen to the question. Your turn comes next.' },
  [STATES.LISTENING]: { label: 'Listening', tone: 'success', icon: Mic, spin: false, hint: 'Speak your answer or type it below.' },
  [STATES.PROCESSING]: { label: 'Processing answer', tone: 'accent', icon: Loader2, spin: true, hint: 'Transcribing and evaluating your answer.' },
  [STATES.WAITING]: { label: 'Waiting', tone: 'warning', icon: Radio, spin: false, hint: 'Round finished. Start the next round when ready.' },
  [STATES.COMPLETED]: { label: 'Completed', tone: 'success', icon: CheckCircle2, spin: false, hint: 'The interview is complete.' },
  [STATES.ERROR]: { label: 'Error', tone: 'error', icon: AlertTriangle, spin: false, hint: 'Something went wrong. You can still type your answer.' },
};

function useTimer(active) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* Waveform driven by real microphone volume (listening) or a gentle wave (speaking). */
function Waveform({ state, volume, bars = 44 }) {
  const refs = useRef([]);
  const raf = useRef(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame += 1;
      refs.current.forEach((el, i) => {
        if (!el) return;
        let h = 3;
        let color = '#27272A';
        const w = Math.sin((i / bars) * Math.PI * 2 + frame / 14) * Math.sin((i / bars) * Math.PI + frame / 22);
        if (state === STATES.LISTENING) { h = 4 + Math.abs(w) * 52 * Math.min(1, volume * 2 + 0.08); color = '#22C55E'; }
        else if (state === STATES.SPEAKING) { h = 8 + (w * 0.5 + 0.5) * 40; color = '#8B5CF6'; }
        else if (state === STATES.PROCESSING || state === STATES.GENERATING) { h = 4 + (Math.sin(frame / 10 + i / 2) * 0.5 + 0.5) * 8; color = '#22D3EE'; }
        el.style.height = `${Math.max(3, Math.min(56, h))}px`;
        el.style.backgroundColor = color;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [state, volume, bars]);
  return (
    <div className="flex items-center justify-center gap-[4px] h-16" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => <span key={i} ref={(el) => { refs.current[i] = el; }} className="wave-bar" />)}
    </div>
  );
}

function RubricMini({ evaluation }) {
  if (!evaluation) return null;
  const items = [
    ['Technical', evaluation.technical_correctness], ['Conceptual', evaluation.conceptual_understanding],
    ['Complete', evaluation.answer_completeness], ['Clarity', evaluation.communication_clarity],
  ];
  return (
    <div className="mt-2 grid grid-cols-4 gap-2">
      {items.map(([l, v]) => (
        <div key={l} className="rounded-md bg-elevated px-2 py-1.5">
          <div className="t-meta">{l}</div>
          <div className="text-sm font-semibold tabular-nums">{fmtScore(v)}</div>
        </div>
      ))}
    </div>
  );
}

export default function InterviewRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [transcript, setTranscript] = useState([]);           // [{id, speaker, text, meta?, evaluation?}]
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentMeta, setCurrentMeta] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [muted, setMuted] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [wsError, setWsError] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState(null);
  const roundStartedRef = useRef(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  /* ── Load session metadata ─────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    getInterview(sessionId)
      .then((s) => {
        if (!alive) return;
        if (s.status === 'completed') { navigate(`/results/${sessionId}`, { replace: true }); return; }
        if (s.current_round === 'dsa' && s.status === 'active') { navigate(`/interview/${sessionId}/dsa`, { replace: true }); return; }
        setSession(s);
        setVoiceMode((s.config?.mode === 'voice') && !!s.voice_enabled);
      })
      .catch((e) => alive && setLoadError(e.message || 'Could not load the interview session.'));
    return () => { alive = false; };
  }, [sessionId, navigate]);

  const pushTranscript = useCallback((entry) => setTranscript((t) => [...t, { id: `${Date.now()}-${Math.random()}`, ...entry }]), []);

  const ws = useWebSocket({
    sessionId,
    enabled: isAuthenticated && !authLoading && !!session,
    voiceMode,
    muted,
    onAITranscript: ({ text, turnId, meta }) => {
      setCurrentQuestion(text);
      setCurrentMeta(meta);
      pushTranscript({ speaker: 'interviewer', text, turnId, meta });
    },
    onCandidateTranscript: ({ text, turnId, sttLatencyMs }) => {
      setTranscript((t) => {
        // Avoid duplicating a typed answer we already appended locally
        const last = t[t.length - 1];
        if (last && last.speaker === 'candidate' && last.text === text && last.pending) return t.map((e, i) => (i === t.length - 1 ? { ...e, pending: false } : e));
        return [...t, { id: `${Date.now()}-c`, speaker: 'candidate', text, turnId, sttLatencyMs }];
      });
    },
    onEvaluation: (msg) => {
      setLastEvaluation(msg.evaluation);
      setTranscript((t) => {
        const idx = [...t].reverse().findIndex((e) => e.speaker === 'candidate');
        if (idx === -1) return t;
        const real = t.length - 1 - idx;
        return t.map((e, i) => (i === real ? { ...e, evaluation: msg.evaluation } : e));
      });
    },
    onHistory: (msg) => {
      if (msg.history?.length) {
        setTranscript(msg.history.map((h, i) => ({ id: `h-${i}`, speaker: h.speaker, text: h.text })));
        if (msg.current_question) { setCurrentQuestion(msg.current_question); roundStartedRef.current = true; }
      }
    },
    onRoundComplete: (msg) => setRoundResult(msg),
    onInterviewComplete: (msg) => {
      if (msg.cancelled) { navigate('/history'); return; }
      setTimeout(() => navigate(`/results/${sessionId}`), 600);
    },
    onRedirect: (where) => { if (where === 'dsa') navigate(`/interview/${sessionId}/dsa`); },
    onError: (message, code) => { if (code !== 'dsa_round') setWsError(message); },
  });

  /* ── Auto-open the round once connected ─────────────────────────────── */
  useEffect(() => {
    if (ws.isConnected && !roundStartedRef.current && session) {
      roundStartedRef.current = true;
      const t = setTimeout(() => ws.startRound(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ws.isConnected, session, ws]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [transcript.length, lastEvaluation]);
  useEffect(() => { if (ws.turnState === STATES.LISTENING && !voiceMode) inputRef.current?.focus(); }, [ws.turnState, voiceMode]);
  useEffect(() => () => ws.destroyAll?.(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = useTimer(!!session && ws.turnState !== STATES.COMPLETED);
  const progress = ws.progress || session?.progress;
  const round = progress?.round || session?.current_round;
  const meta = STATE_META[ws.turnState] || STATE_META.initializing;
  const StateIcon = meta.icon;
  const canAnswer = ws.turnState === STATES.LISTENING;

  const submitText = () => {
    const text = textInput.trim();
    if (!text || !canAnswer) return;
    pushTranscript({ speaker: 'candidate', text, pending: true });
    ws.sendText(text);
    setTextInput('');
  };

  const toggleVoice = async () => {
    if (!ws.voiceEnabled) return;
    await ws.unlockAudio();
    setVoiceMode((v) => {
      const next = !v;
      if (!next) ws.stopRecording(); else if (canAnswer) ws.startRecording();
      return next;
    });
  };

  const handleMic = async () => {
    await ws.unlockAudio();
    if (!voiceMode) { setVoiceMode(true); if (canAnswer) ws.startRecording(); return; }
    setMuted((m) => !m);
  };

  const nextRound = roundResult?.next_round;
  const startNextRound = () => {
    setRoundResult(null);
    setTranscript([]);
    setCurrentQuestion('');
    setCurrentMeta(null);
    setLastEvaluation(null);
    if (nextRound === 'dsa') { navigate(`/interview/${sessionId}/dsa`); return; }
    if (!nextRound || nextRound === 'complete') { navigate(`/results/${sessionId}`); return; }
    ws.startRound();
  };

  const questionNumber = useMemo(() => {
    if (currentMeta?.index != null) return currentMeta.index + 1;
    return progress?.questions_asked || 0;
  }, [currentMeta, progress]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-bg p-6 grid place-items-center">
        <ErrorState title="Interview unavailable" description={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (!session) {
    return <div className="min-h-screen bg-bg grid place-items-center text-muted text-sm"><Spinner className="mr-2" /> Loading interview…</div>;
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-surface/80 backdrop-blur flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-4 min-w-0">
          <Logo compact />
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <span className="text-muted">{session.target_role}</span>
            <ChevronRight size={14} className="text-dim" />
            <span className="font-medium">{roundLabel(round)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {progress?.questions_per_round && (
            <Tooltip content="Question counter for this round">
              <Badge tone="neutral">Q {Math.min(questionNumber || 1, progress.questions_per_round)} / {progress.questions_per_round}</Badge>
            </Tooltip>
          )}
          {progress?.difficulty && <Badge tone={toneForDifficulty(progress.difficulty)}>{progress.difficulty}{progress.adaptive ? ' · adaptive' : ''}</Badge>}
          <span className="font-mono text-sm text-muted tabular-nums hidden sm:inline">{elapsed}</span>
          <Button variant="secondary" size="sm" icon={Flag} onClick={() => setConfirmEnd(true)} disabled={!round || round === 'complete'}>End round</Button>
          <Tooltip content="Cancel the whole interview" side="bottom">
            <Button variant="ghost" size="sm" className="text-error" icon={PhoneOff} onClick={() => setConfirmCancel(true)} aria-label="Cancel interview" />
          </Tooltip>
        </div>
      </header>

      {/* Round progress */}
      {progress?.rounds && (
        <div className="border-b border-border bg-surface px-4 lg:px-6 py-2 flex items-center gap-2 overflow-x-auto">
          {progress.rounds.map((r, i) => {
            const done = i < progress.round_index;
            const active = i === progress.round_index;
            return (
              <div key={r} className="flex items-center gap-2">
                <span className={clsx('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border', active ? 'border-primary/40 bg-primary-soft text-primary' : done ? 'border-success/30 bg-success-soft text-success' : 'border-border text-dim')}>
                  {done ? <CheckCircle2 size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}{roundLabel(r)}
                </span>
                {i < progress.rounds.length - 1 && <span className="h-px w-6 bg-border" />}
              </div>
            );
          })}
        </div>
      )}

      {wsError && <div className="px-4 lg:px-6 pt-4"><Alert tone="error" title="Connection problem">{wsError}</Alert></div>}
      {ws.status === 'reconnecting' && <div className="px-4 lg:px-6 pt-4"><Alert tone="warning">Reconnecting to the interview…</Alert></div>}

      {/* Workspace */}
      <div className="flex-1 grid lg:grid-cols-[1fr_380px] gap-0 min-h-0">
        {/* Stage */}
        <section className="relative flex flex-col p-4 lg:p-8 min-h-0 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_360px_at_50%_0%,rgba(139,92,246,0.14),transparent_70%)]" />
          <div className="relative flex-1 flex flex-col items-center justify-center text-center max-w-3xl mx-auto w-full">
            {/* Interviewer identity */}
            <div className={clsx('relative h-24 w-24 rounded-full grid place-items-center transition-shadow bg-gradient-to-br from-primary via-secondary to-accent text-white', ws.turnState === STATES.SPEAKING ? 'shadow-[0_0_0_6px_rgba(139,92,246,0.18),0_0_60px_rgba(139,92,246,0.45)]' : 'shadow-[0_0_40px_rgba(139,92,246,0.25)]')}>
              <Bot size={38} />
              {ws.turnState === STATES.SPEAKING && <span className="absolute -inset-2 rounded-full border-2 border-primary/40 animate-pulse2" />}
            </div>
            <div className="mt-3 text-sm font-medium">{session.persona?.name || 'AI Interviewer'}</div>
            <div className="t-meta">{session.persona?.description}</div>

            {/* State chip */}
            <div className="mt-6 inline-flex items-center gap-2">
              <Badge tone={meta.tone} dot={!meta.spin}>
                <StateIcon size={12} className={meta.spin ? 'animate-spin' : ''} /> {meta.label}
              </Badge>
              <span className="t-meta hidden sm:inline">{ws.stateMessage || meta.hint}</span>
            </div>

            {/* Question */}
            <div className="mt-6 w-full card card-pad text-left border-l-2 border-l-primary">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="t-label">Current question</span>
                {currentMeta && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {currentMeta.category && <Badge tone="neutral">{String(currentMeta.category).replace(/_/g, ' ')}</Badge>}
                    {currentMeta.difficulty && <Badge tone={toneForDifficulty(currentMeta.difficulty)}>{currentMeta.difficulty}</Badge>}
                    {currentMeta.is_follow_up && <Badge tone="accent">follow-up</Badge>}
                    {currentMeta.generation_source === 'bank' && <Tooltip content="AI model unavailable — question from the curated bank"><Badge tone="warning">bank</Badge></Tooltip>}
                  </div>
                )}
              </div>
              <p className={clsx('text-[19px] leading-relaxed tracking-[-0.01em]', !currentQuestion && 'text-dim')}>
                {currentQuestion || (ws.turnState === STATES.GENERATING ? 'Preparing your first question…' : 'Waiting for the interviewer…')}
              </p>
              {currentMeta?.retrieval_sources?.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <span className="t-meta">Grounded in your resume:</span>
                  {currentMeta.retrieval_sources.map((s) => (
                    <Tooltip key={s.chunk_id} content={s.preview}><Badge tone="primary">{s.section}#{s.chunk_index}</Badge></Tooltip>
                  ))}
                </div>
              )}
            </div>

            {/* Waveform + mic */}
            <div className="mt-6 w-full">
              <Waveform state={ws.turnState} volume={ws.volume} />
              <div className="mt-2 flex items-center justify-center gap-3">
                {ws.voiceEnabled ? (
                  <>
                    <Tooltip content={voiceMode ? (muted ? 'Unmute microphone' : 'Mute microphone') : 'Enable voice mode'}>
                      <button onClick={handleMic} className={clsx('h-12 w-12 rounded-full grid place-items-center border transition-colors', voiceMode && !muted && canAnswer ? 'bg-success text-black border-success' : 'bg-elevated border-border text-muted hover:text-fg')} aria-label="Microphone">
                        {voiceMode && !muted ? <Mic size={20} /> : <MicOff size={20} />}
                      </button>
                    </Tooltip>
                    <Button variant="ghost" size="sm" icon={voiceMode ? Keyboard : Volume2} onClick={toggleVoice}>{voiceMode ? 'Switch to text' : 'Switch to voice'}</Button>
                    {voiceMode && ws.hasPermission === false && <Badge tone="error">Microphone permission denied</Badge>}
                    {voiceMode && ws.isRecording && <Badge tone="success" dot>{ws.isSpeaking ? 'Hearing you…' : 'Mic live'}</Badge>}
                  </>
                ) : (
                  <Tooltip content="Voice services are not configured on the server (Deepgram/ElevenLabs keys). Text mode is active.">
                    <Badge tone="neutral"><Keyboard size={12} /> Text mode</Badge>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          {/* Text input */}
          <form className="relative mt-4 max-w-3xl mx-auto w-full flex gap-2 card p-2 pl-3" onSubmit={(e) => { e.preventDefault(); submitText(); }}>
            <textarea
              ref={inputRef}
              className="input flex-1 resize-none min-h-[44px] max-h-40 border-0 bg-transparent focus:shadow-none px-1"
              rows={1}
              placeholder={canAnswer ? 'Type your answer (Enter to send, Shift+Enter for a new line)…' : `${meta.label}…`}
              value={textInput}
              disabled={!canAnswer}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }}
            />
            <Button type="submit" icon={Send} disabled={!canAnswer || !textInput.trim()}>Send</Button>
          </form>
        </section>

        {/* Transcript */}
        <aside className="border-t lg:border-t-0 lg:border-l border-border bg-surface flex flex-col min-h-[320px] lg:min-h-0">
          <div className="h-12 px-4 border-b border-border flex items-center justify-between">
            <span className="h-card">Live transcript</span>
            <span className="t-meta">{transcript.filter((t) => t.speaker === 'candidate').length} answers</span>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh] lg:max-h-none">
            {transcript.length === 0 && <p className="t-meta">The conversation will appear here.</p>}
            {transcript.map((e) => (
              <div key={e.id} className={clsx('rounded-lg border px-3.5 py-2.5 text-sm', e.speaker === 'interviewer' ? 'border-border bg-elevated' : 'border-primary/20 bg-primary-soft/40')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="t-label">{e.speaker === 'interviewer' ? 'Interviewer' : 'You'}</span>
                  {e.evaluation && (
                    <span className="flex items-center gap-1.5">
                      <Badge tone={sourceTone(e.evaluation.evaluation_source)}>{sourceLabel(e.evaluation.evaluation_source)}</Badge>
                      <Badge tone={toneForScore(e.evaluation.overall_score * 10)}>{fmtScore(e.evaluation.overall_score)}/10</Badge>
                    </span>
                  )}
                  {e.pending && <Spinner size={12} />}
                </div>
                <p className="text-fg/90 leading-relaxed">{e.text}</p>
                {e.evaluation && (
                  <>
                    <RubricMini evaluation={e.evaluation} />
                    {e.evaluation.feedback && <p className="t-meta mt-2">{e.evaluation.feedback}</p>}
                    {e.evaluation.next_difficulty && e.evaluation.next_difficulty !== e.evaluation.difficulty && (
                      <p className="mt-1 text-xs text-accent">Difficulty → {e.evaluation.next_difficulty} ({e.evaluation.policy})</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Round complete */}
      <Modal open={!!roundResult} onClose={() => {}} title={`${roundLabel(roundResult?.round)} round complete`} description={roundResult?.feedback}
        footer={<Button onClick={startNextRound} iconRight={ChevronRight}>{nextRound && nextRound !== 'complete' ? `Start ${roundLabel(nextRound)} round` : 'View results'}</Button>}>
        {roundResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge tone={toneForScore(roundResult.score)} className="text-sm px-3 py-1">Score {roundResult.score == null ? '—' : `${fmtScore(roundResult.score)}%`}</Badge>
              {roundResult.evaluation?.evaluation_source && <Badge tone={sourceTone(roundResult.evaluation.evaluation_source)}>{sourceLabel(roundResult.evaluation.evaluation_source)}</Badge>}
              <span className="t-meta">{roundResult.evaluation?.questions_answered ?? 0} answers evaluated</span>
            </div>
            {roundResult.evaluation?.rubric_averages && <RubricMini evaluation={roundResult.evaluation.rubric_averages} />}
            {roundResult.evaluation?.evaluation_source && roundResult.evaluation.evaluation_source !== 'llm' && (
              <Alert tone="warning">Some scores in this round are heuristic estimates because the AI evaluator was unavailable. They do not certify technical correctness.</Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End this round now?" description="Unanswered questions will not be scored. The round will be evaluated from the answers you have given so far."
        footer={<><Button variant="secondary" onClick={() => setConfirmEnd(false)}>Keep going</Button><Button onClick={() => { setConfirmEnd(false); ws.endRound(); }}>End round</Button></>} />
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel the interview?" description="The session will be marked as cancelled. Completed rounds stay in your history."
        footer={<><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Back</Button><Button variant="danger" onClick={() => { setConfirmCancel(false); ws.cancelInterview(); }}>Cancel interview</Button></>} />
    </div>
  );
}
