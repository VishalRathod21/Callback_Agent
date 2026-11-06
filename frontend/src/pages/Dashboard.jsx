/* Dashboard — user-level overview built entirely from GET /api/dashboard/overview. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Sparkles, FileText, Trophy, Target, Clock, MessageSquare, CheckCircle2, Activity, PlayCircle, ArrowRight, Info, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { getOverview } from '../api/endpoints';
import {
  Button, Card, Badge, toneForScore, Progress, ScoreRing, StatCard, Tooltip, Skeleton, EmptyState, ErrorState, Alert,
  fmtDate, fmtDateTime, fmtScore, titleCase, roundLabel,
} from '../components/ui';

/* ── Constants (labels/colours only — never data) ───────────────────────── */
const CHART = { primary: '#8B5CF6', secondary: '#6366F1', accent: '#22D3EE', success: '#22C55E', warning: '#F59E0B', error: '#EF4444', grid: '#27272A', text: '#A1A1AA' };
const TOOLTIP_STYLE = { background: '#18181B', border: '1px solid #27272A', borderRadius: 8, fontSize: 12, color: '#FAFAFA' };
const RUBRIC_LABELS = {
  technical_correctness: 'Technical correctness',
  conceptual_understanding: 'Conceptual understanding',
  answer_completeness: 'Answer completeness',
  communication_clarity: 'Communication clarity',
};
const READINESS_LABELS = {
  latest_score_factor: 'Latest score (max 40)',
  trend_factor: 'Improvement trend (max 30)',
  consistency_factor: 'Consistency (max 20)',
  sessions_factor: 'Session volume (max 10)',
};
const STATUS_TONE = { completed: 'success', active: 'accent', cancelled: 'neutral', screened: 'success', uploaded: 'warning', interviewing: 'accent', rejected: 'error' };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const barColor = (v) => (v == null ? CHART.text : v >= 75 ? CHART.success : v >= 50 ? CHART.warning : CHART.error);
const sessionRoute = (s) => (s.status === 'completed' ? `/results/${s.session_id}` : s.current_round === 'dsa' ? `/interview/${s.session_id}/dsa` : `/interview/${s.session_id}`);

/* ── Sub-components ─────────────────────────────────────────────────────── */
function ActiveBanner({ sessions }) {
  const navigate = useNavigate();
  const active = sessions.filter((s) => s.status === 'active');
  if (!active.length) return null;
  const s = active[0];
  return (
    <div className="card border-accent/30 bg-accent-soft px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-up">
      <div className="flex items-center gap-3 min-w-0">
        <PlayCircle size={18} className="text-accent shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium">You have {active.length === 1 ? 'an interview in progress' : `${active.length} interviews in progress`}</div>
          <div className="t-meta truncate">{s.target_role || 'Interview'} · {roundLabel(s.current_round)} round · started {fmtDateTime(s.started_at)}</div>
        </div>
      </div>
      <Button size="sm" variant="primary" iconRight={ArrowRight} onClick={() => navigate(sessionRoute(s))}>Resume interview</Button>
    </div>
  );
}

