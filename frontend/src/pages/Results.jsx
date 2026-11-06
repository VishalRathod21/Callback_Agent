/* Results page — full evaluation report for one interview session (or a candidate's latest session). */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell,
} from 'recharts';
import { Download, RefreshCw, ChevronDown, ChevronUp, MessageSquare, Send, ArrowLeft, BookOpen, Target, Clock, ListChecks } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import client from '../api/client';
import { getSessionReport, downloadSessionReportPdf, getDebriefContext, debriefChat, clearDebrief } from '../api/endpoints';
import {
  Button, Badge, Card, Tabs, Spinner, ErrorState, Alert, Progress, ScoreRing, StatCard, Tooltip, useToast, Skeleton, EmptyState,
  toneForScore, toneForDifficulty, sourceLabel, sourceTone, fmtScore, fmtDate, fmtDuration, roundLabel, titleCase,
} from '../components/ui';

const RADAR_LABELS = { technical_correctness: 'Technical', conceptual_understanding: 'Conceptual', answer_completeness: 'Complete', communication_clarity: 'Clarity' };
const RUBRIC = [
  ['technical_correctness', 'Technical correctness', 0.4], ['conceptual_understanding', 'Conceptual understanding', 0.25],
  ['answer_completeness', 'Answer completeness', 0.2], ['communication_clarity', 'Communication clarity', 0.15],
];
const COLORS = { primary: '#8B5CF6', accent: '#22D3EE', success: '#22C55E', warning: '#F59E0B', error: '#EF4444', grid: '#27272A', text: '#A1A1AA' };
const tooltipStyle = { contentStyle: { background: '#18181B', border: '1px solid #27272A', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#FAFAFA' }, itemStyle: { color: '#A1A1AA' } };
const scoreColor = (v) => (v == null ? '#3F3F46' : v >= 75 ? COLORS.success : v >= 50 ? COLORS.warning : COLORS.error);

function QuestionItem({ q, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const s = q.scores || {};
  return (
    <div className="card">
      <button className="w-full text-left px-5 py-4 flex items-start gap-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <Badge tone="neutral">{roundLabel(q.round)} · Q{q.index + 1}</Badge>
            {q.category && <Badge tone="neutral">{titleCase(q.category)}</Badge>}
            {q.difficulty && <Badge tone={toneForDifficulty(q.difficulty)}>{q.difficulty}</Badge>}
            {q.is_follow_up && <Badge tone="accent">follow-up</Badge>}
            <Badge tone={sourceTone(q.evaluation_source)}>{sourceLabel(q.evaluation_source)}</Badge>
          </div>
          <p className="text-sm text-fg leading-relaxed">{q.question}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={clsx('text-lg font-semibold tabular-nums', q.overall_score == null ? 'text-dim' : '')}>{q.overall_score == null ? '—' : `${fmtScore(q.overall_score)}/10`}</span>
          {open ? <ChevronUp size={16} className="text-dim" /> : <ChevronDown size={16} className="text-dim" />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          <div>
            <div className="t-label mb-1">Your answer</div>
            <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{q.answer || '(no answer recorded)'}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {RUBRIC.map(([k, label]) => (
              <div key={k} className="rounded-md bg-elevated px-3 py-2">
                <div className="t-meta">{label}</div>
                <div className="font-semibold tabular-nums">{s[k] == null ? '—' : `${fmtScore(s[k])}/10`}</div>
                <Progress value={s[k] || 0} max={10} tone={toneForScore((s[k] || 0) * 10)} height={4} className="mt-1.5" />
              </div>
            ))}
          </div>
          {q.feedback && <div><div className="t-label mb-1">Feedback</div><p className="text-sm text-muted leading-relaxed">{q.feedback}</p></div>}
          <div className="grid sm:grid-cols-2 gap-4">
            {q.strengths?.length > 0 && <div><div className="t-label mb-1 text-success">Strengths</div><ul className="text-sm text-muted list-disc pl-5 space-y-0.5">{q.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {q.gaps?.length > 0 && <div><div className="t-label mb-1 text-warning">Gaps</div><ul className="text-sm text-muted list-disc pl-5 space-y-0.5">{q.gaps.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          </div>
          {q.ideal_answer_points?.length > 0 && <div><div className="t-label mb-1">A strong answer covers</div><ul className="text-sm text-muted list-disc pl-5 space-y-0.5">{q.ideal_answer_points.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <div className="flex items-center gap-2 flex-wrap t-meta">
            {q.policy?.reason && <span>Adaptive policy: {q.policy.reason} → next {q.next_difficulty}</span>}
            {q.retrieval_sources?.length > 0 && (
              <span className="flex items-center gap-1.5">Grounded in: {q.retrieval_sources.map((r) => <Tooltip key={r.chunk_id} content={r.preview}><Badge tone="primary">{r.section}#{r.chunk_index}</Badge></Tooltip>)}</span>
            )}
            {(q.generation_latency_ms != null || q.evaluation_latency_ms != null) && <span>· latency gen {q.generation_latency_ms ?? '—'} ms / eval {q.evaluation_latency_ms ?? '—'} ms</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Debrief({ candidateId }) {
  const [ctx, setCtx] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => { getDebriefContext(candidateId).then(setCtx).catch((e) => setErr(e.message)); }, [candidateId]);
  const ask = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput(''); setBusy(true);
    try { const r = await debriefChat(candidateId, q); setMessages((m) => [...m, { role: 'assistant', content: r.response }]); }
    catch (e) { toast.error(e.message || 'The coach is unavailable right now.'); setMessages((m) => m.slice(0, -1)); }
    finally { setBusy(false); }
  };
  if (err) return <Alert tone="warning">Debrief coach unavailable: {err}</Alert>;
  return (
    <Card title="Debrief coach" subtitle="Ask about specific answers; the coach has your transcript and scores." action={<Button size="sm" variant="ghost" onClick={async () => { await clearDebrief(candidateId).catch(() => {}); setMessages([]); }}>Clear</Button>}>
      <div className="flex gap-1.5 flex-wrap mb-3">{ctx?.starter_questions?.map((q) => <button key={q} className="badge badge-neutral hover:border-border-strong" onClick={() => ask(q)}>{q}</button>)}</div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {messages.map((m, i) => <div key={i} className={clsx('rounded-lg px-3.5 py-2.5 text-sm', m.role === 'user' ? 'bg-primary-soft text-fg ml-8' : 'bg-elevated text-muted mr-8 whitespace-pre-wrap')}>{m.content}</div>)}
        {busy && <div className="t-meta flex items-center gap-2"><Spinner size={12} /> Thinking…</div>}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input className="input" placeholder="Why did I score low on Q2?" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" icon={Send} disabled={!input.trim() || busy}>Ask</Button>
      </form>
    </Card>
  );
}

export default function Results({ byCandidate = false }) {
  const { sessionId, candidateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = async (regenerate = false) => {
    try {
      setError('');
      const d = byCandidate
        ? (await client.get(`/reports/${candidateId}/data`, { params: regenerate ? { regenerate: true } : {} })).data
        : await getSessionReport(sessionId, regenerate);
      setData(d);
    } catch (e) { setError(e.message || 'Could not load the report.'); }
  };
  useEffect(() => { Promise.resolve().then(() => { setData(null); load(); }); }, [sessionId, candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sid = data?.session?.id || sessionId;
  const rounds = useMemo(() => data?.rounds || [], [data]);
  const roundChart = useMemo(() => rounds.map((r) => ({ name: roundLabel(r.name), score: r.score ?? 0, raw: r.score })), [rounds]);
  const rubricChart = useMemo(() => RUBRIC.map(([k]) => ({ subject: RADAR_LABELS[k], value: data?.rubric_averages?.[k] ?? 0 })), [data]);
  const skillChart = useMemo(() => Object.entries(data?.skill_performance || {}).map(([k, v]) => ({ name: titleCase(k), average: v.average, questions: v.questions })).sort((a, b) => b.average - a.average), [data]);
  const trace = useMemo(() => (data?.difficulty_trace || []).map((d, i) => ({ step: i + 1, level: { easy: 1, medium: 2, hard: 3 }[d.difficulty] || 2, score: d.score, label: `${roundLabel(d.round)} Q${d.index + 1}` })), [data]);

  const regenerate = async () => { setRegenerating(true); await load(true); setRegenerating(false); toast.success('Report regenerated.'); };
  const download = async () => {
    try { setDownloading(true); await downloadSessionReportPdf(sid); }
    catch (e) { toast.error(e.message || 'PDF download failed.'); }
    finally { setDownloading(false); }
  };

  if (error) return <AppShell title="Results"><ErrorState title="Report unavailable" description={error} onRetry={() => load()} /></AppShell>;
  if (!data) return <AppShell title="Results"><Skeleton lines={3} className="max-w-xl" /><div className="grid md:grid-cols-3 gap-4 mt-6">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div></AppShell>;

  const { candidate, session, narrative, evaluation_provenance: prov } = data;
  const degraded = (prov?.heuristic || 0) + (prov?.unavailable || 0) > 0 || data.narrative_source !== 'llm';

  return (
    <AppShell title="Interview results" wide>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <button className="t-meta flex items-center gap-1 hover:text-fg mb-2" onClick={() => navigate('/history')}><ArrowLeft size={12} /> History</button>
          <h1 className="h-page">{candidate.name} · {candidate.target_role || 'Interview'}</h1>
          <p className="t-body mt-1">{fmtDate(session.started_at)} · {session.mode || 'text'} mode · {session.status}{session.persona?.name ? ` · interviewer: ${session.persona.name}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} loading={regenerating} onClick={regenerate}>Regenerate</Button>
          <Button icon={Download} loading={downloading} onClick={download}>Download PDF</Button>
        </div>
      </div>

      {degraded && (
        <Alert tone="warning" title="Evaluation provenance" className="mb-6">
          {prov?.note} {data.narrative_source !== 'llm' && 'The narrative summary is a deterministic summary of the scores (AI narrative unavailable).'}
          {' '}Counts — AI: {prov?.llm ?? 0}, heuristic: {prov?.heuristic ?? 0}, not evaluated: {prov?.unavailable ?? 0}.
        </Alert>
      )}

      {/* Headline */}
      <div className="grid md:grid-cols-[auto_1fr] gap-4 mb-6">
        <div className="flex flex-col items-center justify-center min-w-[200px] pr-6 md:border-r border-border">
          <ScoreRing value={session.overall_score} size={140} stroke={10} label="overall" />
          <Badge tone={toneForScore(session.overall_score)} className="mt-3">{narrative?.final_recommendation ? titleCase(narrative.final_recommendation) : 'No recommendation'}</Badge>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-y-6 items-center">
          <StatCard label="Duration" value={fmtDuration(session.duration_seconds)} icon={Clock} />
          <StatCard label="Questions" value={session.total_questions} icon={ListChecks} sub={`${rounds.filter((r) => r.completed).length} / ${rounds.length} rounds completed`} />
          <StatCard label="ATS resume match" value={candidate.ats_score == null ? '—' : `${fmtScore(candidate.ats_score)}%`} icon={Target} />
          <StatCard label="Learning topics" value={(data.learning_topics || []).length} icon={BookOpen} sub="suggested below" />
        </div>
      </div>

      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'questions', label: 'Question-wise', count: data.questions?.length || 0 }, { value: 'debrief', label: 'Debrief coach' }]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card variant="ghost" title="Round-wise scores" subtitle="0–100 per round">
            {roundChart.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={roundChart} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: COLORS.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: COLORS.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RTooltip {...tooltipStyle} formatter={(v, n, p) => [p.payload.raw == null ? 'not scored' : `${fmtScore(v)}%`, 'score']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>{roundChart.map((r) => <Cell key={r.name} fill={scoreColor(r.raw)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No rounds scored" />}
            <div className="mt-3 space-y-2">
              {rounds.map((r) => (
                <div key={r.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{roundLabel(r.name)} <span className="t-meta">· {r.questions} q</span></span>
                  <span className="flex items-center gap-2">{r.evaluation_source && <Badge tone={sourceTone(r.evaluation_source)}>{sourceLabel(r.evaluation_source)}</Badge>}<span className="font-medium tabular-nums">{r.score == null ? '—' : `${fmtScore(r.score)}%`}</span></span>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="ghost" title="Rubric profile" subtitle="Average per criterion (0–10) across all evaluated answers">
            <div className="grid sm:grid-cols-[220px_1fr] gap-4 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={rubricChart} outerRadius="55%" margin={{ top: 10, right: 44, bottom: 10, left: 44 }}>
                  <PolarGrid stroke={COLORS.grid} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: COLORS.text, fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {RUBRIC.map(([k, label, w]) => {
                  const v = data.rubric_averages?.[k];
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-sm"><span className="text-muted">{label} <span className="t-meta">· {Math.round(w * 100)}%</span></span><span className="tabular-nums font-medium">{v == null ? '—' : fmtScore(v)}</span></div>
                      <Progress value={v || 0} max={10} tone={toneForScore((v || 0) * 10)} className="mt-1" />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card variant="ghost" title="Skill-wise performance" subtitle="Average answer score per question category">
            {skillChart.length ? (
              <ResponsiveContainer width="100%" height={Math.max(160, skillChart.length * 34)}>
                <BarChart data={skillChart} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid stroke={COLORS.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} tick={{ fill: COLORS.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: COLORS.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RTooltip {...tooltipStyle} formatter={(v, n, p) => [`${fmtScore(v)}/10 over ${p.payload.questions} q`, 'average']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="average" radius={[0, 6, 6, 0]}>{skillChart.map((s) => <Cell key={s.name} fill={scoreColor(s.average * 10)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="t-meta">No evaluated questions.</p>}
          </Card>

          <Card variant="ghost" title="Adaptive difficulty trace" subtitle="How the difficulty moved after each evaluated answer">
            {trace.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trace} margin={{ left: -20, right: 12 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="step" tick={{ fill: COLORS.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="level" domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => ({ 1: 'easy', 2: 'medium', 3: 'hard' }[v])} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={76} />
                  <YAxis yAxisId="score" orientation="right" domain={[0, 10]} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <RTooltip {...tooltipStyle} labelFormatter={(v, p) => p?.[0]?.payload?.label || `Q${v}`} formatter={(v, n) => (n === 'level' ? [{ 1: 'easy', 2: 'medium', 3: 'hard' }[v], 'difficulty'] : [fmtScore(v), 'score /10'])} />
                  <Line yAxisId="level" type="stepAfter" dataKey="level" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="score" type="monotone" dataKey="score" stroke={COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="t-meta">No evaluated answers to trace.</p>}
          </Card>

          <Card variant="ghost" title="Summary" subtitle={`Narrative source: ${data.narrative_source}`} className="lg:col-span-2">
            <p className="t-body">{narrative?.executive_summary}</p>
            <div className="grid md:grid-cols-3 gap-6 mt-5">
              <div><div className="t-label mb-2 text-success">Strengths</div><ul className="space-y-1.5 text-sm text-muted list-disc pl-5">{(narrative?.strengths || []).map((s) => <li key={s}>{s}</li>)}</ul></div>
              <div><div className="t-label mb-2 text-warning">Weaknesses</div><ul className="space-y-1.5 text-sm text-muted list-disc pl-5">{(narrative?.weaknesses || narrative?.improvements || []).map((s) => <li key={s}>{s}</li>)}</ul></div>
              <div><div className="t-label mb-2 text-accent">Recommendations</div><ul className="space-y-1.5 text-sm text-muted list-disc pl-5">{(narrative?.recommendations || []).map((s) => <li key={s}>{s}</li>)}</ul></div>
            </div>
            {(data.learning_topics?.length > 0 || narrative?.learning_topics?.length > 0) && (
              <div className="mt-5"><div className="t-label mb-2">Suggested learning topics</div><div className="flex gap-1.5 flex-wrap">{[...new Set([...(data.learning_topics || []), ...(narrative?.learning_topics || [])])].map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div></div>
            )}
          </Card>
        </div>
      )}

      {tab === 'questions' && (
        <div className="space-y-3">
          {data.questions?.length ? data.questions.map((q, i) => <QuestionItem key={`${q.round}-${q.index}`} q={q} defaultOpen={i === 0} />) : <EmptyState title="No questions recorded" description="This session has no persisted question records (e.g. a DSA-only session)." />}
        </div>
      )}

      {tab === 'debrief' && (session.status === 'completed' ? <Debrief candidateId={candidate.id} /> : <Alert tone="info">The debrief coach is available once the interview is completed.</Alert>)}

      <div className="mt-8 flex gap-2">
        <Button variant="secondary" onClick={() => navigate('/interview/setup')}>New interview</Button>
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>Dashboard</Button>
      </div>
      <div className="sr-only"><MessageSquare /></div>
    </AppShell>
  );
}
