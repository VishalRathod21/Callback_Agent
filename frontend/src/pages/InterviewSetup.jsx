/* Interview configuration (/interview/setup, /interview/setup/:candidateId). */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Code2, Cpu, MessageSquare, Mic, Keyboard, Sparkles, ArrowRight, FileText, Users, CheckSquare, Square, AlertCircle, Clock, Hash, Gauge,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { getInterviewOptions, getMyCandidates, getPreferences, startInterview } from '../api/endpoints';
import {
  Button, Card, Badge, toneForScore, toneForDifficulty, Input, Textarea, Select, Toggle, SegmentedControl, Progress, Tooltip, Skeleton,
  EmptyState, ErrorState, Alert, PageHeader, useToast, titleCase, roundLabel,
} from '../components/ui';

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const ROLE_RE = /^[A-Za-z0-9.+# \-/()]+$/;
const ROUND_ORDER = ['dsa', 'technical', 'hr'];
const ROUND_ICON = { dsa: Code2, technical: Cpu, hr: MessageSquare };
const OTHER = '__other__';
const RUBRIC_LABELS = {
  technical_correctness: 'Technical correctness', conceptual_understanding: 'Conceptual understanding',
  answer_completeness: 'Answer completeness', communication_clarity: 'Communication clarity',
};
const statusTone = (s) => ({ screened: 'success', rejected: 'error', interviewing: 'primary', completed: 'accent', uploaded: 'neutral' }[s] || 'neutral');
const errMsg = (e) => e?.message || 'Request failed';
const clampInt = (v, [lo, hi], fallback) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
const validateRole = (role) => {
  const r = (role || '').trim();
  if (r.length < 2 || r.length > 100) return 'Target role must be between 2 and 100 characters.';
  if (!ROLE_RE.test(r)) return 'Target role contains invalid characters.';
  return null;
};

function useLoader(loadFn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    loadFn()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [loadFn, tick]);
  const reload = useCallback(() => { setData(null); setError(null); setTick((t) => t + 1); }, []);
  return { data, error, loading: data == null && error == null, reload };
}

