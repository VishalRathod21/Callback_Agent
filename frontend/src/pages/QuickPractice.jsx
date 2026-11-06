/* Quick practice — short topic drills with instant AI feedback (POST /api/practice/*). */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Binary, Network, Users, Brain, Shuffle, Send, ArrowRight, RotateCcw, Save, Lightbulb, ThumbsUp, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { getMyCandidates, startPractice, answerPractice, savePractice } from '../api/endpoints';
import {
  Button, Card, Badge, Textarea, Toggle, SegmentedControl, Progress, ScoreRing, Skeleton, ErrorState, Alert, PageHeader, useToast, titleCase,
} from '../components/ui';

const TOPICS = [
  { id: 'dsa_theory', label: 'DSA theory', icon: Binary, blurb: 'Complexity, data structures and algorithm trade-offs — explained, not coded.' },
  { id: 'system_design', label: 'System design', icon: Network, blurb: 'Scalability, caching, consistency and architecture reasoning.' },
  { id: 'behavioral', label: 'Behavioral', icon: Users, blurb: 'STAR-style stories about teamwork, conflict and ownership.' },
  { id: 'machine_learning', label: 'Machine learning', icon: Brain, blurb: 'Models, evaluation metrics, overfitting and deployment.' },
  { id: 'random', label: 'Random mix', icon: Shuffle, blurb: 'A shuffle across every topic to keep you on your toes.' },
];
const COUNTS = [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 6, label: '6' }];
const VERDICT = {
  strong: { tone: 'success', label: 'Strong', icon: CheckCircle2 },
  decent: { tone: 'warning', label: 'Decent', icon: ThumbsUp },
  needs_work: { tone: 'error', label: 'Needs work', icon: AlertCircle },
};
const TONE_TEXT = { success: 'text-success', warning: 'text-warning', error: 'text-error', neutral: 'text-muted' };
const scoreTone = (s) => (s == null ? 'neutral' : s >= 7 ? 'success' : s >= 4 ? 'warning' : 'error');
const MIN_ANSWER = 5;
const fetchLatest = () => getMyCandidates().then((d) => d.latest || null);

/* Fetch helper: state is only set from promise callbacks; retry bumps an attempt counter. */
function useRequest(fn) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e.message || 'Request failed' }));
    return () => { alive = false; };
  }, [fn, attempt]);
  const reload = useCallback(() => { setState((s) => ({ ...s, loading: true, error: null })); setAttempt((a) => a + 1); }, []);
  return { ...state, reload };
}

/* ── Setup ──────────────────────────────────────────────────────────────── */
function TopicPicker({ value, onChange }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {TOPICS.map(({ id, label, icon: Icon, blurb }) => {
        const on = value === id;
        return (
          <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={on}
            className={`card card-pad text-left transition-colors hover:border-border-strong ${on ? 'border-primary shadow-glow' : ''}`}>
            <div className={`h-9 w-9 rounded-md grid place-items-center ${on ? 'bg-primary text-white' : 'bg-elevated text-muted'}`}><Icon size={18} /></div>
            <div className="mt-3 font-semibold text-sm">{label}</div>
            <p className="t-meta mt-1">{blurb}</p>
          </button>
        );
      })}
    </div>
  );
}

function SetupView({ latest, latestLoading, onStart, starting, startError }) {
  const [topic, setTopic] = useState('dsa_theory');
  const [count, setCount] = useState(5);
  const [useResume, setUseResume] = useState(true);
  const role = latest?.target_role || 'Software Engineer';

  return (
    <div className="space-y-6">
      <section>
        <h2 className="h-section mb-3">1. Choose a topic</h2>
        <TopicPicker value={topic} onChange={setTopic} />
      </section>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="2. Session length" className="lg:col-span-1">
          <SegmentedControl value={count} onChange={setCount} options={COUNTS} />
          <p className="help">{count} questions · roughly {count * 2} minutes</p>
        </Card>
        <Card title="3. Context" className="lg:col-span-2">
          {latestLoading ? <Skeleton lines={2} /> : latest ? (
            <Toggle
              checked={useResume} onChange={setUseResume}
              label={`Tailor questions to ${latest.name}'s resume`}
              description={`Targets the ${role} role and references your listed skills and projects (not used for DSA theory).`}
            />
          ) : (
            <div className="flex items-start gap-3 text-sm text-muted">
              <FileText size={16} className="mt-0.5 shrink-0 text-dim" />
              <span>No resume on file — questions will target a generic <span className="text-fg">{role}</span> role. Upload one to get resume-aware questions.</span>
            </div>
          )}
        </Card>
      </div>
      {startError && <Alert tone="error" title="Could not start practice">{startError}</Alert>}
      <div className="flex justify-end">
        <Button size="lg" icon={Zap} loading={starting} onClick={() => onStart({ topic, question_count: count, target_role: role, candidate_id: latest && useResume ? latest.id : undefined })}>
          Start practice
        </Button>
      </div>
    </div>
  );
}

