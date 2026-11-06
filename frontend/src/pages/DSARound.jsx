/* DSA coding round — Monaco editor workspace driven by the REST DSA endpoints. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import clsx from 'clsx';
import { Lightbulb, Play, ChevronRight, Code2, CheckCircle2, XCircle, Clock, AlertTriangle, ListChecks, Flag } from 'lucide-react';
import { getInterview, getDsaProblem, getDsaHint, submitDsa } from '../api/endpoints';
import {
  Button, Badge, Card, Select, Tabs, Modal, Spinner, ErrorState, Alert, Tooltip, Textarea, Progress,
  toneForDifficulty, toneForScore, sourceLabel, sourceTone, fmtScore, roundLabel,
} from '../components/ui';
import { Logo } from '../components/layout/AppShell';

const LANGUAGES = [
  { value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' }, { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' }, { value: 'cpp', label: 'C++' }, { value: 'go', label: 'Go' }, { value: 'rust', label: 'Rust' },
];
const MONACO_LANG = { cpp: 'cpp', python: 'python', javascript: 'javascript', typescript: 'typescript', java: 'java', go: 'go', rust: 'rust', c: 'c' };

function useTimer() {
  const [sec, setSec] = useState(0);
  useEffect(() => { const id = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(id); }, []);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function EvaluationPanel({ evaluation }) {
  if (!evaluation) return null;
  const unscored = evaluation.overall_score == null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={sourceTone(evaluation.evaluation_source)}>{sourceLabel(evaluation.evaluation_source)}</Badge>
        {!unscored && <Badge tone={toneForScore(evaluation.overall_score)}>Score {evaluation.overall_score}/100</Badge>}
        {evaluation.correct === true && <Badge tone="success"><CheckCircle2 size={12} /> Correct</Badge>}
        {evaluation.correct === false && <Badge tone="error"><XCircle size={12} /> Incorrect</Badge>}
        {evaluation.hints_used > 0 && <Badge tone="neutral">{evaluation.hints_used} hint{evaluation.hints_used > 1 ? 's' : ''} used</Badge>}
      </div>
      {unscored ? (
        <Alert tone="warning" title="Not evaluated">{evaluation.feedback}</Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Approach', evaluation.approach_score], ['Correctness', evaluation.correctness_score], ['Complexity', evaluation.complexity_score ?? evaluation.approach_score], ['Explanation', evaluation.communication_score]].map(([l, v]) => (
              <div key={l} className="rounded-md bg-elevated px-3 py-2"><div className="t-meta">{l}</div><div className="font-semibold tabular-nums">{v == null ? '—' : `${fmtScore(v, 0)}/10`}</div></div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-elevated px-3 py-2"><span className="t-meta">Time complexity</span><div className="font-mono">{evaluation.time_complexity || '—'}</div></div>
            <div className="rounded-md bg-elevated px-3 py-2"><span className="t-meta">Space complexity</span><div className="font-mono">{evaluation.space_complexity || '—'}</div></div>
          </div>
          {evaluation.feedback && <p className="t-body">{evaluation.feedback}</p>}
          {evaluation.edge_cases_handled?.length > 0 && <div><div className="t-label mb-1">Edge cases handled</div><ul className="text-sm text-muted list-disc pl-5 space-y-0.5">{evaluation.edge_cases_handled.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          {evaluation.edge_cases_missed?.length > 0 && <div><div className="t-label mb-1 text-warning">Edge cases missed</div><ul className="text-sm text-muted list-disc pl-5 space-y-0.5">{evaluation.edge_cases_missed.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          {evaluation.code_quality_notes && <p className="t-meta">{evaluation.code_quality_notes}</p>}
        </>
      )}
    </div>
  );
}

export default function DSARound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);           // last submit response
  const [sideTab, setSideTab] = useState('problem');
  const [confirmSkip, setConfirmSkip] = useState(false);
  const submitLock = useRef(false);
  const elapsed = useTimer();

  const load = async () => {
    try {
      setLoading(true); setError('');
      const s = await getInterview(sessionId);
      if (s.status === 'completed') { navigate(`/results/${sessionId}`, { replace: true }); return; }
      if (s.current_round !== 'dsa') { navigate(`/interview/${sessionId}`, { replace: true }); return; }
      setSession(s);
      const p = await getDsaProblem(sessionId);
      setProblem(p);
      setCode(p.starter_code?.[language] || p.starter_code?.python || '');
    } catch (e) {
      setError(e.message || 'Failed to load the coding problem.');
    } finally { setLoading(false); }
  };
  useEffect(() => { Promise.resolve().then(load); }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLanguage = (lang) => {
    setLanguage(lang);
    if (problem?.starter_code?.[lang] && (!code.trim() || Object.values(problem.starter_code).includes(code))) setCode(problem.starter_code[lang]);
  };

  const requestHint = async () => {
    if (!problem || hintLoading) return;
    try { setHintLoading(true); const r = await getDsaHint(sessionId, { current_code: code || '# empty', language }); setHint(r.hint); }
    catch (e) { setHint(`Hint unavailable: ${e.message}`); }
    finally { setHintLoading(false); }
  };

  const submit = async () => {
    if (!problem || submitting || submitLock.current) return;
    submitLock.current = true;
    try {
      setSubmitting(true); setError('');
      const r = await submitDsa(sessionId, { code, language, verbal_explanation: explanation || null, problem_index: problem.problem_index ?? 0 });
      setResult(r);
      setSideTab('evaluation');
    } catch (e) {
      setError(e.message || 'Submission failed.');
    } finally { setSubmitting(false); submitLock.current = false; }
  };

  const continueAfterResult = () => {
    if (!result) return;
    if (result.round_complete) {
      if (result.interview_status === 'complete' || !result.next_round || result.next_round === 'complete') navigate(`/results/${sessionId}`);
      else navigate(`/interview/${sessionId}`);
      return;
    }
    const p = result.next_problem;
    setProblem(p);
    setCode(p.starter_code?.[language] || p.starter_code?.python || '');
    setExplanation('');
    setHint(null);
    setResult(null);
    setSideTab('problem');
  };

  if (loading) return <div className="min-h-screen bg-bg grid place-items-center text-muted text-sm"><Spinner className="mr-2" /> Preparing your coding problem…</div>;
  if (error && !problem) return <div className="min-h-screen bg-bg p-6 grid place-items-center"><ErrorState title="Could not load the DSA round" description={error} onRetry={load} /></div>;

  const total = problem?.problems_total || session?.config?.dsa_problems || 2;
  const index = (problem?.problem_index ?? 0) + 1;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="h-14 border-b border-border bg-surface/80 backdrop-blur flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-4 min-w-0">
          <Logo compact />
          <div className="hidden sm:flex items-center gap-2 text-sm"><span className="text-muted">{session?.target_role}</span><ChevronRight size={14} className="text-dim" /><span className="font-medium">{roundLabel('dsa')}</span></div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Badge tone="neutral"><Code2 size={12} /> Problem {Math.min(index, total)} / {total}</Badge>
          {problem?.difficulty && <Badge tone={toneForDifficulty(problem.difficulty)}>{problem.difficulty}{problem.adaptive ? ' · adaptive' : ''}</Badge>}
          <span className="font-mono text-sm text-muted tabular-nums hidden sm:inline"><Clock size={12} className="inline mr-1" />{elapsed}</span>
          <Tooltip content="Submit whatever you have and move on" side="bottom"><Button variant="ghost" size="sm" icon={Flag} onClick={() => setConfirmSkip(true)}>Skip</Button></Tooltip>
        </div>
      </header>

      {problem?.difficulty_policy?.reason && problem.difficulty_policy.direction !== 'start' && (
        <div className="px-4 lg:px-6 pt-3"><Alert tone="info">Difficulty {problem.difficulty_policy.direction}d to <b>{problem.difficulty_policy.next_difficulty}</b> — {problem.difficulty_policy.reason}.</Alert></div>
      )}
      {problem?.generation_source === 'bank' && (
        <div className="px-4 lg:px-6 pt-3"><Alert tone="warning">AI model unavailable — this is a curated bank problem and submissions will be recorded without automatic scoring.</Alert></div>
      )}
      {error && <div className="px-4 lg:px-6 pt-3"><Alert tone="error">{error}</Alert></div>}

      <div className="flex-1 grid lg:grid-cols-[420px_1fr] min-h-0">
        {/* Problem / evaluation */}
        <aside className="border-b lg:border-b-0 lg:border-r border-border bg-surface flex flex-col min-h-0">
          <Tabs className="px-4" value={sideTab} onChange={setSideTab} tabs={[{ value: 'problem', label: 'Problem' }, { value: 'evaluation', label: 'Evaluation' }, { value: 'notes', label: 'Explanation' }]} />
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[55vh] lg:max-h-none">
            {sideTab === 'problem' && problem && (
              <>
                <div>
                  <h2 className="h-section">{problem.title}</h2>
                  <div className="mt-1 flex gap-1.5 flex-wrap"><Badge tone="neutral">{problem.pattern}</Badge><Badge tone={toneForDifficulty(problem.difficulty)}>{problem.difficulty}</Badge></div>
                </div>
                <p className="t-body whitespace-pre-wrap">{problem.description}</p>
                {problem.examples?.map((ex, i) => (
                  <div key={i} className="rounded-md bg-elevated border border-border p-3 text-sm font-mono space-y-1">
                    <div><span className="text-dim">Input: </span>{ex.input}</div>
                    <div><span className="text-dim">Output: </span>{ex.output}</div>
                    {ex.explanation && <div className="font-sans text-muted text-xs">{ex.explanation}</div>}
                  </div>
                ))}
                {problem.constraints?.length > 0 && (
                  <div><div className="t-label mb-1">Constraints</div><ul className="text-sm text-muted font-mono list-disc pl-5 space-y-0.5">{problem.constraints.map((c) => <li key={c}>{c}</li>)}</ul></div>
                )}
                {hint && <Alert tone="info" title="Hint">{hint}</Alert>}
              </>
            )}
            {sideTab === 'evaluation' && (
              result ? (
                <div className="space-y-4">
                  <EvaluationPanel evaluation={result.evaluation} />
                  {result.round_complete && result.round_result && (
                    <Card title="Round summary" subtitle={result.round_result.feedback}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={toneForScore(result.round_result.score)}>Round score {result.round_result.score == null ? '—' : `${fmtScore(result.round_result.score)}%`}</Badge>
                        <Badge tone={sourceTone(result.round_result.evaluation_source)}>{sourceLabel(result.round_result.evaluation_source)}</Badge>
                        <Badge tone="neutral"><ListChecks size={12} /> {result.round_result.problems_solved ?? 0} / {result.round_result.problems_attempted} solved</Badge>
                      </div>
                    </Card>
                  )}
                  {!result.round_complete && result.difficulty_decision && (
                    <Alert tone="info">Next problem difficulty: <b>{result.difficulty_decision.next_difficulty}</b> — {result.difficulty_decision.reason}.</Alert>
                  )}
                  <Button className="w-full" onClick={continueAfterResult} iconRight={ChevronRight}>
                    {result.round_complete ? (result.next_round && result.next_round !== 'complete' ? `Continue to ${roundLabel(result.next_round)} round` : 'View results') : 'Next problem'}
                  </Button>
                </div>
              ) : <p className="t-meta">Submit your solution to see the evaluation.</p>
            )}
            {sideTab === 'notes' && (
              <div className="space-y-3">
                <p className="t-body">{problem?.concept_question || 'Explain your approach and its time/space complexity. The explanation is evaluated alongside your code.'}</p>
                <Textarea rows={8} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Describe your approach, trade-offs and complexity…" />
                <p className="t-meta">{explanation.length}/5000</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-border flex gap-2">
            <Button variant="secondary" className="flex-1" icon={Lightbulb} loading={hintLoading} onClick={requestHint} disabled={!!result}>Get hint</Button>
            <Button className="flex-1" icon={Play} loading={submitting} onClick={submit} disabled={!!result || !code.trim()}>Submit</Button>
          </div>
        </aside>

        {/* Editor */}
        <section className="flex flex-col min-h-[420px]">
          <div className="h-11 px-4 border-b border-border flex items-center justify-between gap-3 bg-surface">
            <div className="flex items-center gap-2 text-sm text-muted"><Code2 size={14} /> Solution</div>
            <div className="w-40"><Select value={language} onChange={(e) => onLanguage(e.target.value)} options={LANGUAGES} /></div>
          </div>
          <div className={clsx('flex-1 monaco-wrap', result && 'opacity-80')}>
            <Editor
              height="100%"
              theme="vs-dark"
              language={MONACO_LANG[language] || 'plaintext'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{ fontSize: 14, minimap: { enabled: false }, fontFamily: 'JetBrains Mono, Menlo, monospace', scrollBeyondLastLine: false, automaticLayout: true, readOnly: !!result, padding: { top: 16 }, renderLineHighlight: 'line', smoothScrolling: true }}
              loading={<div className="h-full grid place-items-center text-muted text-sm"><Spinner className="mr-2" /> Loading editor…</div>}
            />
          </div>
          <div className="px-4 py-2 border-t border-border bg-surface flex items-center justify-between text-xs text-dim">
            <span>{code.split('\n').length} lines · {language}</span>
            <span className="flex items-center gap-1"><AlertTriangle size={12} /> Submissions are evaluated by static reasoning; code is not executed.</span>
          </div>
        </section>
      </div>

      <Modal open={confirmSkip} onClose={() => setConfirmSkip(false)} title="Submit and move on?" description="Your current code (even if incomplete) will be submitted for evaluation."
        footer={<><Button variant="secondary" onClick={() => setConfirmSkip(false)}>Back</Button><Button onClick={() => { setConfirmSkip(false); submit(); }}>Submit</Button></>} />
      <div className="sr-only"><Progress value={(index / total) * 100} /></div>
    </div>
  );
}