/* ── Candidate selector ──────────────────────────────────────────────────── */
function CandidateSelector({ candidates, value, onChange }) {
  return (
    <Card title="Candidate profile" subtitle="Choose which resume this interview is based on.">
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((c) => {
          const active = c.id === value;
          return (
            <button key={c.id} type="button" onClick={() => onChange(c.id)} aria-pressed={active}
              className={clsx('text-left rounded-lg border p-3.5 transition-colors', active ? 'border-primary bg-primary-soft' : 'border-border bg-elevated/40 hover:border-border-strong')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg truncate">{c.name}</div>
                  <div className="t-meta truncate">{c.target_role || 'No role set'}</div>
                </div>
                <Badge tone={statusTone(c.status)}>{titleCase(c.status)}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge tone={toneForScore(c.ats_score)}>ATS {c.ats_score != null ? Math.round(c.ats_score) : '—'}</Badge>
                {c.resume?.filename && <span className="t-meta truncate">{c.resume.filename}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Role picker ─────────────────────────────────────────────────────────── */
function RolePicker({ roles, value, onChange, error }) {
  const inList = roles.includes(value);
  const [custom, setCustom] = useState(!inList && !!value);
  const options = [...roles.map((r) => ({ value: r, label: r })), { value: OTHER, label: 'Other (type your own)' }];
  return (
    <div className="space-y-2">
      <Select label="Target role" name="target_role" placeholder="Select a role" options={options}
        value={custom ? OTHER : (inList ? value : '')}
        onChange={(e) => { if (e.target.value === OTHER) { setCustom(true); onChange(''); } else { setCustom(false); onChange(e.target.value); } }}
        error={!custom ? error : undefined} help={!custom && !error ? 'Questions and screening context are tailored to this role.' : undefined} />
      {custom && (
        <Input name="target_role_custom" placeholder="e.g. Platform Engineer" value={value} maxLength={100} onChange={(e) => onChange(e.target.value)}
          error={error} help={!error ? 'Letters, numbers, spaces and . + # - / ( ) only.' : undefined} />
      )}
    </div>
  );
}

/* ── Round cards ─────────────────────────────────────────────────────────── */
function RoundCards({ rounds, selected, onToggle, error }) {
  const ordered = [...rounds].sort((a, b) => ROUND_ORDER.indexOf(a.id) - ROUND_ORDER.indexOf(b.id));
  return (
    <div>
      <div className="label">Rounds <span className="text-dim font-normal">· run in order DSA → Technical → HR</span></div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ordered.map((r) => {
          const on = selected.includes(r.id);
          const Icon = ROUND_ICON[r.id] || Sparkles;
          return (
            <button key={r.id} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(r.id)}
              className={clsx('text-left rounded-lg border p-3.5 transition-colors h-full', on ? 'border-primary bg-primary-soft' : 'border-border bg-elevated/40 hover:border-border-strong')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-fg"><Icon size={15} className={on ? 'text-primary' : 'text-dim'} /> {r.label || roundLabel(r.id)}</span>
                {on ? <CheckSquare size={16} className="text-primary shrink-0" /> : <Square size={16} className="text-dim shrink-0" />}
              </div>
              {r.description && <p className="t-meta mt-1.5">{r.description}</p>}
            </button>
          );
        })}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/* ── Summary panel ───────────────────────────────────────────────────────── */
function SummaryPanel({ form, options, candidate, onStart, starting, disabledReason }) {
  const nonDsa = form.rounds.filter((r) => r !== 'dsa').length;
  const questions = nonDsa * form.questionsPerRound + (form.rounds.includes('dsa') ? form.dsaProblems : 0);
  const weights = Object.entries(options.rubric_weights || {});
  const wsum = weights.reduce((n, [, w]) => n + Number(w || 0), 0) || 1;
  const orderedRounds = ROUND_ORDER.filter((r) => form.rounds.includes(r));
  return (
    <div className="lg:sticky lg:top-20 space-y-4">
      <Card title="Summary" subtitle={candidate ? `${candidate.name} · ${form.targetRole || candidate.target_role || '—'}` : undefined}>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">Rounds</dt><dd className="text-fg text-right">{orderedRounds.length ? orderedRounds.map(roundLabel).join(' → ') : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted flex items-center gap-1.5"><Hash size={13} /> Estimated questions</dt><dd className="text-fg tabular-nums">{questions}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted flex items-center gap-1.5"><Gauge size={13} /> Difficulty</dt><dd><Badge tone={toneForDifficulty(form.difficulty)}>{titleCase(form.difficulty)}{form.adaptive ? ' · adaptive' : ''}</Badge></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted flex items-center gap-1.5">{form.mode === 'voice' ? <Mic size={13} /> : <Keyboard size={13} />} Mode</dt><dd className="text-fg">{titleCase(form.mode)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted flex items-center gap-1.5"><Clock size={13} /> Duration</dt><dd className="text-fg tabular-nums">{form.durationMinutes} min</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted flex items-center gap-1.5"><FileText size={13} /> Resume retrieval</dt><dd className="text-fg">{form.useRag ? 'On' : 'Off'}</dd></div>
        </dl>

        {weights.length ? (
          <div className="mt-5 pt-4 divider">
            <div className="t-label mb-2">Scoring rubric</div>
            <div className="space-y-2">
              {weights.map(([key, w]) => (
                <div key={key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted">{RUBRIC_LABELS[key] || titleCase(key)}</span>
                  <span className="tabular-nums text-muted">{Math.round((Number(w) / wsum) * 100)}%</span>
                  <Progress value={Number(w)} max={wsum} tone="primary" height={5} className="col-span-2" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!options.llm_available && (
          <Alert tone="warning" title="AI model offline" className="mt-5">
            Questions will come from the curated question bank and answers will be scored heuristically. Every result is flagged with its source.
          </Alert>
        )}

        <div className="mt-5">
          {disabledReason ? (
            <Tooltip content={disabledReason}>
              <span className="block w-full"><Button icon={Sparkles} iconRight={ArrowRight} className="w-full" disabled>Start interview</Button></span>
            </Tooltip>
          ) : (
            <Button icon={Sparkles} iconRight={ArrowRight} className="w-full" onClick={onStart} loading={starting}>Start interview</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Form ────────────────────────────────────────────────────────────────── */
function SetupForm({ options, prefs, candidate, candidates, selectedId, onSelectCandidate }) {
  const navigate = useNavigate();
  const toast = useToast();
  const limits = options.limits || {};
  const qLimits = limits.questions_per_round || [2, 12];
  const dLimits = limits.dsa_problems || [1, 4];
  const tLimits = limits.duration_minutes || [10, 120];
  const defaults = options.defaults || {};
  const policy = options.policy || {};
  const voiceOk = !!options.voice_available;

  const [form, setForm] = useState(() => {
    const prefRounds = Array.isArray(prefs.default_rounds) ? prefs.default_rounds.filter((r) => ROUND_ORDER.includes(r)) : null;
    const suggested = candidate?.screening?.suggested_rounds?.filter((r) => ROUND_ORDER.includes(r));
    const mode = prefs.default_mode === 'voice' && voiceOk ? 'voice' : 'text';
    return {
      targetRole: candidate?.target_role || prefs.target_role || '',
      rounds: prefRounds?.length ? prefRounds : suggested?.length ? suggested : ROUND_ORDER,
      difficulty: (options.difficulties || []).includes(prefs.default_difficulty) ? prefs.default_difficulty : (defaults.difficulty || 'medium'),
      mode,
      questionsPerRound: clampInt(prefs.questions_per_round ?? defaults.questions_per_round, qLimits, 5),
      dsaProblems: clampInt(defaults.dsa_problems, dLimits, 2),
      durationMinutes: clampInt(defaults.duration_minutes, tLimits, 30),
      adaptive: typeof prefs.adaptive === 'boolean' ? prefs.adaptive : defaults.adaptive !== false,
      useRag: true,
      jobDescription: '',
    };
  });
  const [errors, setErrors] = useState({});
  const [starting, setStarting] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validate = () => {
    const errs = {};
    errs.targetRole = validateRole(form.targetRole);
    if (!form.rounds.length) errs.rounds = 'Select at least one round.';
    if (form.questionsPerRound < qLimits[0] || form.questionsPerRound > qLimits[1]) errs.questionsPerRound = `Must be between ${qLimits[0]} and ${qLimits[1]}.`;
    if (form.rounds.includes('dsa') && (form.dsaProblems < dLimits[0] || form.dsaProblems > dLimits[1])) errs.dsaProblems = `Must be between ${dLimits[0]} and ${dLimits[1]}.`;
    if (form.durationMinutes < tLimits[0] || form.durationMinutes > tLimits[1]) errs.durationMinutes = `Must be between ${tLimits[0]} and ${tLimits[1]} minutes.`;
    if (form.jobDescription.length > 4000) errs.jobDescription = 'Job description must be 4000 characters or fewer.';
    Object.keys(errs).forEach((k) => errs[k] == null && delete errs[k]);
    setErrors(errs);
    return !Object.keys(errs).length;
  };

  const rejected = candidate?.status === 'rejected';
  const disabledReason = !candidate ? 'Select a candidate profile first.' : rejected ? 'This resume did not pass screening. Upload an updated resume to continue.' : null;

  const start = async () => {
    if (!candidate || rejected) return;
    if (!validate()) { toast.error('Fix the highlighted fields before starting.'); return; }
    setStarting(true);
    try {
      const body = {
        rounds: ROUND_ORDER.filter((r) => form.rounds.includes(r)),
        difficulty: form.difficulty,
        mode: form.mode,
        questions_per_round: form.questionsPerRound,
        dsa_problems: form.dsaProblems,
        duration_minutes: form.durationMinutes,
        adaptive: form.adaptive,
        use_rag: form.useRag,
        job_description: form.jobDescription.trim(),
        target_role: form.targetRole.trim(),
      };
      const session = await startInterview(candidate.id, body);
      toast.success(`${session.persona?.name ? `${session.persona.name} will be your interviewer.` : 'Your interviewer is ready.'} Starting the ${roundLabel(session.current_round)} round.`, { title: 'Interview started' });
      navigate(session.current_round === 'dsa' ? `/interview/${session.session_id}/dsa` : `/interview/${session.session_id}`);
    } catch (e) {
      toast.error(errMsg(e), { title: 'Could not start the interview' });
      setStarting(false);
    }
  };

  const toggleRound = (id) => {
    setErrors((x) => ({ ...x, rounds: undefined }));
    set({ rounds: form.rounds.includes(id) ? form.rounds.filter((r) => r !== id) : [...form.rounds, id] });
  };
  const numField = (key, label, lim, help) => (
    <Input type="number" name={key} label={label} min={lim[0]} max={lim[1]} step={1} value={form[key]}
      onChange={(e) => { const n = parseInt(e.target.value, 10); set({ [key]: Number.isFinite(n) ? n : '' }); setErrors((x) => ({ ...x, [key]: undefined })); }}
      onBlur={() => set({ [key]: clampInt(form[key], lim, lim[0]) })}
      error={errors[key]} help={help} />
  );

  const difficultyHelp = policy.enabled !== false
    ? `Starting level. ${form.adaptive ? `With adaptive difficulty on, an answer scoring ≤ ${policy.decrease_max ?? 4} / 10 steps the level down and ≥ ${policy.increase_min ?? 8} / 10 steps it up.` : 'Adaptive difficulty is off, so this level stays fixed for the whole interview.'}`
    : 'Adaptive difficulty is disabled on the server; this level stays fixed.';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-6">
        {candidates.length > 1 && <CandidateSelector candidates={candidates} value={selectedId} onChange={onSelectCandidate} />}

        {rejected && (
          <Alert tone="error" title="This resume did not pass screening">
            Interviews cannot be started for a rejected profile. <button type="button" className="link" onClick={() => navigate(`/resume/${candidate.id}`)}>Review the analysis and upload an updated resume.</button>
          </Alert>
        )}

        <Card title="Interview" subtitle="Role, rounds and difficulty.">
          <div className="space-y-5">
            <RolePicker roles={options.target_roles || []} value={form.targetRole} onChange={(v) => { set({ targetRole: v }); setErrors((x) => ({ ...x, targetRole: undefined })); }} error={errors.targetRole} />
            <RoundCards rounds={options.rounds || []} selected={form.rounds} onToggle={toggleRound} error={errors.rounds} />
            <div>
              <div className="label">Difficulty</div>
              <SegmentedControl value={form.difficulty} onChange={(v) => set({ difficulty: v })}
                options={(options.difficulties || ['easy', 'medium', 'hard']).map((d) => ({ value: d, label: titleCase(d) }))} />
              <p className="help">{difficultyHelp}</p>
            </div>
            <div>
              <div className="label">Mode</div>
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl value={form.mode} onChange={(v) => set({ mode: v })}
                  options={[
                    { value: 'text', label: 'Text' },
                    { value: 'voice', label: 'Voice', disabled: !voiceOk, title: !voiceOk ? 'Voice services not configured on the server — text mode will be used' : undefined },
                  ]} />
                {!voiceOk && (
                  <Tooltip content="Voice services not configured on the server — text mode will be used">
                    <span className="inline-flex items-center gap-1 text-xs text-warning"><AlertCircle size={13} /> Voice unavailable</span>
                  </Tooltip>
                )}
              </div>
              <p className="help">{form.mode === 'voice' ? 'You will speak your answers; transcripts are evaluated as text.' : 'You will type your answers in the interview room.'}</p>
            </div>
          </div>
        </Card>

        <Card title="Pacing" subtitle="Question counts and time budget.">
          <div className="grid gap-4 sm:grid-cols-3">
            {numField('questionsPerRound', 'Questions per round', qLimits, `${qLimits[0]}–${qLimits[1]} for Technical and HR rounds.`)}
            {form.rounds.includes('dsa') && numField('dsaProblems', 'DSA problems', dLimits, `${dLimits[0]}–${dLimits[1]} coding problems.`)}
            {numField('durationMinutes', 'Duration (minutes)', tLimits, `${tLimits[0]}–${tLimits[1]} minutes overall.`)}
          </div>
        </Card>

        <Card title="Engine" subtitle="Adaptivity and resume grounding.">
          <div className="space-y-5">
            <Toggle checked={form.adaptive} onChange={(v) => set({ adaptive: v })} label="Adaptive difficulty" disabled={policy.enabled === false}
              description={policy.enabled === false
                ? 'Disabled on the server.'
                : `Score ≤ ${policy.decrease_max ?? 4} lowers the next question's difficulty; score ≥ ${policy.increase_min ?? 8} raises it. Levels: ${(policy.levels || ['easy', 'medium', 'hard']).map(titleCase).join(' → ')}.`} />
            <Toggle checked={form.useRag} onChange={(v) => set({ useRag: v })} label="Use resume retrieval (RAG)"
              description="Ground technical questions in retrieved resume chunks (projects, experience, skills). Turn off for generic role questions." />
            <Textarea name="job_description" label="Job description (optional)" rows={5} maxLength={4000} value={form.jobDescription}
              onChange={(e) => { set({ jobDescription: e.target.value }); setErrors((x) => ({ ...x, jobDescription: undefined })); }}
              placeholder="Paste the job posting to bias questions toward its requirements…"
              error={errors.jobDescription} help={`${form.jobDescription.length} / 4000 characters`} />
          </div>
        </Card>
      </div>

      <SummaryPanel form={form} options={options} candidate={candidate} onStart={start} starting={starting} disabledReason={disabledReason} />
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
function SetupSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">{[0, 1, 2].map((i) => <div key={i} className="card card-pad"><Skeleton lines={5} /></div>)}</div>
      <div className="card card-pad"><Skeleton lines={7} /></div>
    </div>
  );
}

export default function InterviewSetup() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const load = useCallback(() => Promise.all([
    getInterviewOptions(),
    getMyCandidates(),
    getPreferences().catch(() => ({ preferences: {} })), // preferences are optional
  ]), []);
  const { data, error, loading, reload } = useLoader(load);
  const [pickedId, setPickedId] = useState(null);

  const [options, mine, prefsRes] = data || [];
  const candidates = mine?.candidates || [];
  const has = (id) => !!id && candidates.some((c) => c.id === id);
  const selectedId = has(pickedId) ? pickedId : has(candidateId) ? candidateId : (mine?.latest?.id || candidates[0]?.id || null);
  const candidate = candidates.find((c) => c.id === selectedId) || null;

  let body;
  if (loading) body = <SetupSkeleton />;
  else if (error) body = <ErrorState title="Could not load interview options" description={errMsg(error)} onRetry={reload} />;
  else if (!candidates.length) {
    body = (
      <EmptyState icon={FileText} title="No resume on file" description="Upload and screen a resume first — the interview is built around it."
        action={<Button icon={FileText} onClick={() => navigate('/resume')}>Upload a resume</Button>} />
    );
  } else if (candidateId && !candidates.some((c) => c.id === candidateId)) {
    body = <ErrorState title="Candidate not found" description="That candidate profile does not exist or does not belong to your account." onRetry={() => navigate('/interview/setup')} />;
  } else {
    body = (
      <SetupForm key={selectedId} options={options} prefs={prefsRes?.preferences || {}} candidate={candidate}
        candidates={candidates} selectedId={selectedId} onSelectCandidate={setPickedId} />
    );
  }

  return (
    <AppShell title="New interview" wide>
      <PageHeader eyebrow="Step 2" title="Configure your interview"
        description="Pick the rounds, difficulty and mode. The interviewer adapts to your resume and your answers."
        actions={candidate && (
          <Button variant="ghost" icon={Users} onClick={() => navigate(`/resume/${candidate.id}`)}>View resume analysis</Button>
        )} />
      {body}
    </AppShell>
  );
}