/* ── Question / evaluation ──────────────────────────────────────────────── */
function EvaluationCard({ evaluation }) {
  const v = VERDICT[evaluation.verdict] || { tone: 'neutral', label: titleCase(evaluation.verdict || 'Evaluated'), icon: ThumbsUp };
  const VIcon = v.icon;
  return (
    <Card elevated className="animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><VIcon size={18} className={TONE_TEXT[v.tone]} /><span className="h-card">Feedback</span></div>
        <div className="flex items-center gap-2">
          <Badge tone={v.tone}>{v.label}</Badge>
          <Badge tone={scoreTone(evaluation.score)}>{evaluation.score ?? '—'} / 10</Badge>
        </div>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex gap-3"><ThumbsUp size={16} className="mt-0.5 text-success shrink-0" /><div><dt className="t-label">What worked</dt><dd className="text-muted mt-0.5">{evaluation.strength || '—'}</dd></div></div>
        <div className="flex gap-3"><AlertCircle size={16} className="mt-0.5 text-warning shrink-0" /><div><dt className="t-label">Gap</dt><dd className="text-muted mt-0.5">{evaluation.gap || '—'}</dd></div></div>
        <div className="flex gap-3"><Lightbulb size={16} className="mt-0.5 text-accent shrink-0" /><div><dt className="t-label">Tip for next time</dt><dd className="text-muted mt-0.5">{evaluation.tip || '—'}</dd></div></div>
      </dl>
    </Card>
  );
}