function CandidateCard({ candidate, candidatesCount }) {
  const navigate = useNavigate();
  if (!candidate) {
    return (
      <EmptyState
        icon={FileText}
        title="No resume uploaded yet"
        description="Upload a resume to get screened, unlock resume-aware questions and start your first mock interview."
        action={<Button icon={FileText} onClick={() => navigate('/resume')}>Upload resume</Button>}
      />
    );
  }
  return (
    <Card
      title="Candidate profile"
      subtitle={candidatesCount > 1 ? `Latest of ${candidatesCount} resumes` : 'Your current resume'}
      action={<Button size="sm" variant="secondary" onClick={() => navigate(`/resume/${candidate.id}`)}>Open</Button>}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold truncate">{candidate.name}</span>
            <Badge tone={STATUS_TONE[candidate.status] || 'neutral'} dot>{titleCase(candidate.status)}</Badge>
          </div>
          <div className="t-body mt-0.5">{candidate.target_role || 'No target role set'}</div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 t-meta">
            <span className="inline-flex items-center gap-1.5">
              <FileText size={12} /> {candidate.resume_uploaded ? 'Resume uploaded' : 'No resume file'}
            </span>
            {candidate.resume_parsed_at && <span>Parsed {fmtDate(candidate.resume_parsed_at)}</span>}
          </div>
          {candidate.skills?.length > 0 && (
            <div className="mt-4">
              <div className="t-label mb-2">Top skills</div>
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center shrink-0">
          <ScoreRing value={candidate.ats_score} size={92} label="ATS" />
        </div>
      </div>
    </Card>
  );
}

function StartCta({ candidate }) {
  const navigate = useNavigate();
  const ok = candidate && ['screened', 'interviewing', 'completed'].includes(candidate.status);
  const reason = !candidate
    ? 'Upload a resume first — interviews are generated from your profile.'
    : candidate.status === 'uploaded'
      ? 'Your resume has not been screened yet. Open it to run screening.'
      : candidate.status === 'rejected'
        ? 'This resume did not pass screening. Upload an updated resume to continue.'
        : null;
  return (
    <Card className="bg-gradient-to-br from-primary-soft to-transparent">
      <div className="flex flex-col gap-3 h-full justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary"><Sparkles size={16} /><span className="t-label text-primary">Mock interview</span></div>
          <h3 className="h-section mt-2">Start a new interview</h3>
          <p className="t-body mt-1">Pick rounds, difficulty and mode. Questions adapt to your resume and your answers.</p>
        </div>
        <div>
          <Button icon={Sparkles} disabled={!ok} onClick={() => navigate(candidate ? `/interview/setup/${candidate.id}` : '/interview/setup')} className="w-full sm:w-auto">
            Start new interview
          </Button>
          {reason && <p className="help flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />{reason}</p>}
        </div>
      </div>
    </Card>
  );
}

function TrendBadge({ delta }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = delta > 0 ? 'success' : delta < 0 ? 'error' : 'neutral';
  return <Badge tone={tone}><Icon size={12} />{delta > 0 ? '+' : ''}{fmtScore(delta)} since first</Badge>;
}

function Stats({ totals }) {
  const items = [
    { label: 'Total interviews', value: totals.interviews, icon: Activity, tone: 'primary' },
    { label: 'Completed', value: totals.completed, icon: CheckCircle2, tone: 'success', sub: totals.active ? `${totals.active} active` : undefined },
    { label: 'Average score', value: totals.average_score == null ? '—' : `${fmtScore(totals.average_score)}%`, icon: Target, tone: toneForScore(totals.average_score) },
    { label: 'Best score', value: totals.best_score == null ? '—' : `${fmtScore(totals.best_score)}%`, icon: Trophy, tone: 'warning' },
    { label: 'Practice time', value: `${totals.total_time_min} min`, icon: Clock, tone: 'accent' },
    { label: 'Questions answered', value: totals.questions_answered, icon: MessageSquare, tone: 'neutral' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-y-6 py-2 border-y border-border">
      {items.map((it) => <StatCard key={it.label} {...it} />)}
    </div>
  );
}

function TrendsChart({ timeline, trends }) {
  const navigate = useNavigate();
  if (!timeline.length) {
    return (
      <Card variant="ghost" title="Performance trends">
        <EmptyState icon={Activity} title="No completed sessions yet" description="Finish an interview and your scores per round will be plotted here." className="border-0 shadow-none py-8" />
      </Card>
    );
  }
  const data = timeline.map((t) => ({ ...t, name: `#${t.session_number}` }));
  const hasRound = (k) => timeline.some((t) => t[k] != null);
  return (
    <Card variant="ghost" title="Performance trends" subtitle="Overall and per-round scores across completed sessions" action={<TrendBadge delta={trends?.overall} />}>
      <div className="h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} onClick={(e) => e?.activePayload?.[0]?.payload?.session_id && navigate(`/results/${e.activePayload[0].payload.session_id}`)}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: CHART.text, fontSize: 12 }} axisLine={{ stroke: CHART.grid }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} />
            <ChartTooltip
              contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART.text }} itemStyle={{ color: '#FAFAFA' }} cursor={{ stroke: CHART.grid }}
              labelFormatter={(label, payload) => { const p = payload?.[0]?.payload; return p ? `Session ${label} · ${fmtDate(p.date)}${p.target_role ? ` · ${p.target_role}` : ''}` : label; }}
              formatter={(v, n) => [v == null ? '—' : `${fmtScore(v)}%`, n]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: CHART.text }} />
            <Line type="monotone" dataKey="overall" name="Overall" stroke={CHART.primary} strokeWidth={2.5} dot={{ r: 3, fill: CHART.primary }} activeDot={{ r: 5 }} connectNulls />
            {hasRound('dsa') && <Line type="monotone" dataKey="dsa" name="DSA" stroke={CHART.accent} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />}
            {hasRound('technical') && <Line type="monotone" dataKey="technical" name="Technical" stroke={CHART.secondary} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />}
            {hasRound('hr') && <Line type="monotone" dataKey="hr" name="HR" stroke={CHART.warning} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="t-meta mt-2">Click a point to open that session's report.</p>
    </Card>
  );
}

function RubricCard({ rubric }) {
  const keys = Object.keys(RUBRIC_LABELS);
  const any = keys.some((k) => rubric?.[k] != null);
  return (
    <Card variant="ghost" title="Rubric averages" subtitle="Average per criterion across evaluated answers (0–10)">
      {!any ? (
        <p className="t-body">Rubric scores appear once answers have been evaluated.</p>
      ) : (
        <div className="space-y-4">
          {keys.map((k) => {
            const v = rubric[k];
            return (
              <div key={k}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-muted">{RUBRIC_LABELS[k]}</span>
                  <span className="text-sm font-medium tabular-nums">{v == null ? '—' : `${fmtScore(v)} / 10`}</span>
                </div>
                <Progress value={v ?? 0} max={10} tone={v == null ? 'neutral' : toneForScore(v * 10)} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SkillsChart({ skills }) {
  if (!skills.length) {
    return (
      <Card variant="ghost" title="Skill performance">
        <p className="t-body">Category-level scores appear after your first evaluated technical or HR answers.</p>
      </Card>
    );
  }
  const data = skills.map((s) => ({ ...s, label: titleCase(s.category) }));
  const height = Math.max(160, data.length * 36 + 24);
  return (
    <Card variant="ghost" title="Skill performance" subtitle="Average score per question category (weakest first)">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} />
            <ChartTooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART.text }} itemStyle={{ color: '#FAFAFA' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              formatter={(v, _n, p) => [`${fmtScore(v)}% · ${p.payload.questions} question${p.payload.questions === 1 ? '' : 's'}`, 'Average']} />
            <Bar dataKey="average" radius={[0, 6, 6, 0]} barSize={18}>
              {data.map((d) => <Cell key={d.category} fill={barColor(d.average)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ReadinessCard({ score, breakdown, averages }) {
  const entries = Object.entries(breakdown || {});
  const tip = entries.length ? (
    <div className="space-y-1 text-left">
      {entries.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><span>{READINESS_LABELS[k] || titleCase(k)}</span><span className="tabular-nums text-fg">{fmtScore(v)}</span></div>)}
    </div>
  ) : 'Complete an interview to compute readiness.';
  return (
    <Card variant="ghost" title="Interview readiness" action={<Tooltip content={tip} side="left"><span className="text-dim hover:text-fg cursor-help"><Info size={16} /></span></Tooltip>}>
      <div className="flex items-center gap-5">
        <ScoreRing value={entries.length ? score : null} size={110} label="ready" />
        <div className="flex-1 space-y-2 text-sm">
          {['overall', 'dsa', 'technical', 'hr'].map((k) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-muted">{k === 'overall' ? 'Overall avg' : roundLabel(k)}</span>
              <span className="font-medium tabular-nums">{averages?.[k] == null ? '—' : `${fmtScore(averages[k])}%`}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-border space-y-2.5">
        <div className="t-label">Readiness breakdown</div>
        {[['latest_score_factor', 'Latest score', 40], ['trend_factor', 'Improvement', 30], ['consistency_factor', 'Consistency', 20], ['sessions_factor', 'Practice volume', 10]].map(([k, label, max]) => (
          <div key={k}>
            <div className="flex justify-between text-xs"><span className="text-muted">{label} <span className="text-dim">· max {max}</span></span><span className="tabular-nums text-fg">{breakdown?.[k] ?? 0}</span></div>
            <Progress value={breakdown?.[k] ?? 0} max={max} tone="accent" height={5} className="mt-1" />
          </div>
        ))}
        <p className="t-meta pt-1">Weighted: latest score 40% · improvement 30% · consistency 20% · volume 10%.</p>
      </div>
    </Card>
  );
}

function RecentSessions({ sessions }) {
  const navigate = useNavigate();
  return (
    <Card title="Recent sessions" action={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('/history')}>All history</Button>} padded={sessions.length === 0}>
      {sessions.length === 0 ? (
        <p className="t-body">No interview sessions yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.session_id}>
              <button
                type="button" onClick={() => s.status !== 'cancelled' && navigate(sessionRoute(s))} disabled={s.status === 'cancelled'}
                className="w-full text-left px-5 md:px-6 py-3.5 flex items-center gap-4 hover:bg-elevated/60 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium truncate">{s.target_role || 'Interview'}</span>
                    <Badge tone={STATUS_TONE[s.status] || 'neutral'} dot>{titleCase(s.status)}</Badge>
                  </div>
                  <div className="t-meta mt-0.5 flex flex-wrap gap-x-3">
                    <span>{fmtDateTime(s.started_at)}</span>
                    <span>{titleCase(s.mode || 'text')} mode</span>
                    {s.status === 'active' && <span>Round: {roundLabel(s.current_round)}</span>}
                    {s.duration_min > 0 && <span>{s.duration_min} min</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {s.overall_score != null ? <Badge tone={toneForScore(s.overall_score)}>{fmtScore(s.overall_score)}%</Badge> : <span className="t-meta">—</span>}
                </div>
                {s.status !== 'cancelled' && <ArrowRight size={14} className="text-dim shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProvenanceNote({ provenance }) {
  const heuristic = provenance?.heuristic || 0;
  const unavailable = provenance?.unavailable || 0;
  if (heuristic + unavailable === 0) return null;
  const llm = provenance?.llm || 0;
  return (
    <Alert tone="warning" title="Some scores are heuristic estimates">
      {heuristic > 0 && `${heuristic} answer${heuristic === 1 ? ' was' : 's were'} scored by the deterministic fallback because the AI evaluator was unavailable. `}
      {unavailable > 0 && `${unavailable} answer${unavailable === 1 ? ' has' : 's have'} no evaluation. `}
      {llm > 0 && `${llm} answer${llm === 1 ? ' was' : 's were'} evaluated by the AI model. `}
      Treat affected averages as indicative, not authoritative.
    </Alert>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-9 w-64" />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card card-pad lg:col-span-2"><Skeleton lines={4} /></div>
        <div className="card card-pad"><Skeleton lines={3} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card card-pad"><Skeleton lines={2} /></div>)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card card-pad lg:col-span-2 h-80"><Skeleton lines={6} /></div>
        <div className="card card-pad"><Skeleton lines={5} /></div>
      </div>
    </div>
  );
}

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

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload: load } = useRequest(getOverview);

  const firstName = (user?.full_name || data?.user?.name || '').split(' ')[0];

  return (
    <AppShell title="Dashboard" wide>
      <div className="mb-6">
        <h1 className="h-page">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="t-body mt-1">Here is how your interview preparation is going.</p>
      </div>

      {loading ? <DashboardSkeleton /> : error ? (
        <ErrorState title="Could not load your dashboard" description={error} onRetry={load} />
      ) : data && (
        <div className="space-y-6 animate-fade-up">
          {data.totals.active > 0 && <ActiveBanner sessions={data.recent_sessions} />}
          <ProvenanceNote provenance={data.evaluation_provenance} />

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2"><CandidateCard candidate={data.candidate} candidatesCount={data.candidates_count} /></div>
            <StartCta candidate={data.candidate} />
          </div>

          <Stats totals={data.totals} />

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2"><TrendsChart timeline={data.score_timeline || []} trends={data.trends} /></div>
            <ReadinessCard score={data.readiness_score} breakdown={data.readiness_breakdown} averages={data.averages} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <RubricCard rubric={data.rubric_averages} />
            <SkillsChart skills={data.skill_performance || []} />
          </div>

          <RecentSessions sessions={data.recent_sessions || []} />
        </div>
      )}
    </AppShell>
  );
}