function QuestionView({ session, onFinished, onAbandon }) {
  const [question, setQuestion] = useState(session.first_question);
  const [answered, setAnswered] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { evaluation, next_question, session_complete, summary }
  const [error, setError] = useState(null);
  const total = session.total_questions;
  const topicMeta = TOPICS.find((t) => t.id === session.topic);

  const submit = async (e) => {
    e?.preventDefault();
    const trimmed = answer.trim();
    if (trimmed.length < MIN_ANSWER) { setError(`Your answer is too short — write at least ${MIN_ANSWER} characters.`); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await answerPractice({ session_id: session.session_id, question_id: question.id, answer: trimmed });
      setResult(res);
      setAnswered((n) => n + 1);
    } catch (err) {
      if (err.status === 400 && /too short/i.test(err.message || '')) setError('The server rejected this answer as too short. Add a few more sentences and try again.');
      else if (err.status === 404) setError('This practice session has expired (the server was restarted). Start a new one.');
      else setError(err.message || 'Could not evaluate your answer.');
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (result.session_complete || !result.next_question) { onFinished(result.summary); return; }
    setQuestion(result.next_question);
    setAnswer(''); setResult(null); setError(null);
  };

  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !result) submit(); };

  return (
    <div className="space-y-4 animate-fade-up">
      <Card>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge tone="primary">{topicMeta?.label || titleCase(session.topic)}</Badge>
            {question.topic && question.topic !== session.topic && <Badge tone="neutral">{titleCase(question.topic)}</Badge>}
          </div>
          <span className="t-meta tabular-nums shrink-0">Question {Math.min(answered + 1, total)} of {total}</span>
        </div>
        <Progress value={answered} max={total} tone="primary" />
        <h2 className="text-lg md:text-xl font-semibold leading-snug mt-5">{question.question}</h2>
      </Card>

      {!result ? (
        <form onSubmit={submit} className="card card-pad space-y-3">
          <Textarea
            label="Your answer" name="answer" rows={7} value={answer} onChange={(e) => { setAnswer(e.target.value); if (error) setError(null); }} onKeyDown={onKey}
            placeholder="Explain your reasoning as you would out loud in an interview…" error={error}
            help={!error ? `${answer.trim().length} characters · Ctrl/Cmd + Enter to submit` : undefined} disabled={submitting} autoFocus
          />
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={onAbandon} disabled={submitting}>Quit practice</Button>
            <Button type="submit" icon={Send} loading={submitting} disabled={answer.trim().length < MIN_ANSWER}>{submitting ? 'Evaluating…' : 'Submit answer'}</Button>
          </div>
        </form>
      ) : (
        <>
          <Card title="Your answer" className="bg-elevated/40"><p className="text-sm text-muted whitespace-pre-wrap">{answer}</p></Card>
          <EvaluationCard evaluation={result.evaluation} />
          <div className="flex justify-end">
            <Button icon={result.session_complete ? CheckCircle2 : undefined} iconRight={result.session_complete ? undefined : ArrowRight} onClick={next}>
              {result.session_complete ? 'See summary' : 'Next question'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Summary ────────────────────────────────────────────────────────────── */
function SummaryView({ session, summary, latest, onAgain }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const topicMeta = TOPICS.find((t) => t.id === session.topic);
  const avg = summary?.average_score;

  const save = async () => {
    setSaving(true);
    try {
      const res = await savePractice({ candidate_id: latest.id, session_id: session.session_id, topic: session.topic, average_score: avg ?? 0 });
      setSaved(res);
      toast.success('Practice session saved to your history.');
    } catch (err) {
      toast.error(err.message || 'Could not save this session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <Card>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreRing value={avg == null ? null : avg * 10} size={128} suffix="" label="avg / 10" tone={scoreTone(avg)} />
          <div className="flex-1 text-center sm:text-left">
            <Badge tone="primary">{topicMeta?.label || titleCase(session.topic)}</Badge>
            <h2 className="h-section mt-2">Practice complete</h2>
            <p className="t-body mt-1">
              You answered {summary?.total_questions ?? session.total_questions} question{(summary?.total_questions ?? session.total_questions) === 1 ? '' : 's'} with an average score of <span className="text-fg font-medium">{avg ?? '—'} / 10</span>.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[['strong', 'Strong', 'success'], ['decent', 'Decent', 'warning'], ['needs_work', 'Needs work', 'error']].map(([k, label, tone]) => (
                <div key={k} className="card-elevated px-3 py-2 text-center">
                  <div className={`text-xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{summary?.[k] ?? 0}</div>
                  <div className="t-meta">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Save to history" subtitle={latest ? `Stored as a completed session on ${latest.name}'s profile (score ×10 on the 100-point scale).` : 'Saving requires a resume profile.'}>
        {saved ? (
          <Alert tone="success" title="Saved">This session now appears in your history and dashboard trends.</Alert>
        ) : !latest ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="t-body">Upload a resume to keep practice results on your record.</p>
            <Button variant="secondary" icon={FileText} onClick={() => navigate('/resume')}>Upload resume</Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button icon={Save} loading={saving} onClick={save}>Save to history</Button>
          </div>
        )}
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        {saved && <Button variant="secondary" onClick={() => navigate('/history')}>View history</Button>}
        <Button variant={saved ? 'primary' : 'secondary'} icon={RotateCcw} onClick={onAgain}>Practice again</Button>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function QuickPractice() {
  const { data: latest, loading: latestLoading, error: latestError, reload: loadLatest } = useRequest(fetchLatest);
  const [phase, setPhase] = useState('setup'); // setup | question | summary
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  const start = async (body) => {
    setStarting(true); setStartError(null);
    try {
      const res = await startPractice(body);
      if (!res.first_question) throw new Error('No questions were returned for this topic.');
      setSession(res);
      setPhase('question');
    } catch (err) {
      setStartError(err.message || 'Could not start a practice session.');
    } finally {
      setStarting(false);
    }
  };

  const reset = () => { setSession(null); setSummary(null); setPhase('setup'); };

  return (
    <AppShell title="Quick practice">
      <PageHeader
        eyebrow="Low-stakes drills"
        title="Quick practice"
        description="Short topic drills with instant feedback on every answer. No scheduling, no rounds — just reps."
        actions={phase !== 'setup' ? <Badge tone="accent" dot>Session {session?.session_id}</Badge> : undefined}
      />
      {latestError && phase === 'setup' ? (
        <ErrorState title="Could not load your profile" description={`${latestError}. You can still practise without resume context.`} onRetry={loadLatest} className="mb-4 py-6" />
      ) : null}
      {phase === 'setup' && <SetupView latest={latest} latestLoading={latestLoading && !latestError} onStart={start} starting={starting} startError={startError} />}
      {phase === 'question' && session && <QuestionView key={session.session_id} session={session} onFinished={(s) => { setSummary(s); setPhase('summary'); }} onAbandon={reset} />}
      {phase === 'summary' && session && <SummaryView session={session} summary={summary} latest={latest} onAgain={reset} />}
    </AppShell>
  );
}
