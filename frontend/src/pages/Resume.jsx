/* Resume upload + analysis dashboard (/resume, /resume/:candidateId). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  UploadCloud, FileText, Pencil, Check, X, Search, Database, Layers, Briefcase, GraduationCap, Award,
  Code2, Sparkles, ArrowRight, ArrowLeft, ChevronDown, ChevronRight, AlertCircle, Cpu, Clock, Hash,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  uploadResume, getMyCandidates, getCandidateProfile, getCandidateChunks, retrieveContext, updateCandidate, getInterviewOptions,
} from '../api/endpoints';
import {
  Button, Card, Badge, sourceTone, sourceLabel, Input, Select, Progress, ScoreRing, Tabs, Spinner, Skeleton,
  EmptyState, ErrorState, Alert, PageHeader, useToast, fmtDateTime, titleCase,
} from '../components/ui';

/* ── Constants / helpers ───────────────────────────────────────────────────── */
const ROLE_RE = /^[A-Za-z0-9.+# \-/()]+$/;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.docx'];
const OTHER = '__other__';

const statusTone = (s) => ({ screened: 'success', rejected: 'error', interviewing: 'primary', completed: 'accent', uploaded: 'neutral' }[s] || 'neutral');
const fmtBytes = (n) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const errMsg = (e) => e?.message || 'Request failed';

/** Generic async loader. `loadFn` must be referentially stable (wrap in useCallback). */
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
  return { data, error, loading: data == null && error == null, reload, setData };
}

/* ── Role picker (preset list + free-text "Other") ─────────────────────────── */
function RolePicker({ roles, value, onChange, error, label = 'Target role' }) {
  const inList = roles.includes(value);
  const [custom, setCustom] = useState(!inList && !!value);
  const options = [...roles.map((r) => ({ value: r, label: r })), { value: OTHER, label: 'Other (type your own)' }];
  return (
    <div className="space-y-2">
      <Select
        label={label} name="target_role" placeholder="Select a role" options={options}
        value={custom ? OTHER : (inList ? value : '')}
        onChange={(e) => {
          if (e.target.value === OTHER) { setCustom(true); onChange(''); } else { setCustom(false); onChange(e.target.value); }
        }}
        error={!custom ? error : undefined}
      />
      {custom && (
        <Input
          name="target_role_custom" placeholder="e.g. Platform Engineer" value={value} maxLength={100}
          onChange={(e) => onChange(e.target.value)} error={error}
          help={!error ? 'Letters, numbers, spaces and . + # - / ( ) only (2–100 characters).' : undefined}
        />
      )}
    </div>
  );
}

const validateRole = (role) => {
  const r = (role || '').trim();
  if (r.length < 2 || r.length > 100) return 'Target role must be between 2 and 100 characters.';
  if (!ROLE_RE.test(r)) return 'Target role contains invalid characters.';
  return null;
};

/* ── Uploader ──────────────────────────────────────────────────────────────── */
function validateFile(file) {
  if (!file) return 'Choose a file to upload.';
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!ALLOWED_EXT.includes(ext)) return `Unsupported file type ${ext}. Upload a PDF or DOCX.`;
  if (file.size > MAX_FILE_BYTES) return `File is ${fmtBytes(file.size)}. Maximum size is 5 MB.`;
  if (file.size === 0) return 'The file is empty.';
  return null;
}

function DropZone({ file, onFile, error, disabled }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (f) => { if (f) onFile(f); };
  return (
    <div>
      <div
        role="button" tabIndex={0} aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files?.[0]); }}
        className={clsx(
          'rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
          over ? 'border-primary bg-primary-soft' : error ? 'border-error/50 bg-error-soft/40' : 'border-border hover:border-border-strong bg-elevated/40',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} disabled={disabled} />
        <div className="mx-auto h-12 w-12 rounded-lg bg-surface border border-border grid place-items-center text-primary">
          {file ? <FileText size={22} /> : <UploadCloud size={22} />}
        </div>
        {file ? (
          <>
            <div className="mt-3 text-sm font-medium text-fg break-all">{file.name}</div>
            <div className="t-meta mt-1">{fmtBytes(file.size)} · click or drop to replace</div>
          </>
        ) : (
          <>
            <div className="mt-3 text-sm font-medium text-fg">Drop your resume here, or click to browse</div>
            <div className="t-meta mt-1">PDF or DOCX · up to 5 MB</div>
          </>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function Uploader({ onUploaded, onCancel, initialRole }) {
  const { user } = useAuth();
  const toast = useToast();
  const optionsLoad = useLoader(getInterviewOptions);
  const roles = optionsLoad.data?.target_roles || [];

  const [file, setFile] = useState(null);
  const [role, setRole] = useState(initialRole || '');
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('idle'); // idle | uploading | analyzing
  const [pct, setPct] = useState(0);
  const [serverError, setServerError] = useState(null);
  const busy = phase !== 'idle';

  const submit = async (e) => {
    e.preventDefault();
    const errs = { file: validateFile(file), role: validateRole(role) };
    setErrors(errs);
    if (errs.file || errs.role) return;
    if (!user?.full_name || !user?.email) { toast.error('Your account is missing a name or email; update your profile first.'); return; }
    setServerError(null);
    setPct(0);
    setPhase('uploading');
    try {
      const result = await uploadResume({
        name: user.full_name, email: user.email, targetRole: role.trim(), file,
        onProgress: (p) => { setPct(p); if (p >= 100) setPhase('analyzing'); },
      });
      if (result.decision === 'pass') toast.success(`Screening passed — ATS ${Math.round(result.ats_score)}%`, { title: 'Resume analysed' });
      else toast.error(result.rejection?.message || 'Resume did not pass screening.', { title: 'Screening did not pass' });
      onUploaded(result);
    } catch (err) {
      setServerError(errMsg(err));
      toast.error(errMsg(err), { title: 'Upload failed' });
    } finally {
      setPhase('idle');
    }
  };

  return (
    <Card title="Upload a resume" subtitle="We parse it, screen it against the target role, extract a structured profile and index it for retrieval."
      action={onCancel && <Button variant="ghost" size="sm" icon={X} onClick={onCancel} disabled={busy}>Cancel</Button>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <DropZone file={file} onFile={(f) => { setFile(f); setErrors((x) => ({ ...x, file: validateFile(f) })); }} error={errors.file} disabled={busy} />

        {optionsLoad.error ? (
          <Alert tone="warning" title="Could not load role presets">You can still type a role below. {errMsg(optionsLoad.error)}</Alert>
        ) : null}
        {optionsLoad.loading ? <Skeleton lines={2} /> : (
          <RolePicker roles={roles} value={role} onChange={(v) => { setRole(v); setErrors((x) => ({ ...x, role: undefined })); }} error={errors.role} />
        )}

        <div className="rounded-lg border border-border bg-elevated/50 px-4 py-3 text-xs text-muted flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-dim" />
          <span>Uploading as <span className="text-fg">{user?.full_name}</span> ({user?.email}). Re-uploading for the same account replaces the existing profile and clears its interview history.</span>
        </div>

        {busy && (
          <div className="space-y-2" aria-live="polite">
            {phase === 'uploading' ? (
              <>
                <div className="flex justify-between text-xs text-muted"><span>Uploading {file?.name}</span><span className="tabular-nums">{pct}%</span></div>
                <Progress value={pct} />
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner size={16} /> Analyzing resume… parsing, screening and indexing. This can take a little while.</div>
            )}
          </div>
        )}
        {serverError && <Alert tone="error" title="Upload failed">{serverError}</Alert>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="submit" icon={UploadCloud} loading={busy} disabled={busy || !file}>
            {phase === 'analyzing' ? 'Analyzing…' : phase === 'uploading' ? 'Uploading…' : 'Upload and analyse'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ── Analysis: header ─────────────────────────────────────────────────────── */
function InlineRole({ candidateId, value, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const error = editing ? validateRole(draft) : null;

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      const view = await updateCandidate(candidateId, { target_role: draft.trim() });
      onSaved(view);
      toast.success('Target role updated');
      setEditing(false);
    } catch (e) { toast.error(errMsg(e), { title: 'Could not update role' }); } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg group" onClick={() => { setDraft(value); setEditing(true); }} title="Edit target role">
        <Briefcase size={14} /> {value || 'No target role'} <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 max-w-md">
      <Input name="inline_role" value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1" error={error} maxLength={100} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }} />
      <div className="flex gap-1">
        <Button size="sm" icon={Check} onClick={save} loading={saving} disabled={!!error}>Save</Button>
        <Button size="sm" variant="ghost" icon={X} onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}

function SkillBadges({ skills, tone }) {
  if (!skills?.length) return <span className="t-meta">None</span>;
  return <div className="flex flex-wrap gap-1.5">{skills.map((s, i) => <Badge key={`${s}-${i}`} tone={tone}>{s}</Badge>)}</div>;
}

function ScreeningCard({ view }) {
  const s = view.screening || {};
  const heuristic = s.source === 'heuristic';
  return (
    <Card title="ATS screening" subtitle={`Decision: ${s.decision ? titleCase(s.decision) : '—'}${s.experience_level ? ` · ${titleCase(s.experience_level)} level` : ''}`}
      action={<Badge tone={sourceTone(s.source)} dot>{sourceLabel(s.source)}</Badge>}>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <ScoreRing value={view.ats_score} size={120} label="ATS score" />
          {heuristic && <span className="t-meta text-center max-w-[160px]">Keyword estimate, not a semantic assessment</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          {heuristic && (
            <Alert tone="warning" title="Heuristic screening">
              The AI screener was unavailable, so this score counts role keywords and resume sections. It is an informational estimate, not a semantic assessment.
            </Alert>
          )}
          <div>
            <div className="t-label mb-2">Matched skills <span className="kbd ml-1">{s.matched_skills?.length || 0}</span></div>
            <SkillBadges skills={s.matched_skills} tone="success" />
          </div>
          <div>
            <div className="t-label mb-2">Missing skills <span className="kbd ml-1">{s.missing_skills?.length || 0}</span></div>
            <SkillBadges skills={s.missing_skills} tone="neutral" />
          </div>
          {s.reasoning && (
            <div>
              <div className="t-label mb-1.5">Reasoning</div>
              <p className="t-body whitespace-pre-line">{s.reasoning}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── Analysis: profile sections ───────────────────────────────────────────── */
function SectionEmpty({ children }) { return <p className="t-meta">{children}</p>; }

function ProfileSections({ profile }) {
  const p = profile || {};
  const projects = p.projects || [];
  const experience = p.experience || [];
  const education = p.education || [];
  const certs = p.certifications || [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Summary" className="lg:col-span-2" action={p.extraction_source && <Badge tone={sourceTone(p.extraction_source)}>Extraction: {sourceLabel(p.extraction_source)}</Badge>}>
        {p.summary ? <p className="t-body whitespace-pre-line">{p.summary}</p> : <SectionEmpty>No summary was extracted from the resume.</SectionEmpty>}
      </Card>

      <Card title="Skills" subtitle={`${p.skills?.length || 0} skills · ${p.programming_languages?.length || 0} programming languages`}>
        <SkillBadges skills={p.skills} tone="neutral" />
        {p.programming_languages?.length ? (
          <div className="mt-4">
            <div className="t-label mb-2 flex items-center gap-1.5"><Code2 size={12} /> Programming languages</div>
            <SkillBadges skills={p.programming_languages} tone="primary" />
          </div>
        ) : null}
      </Card>

      <Card title="Education" subtitle={`${education.length} entries`}>
        {education.length ? (
          <ul className="space-y-3">
            {education.map((e, i) => (
              <li key={i} className="flex gap-3">
                <GraduationCap size={16} className="mt-0.5 text-dim shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{e.degree || 'Degree'}</div>
                  <div className="t-meta">{[e.institution, e.year].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : <SectionEmpty>No education entries detected.</SectionEmpty>}
        {certs.length ? (
          <div className="mt-5 pt-4 divider">
            <div className="t-label mb-2 flex items-center gap-1.5"><Award size={12} /> Certifications</div>
            <ul className="space-y-1.5">{certs.map((c, i) => <li key={i} className="text-sm text-muted">{c}</li>)}</ul>
          </div>
        ) : null}
      </Card>

      <Card title="Projects" subtitle={`${projects.length} projects`} className="lg:col-span-2">
        {projects.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((pr, i) => (
              <div key={i} className="rounded-lg border border-border bg-elevated/40 p-4">
                <div className="text-sm font-medium text-fg">{pr.name || `Project ${i + 1}`}</div>
                {pr.description && <p className="t-body mt-1">{pr.description}</p>}
                {pr.tech?.length ? <div className="flex flex-wrap gap-1.5 mt-3">{pr.tech.map((t, j) => <Badge key={j} tone="accent">{t}</Badge>)}</div> : null}
                {pr.highlights?.length ? (
                  <ul className="mt-3 space-y-1 list-disc pl-4">{pr.highlights.map((h, j) => <li key={j} className="text-xs text-muted">{h}</li>)}</ul>
                ) : null}
              </div>
            ))}
          </div>
        ) : <SectionEmpty>No projects detected.</SectionEmpty>}
      </Card>

      <Card title="Experience" subtitle={`${experience.length} roles`} className="lg:col-span-2">
        {experience.length ? (
          <ol className="relative border-l border-border ml-2 space-y-6">
            {experience.map((x, i) => (
              <li key={i} className="pl-5 relative">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-surface" />
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <div className="text-sm font-medium text-fg">{x.role || 'Role'}{x.company ? <span className="text-muted font-normal"> · {x.company}</span> : null}</div>
                  {x.duration && <span className="t-meta flex items-center gap-1"><Clock size={11} /> {x.duration}</span>}
                </div>
                {x.points?.length ? <ul className="mt-2 space-y-1 list-disc pl-4">{x.points.map((pt, j) => <li key={j} className="text-sm text-muted">{pt}</li>)}</ul> : null}
              </li>
            ))}
          </ol>
        ) : <SectionEmpty>No work experience detected.</SectionEmpty>}
      </Card>
    </div>
  );
}

/* ── Analysis: document stats ─────────────────────────────────────────────── */
function DocumentStats({ resume }) {
  const r = resume || {};
  const sections = Object.entries(r.sections || {}).sort((a, b) => b[1] - a[1]);
  const total = sections.reduce((n, [, c]) => n + c, 0) || r.chunk_count || 1;
  const stats = [
    ['File', r.filename || '—'], ['Pages', r.pages ?? '—'], ['Words', r.word_count != null ? r.word_count.toLocaleString() : '—'],
    ['Chunks indexed', r.chunk_count ?? '—'], ['Parsed', fmtDateTime(r.parsed_at)],
  ];
  return (
    <Card title="Resume document" subtitle="Parsing and indexing statistics"
      action={r.embedding_backend && <Badge tone={r.embedding_backend === 'hashing' ? 'warning' : 'primary'}><Cpu size={12} /> {r.embedding_backend}</Badge>}>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-elevated/50 border border-border px-3 py-2 min-w-0">
            <dt className="t-label">{k}</dt>
            <dd className="text-sm text-fg mt-0.5 truncate" title={String(v)}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <div className="t-label mb-2">Chunks per section</div>
        {sections.length ? (
          <div className="space-y-2">
            {sections.map(([name, count]) => (
              <div key={name} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-xs">
                <span className="text-muted truncate">{titleCase(name)}</span>
                <Progress value={count} max={total} tone="accent" height={5} />
                <span className="tabular-nums text-right text-muted">{count}</span>
              </div>
            ))}
          </div>
        ) : <p className="t-meta">No section histogram available (retrieval service not running or resume not indexed).</p>}
      </div>
      {r.available === false && <Alert tone="warning" className="mt-4">The original resume file is no longer stored on the server.</Alert>}
    </Card>
  );
}

/* ── RAG inspector ────────────────────────────────────────────────────────── */
function RetrievalTest({ candidateId }) {
  const [query, setQuery] = useState('');
  const [k, setK] = useState('4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const run = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setError('Enter at least 2 characters.'); return; }
    setBusy(true); setError(null);
    try { setResult(await retrieveContext(candidateId, q, Number(k))); } catch (err) { setError(errMsg(err)); setResult(null); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex flex-col sm:flex-row gap-2 sm:items-end" noValidate>
        <Input name="rag_query" label="Query" placeholder="e.g. experience with distributed systems" value={query} maxLength={500}
          onChange={(e) => setQuery(e.target.value)} className="flex-1" />
        <Select name="rag_k" label="Top k" value={k} onChange={(e) => setK(e.target.value)} options={['1', '2', '3', '4', '6', '8', '10']} className="w-full sm:w-28" />
        <Button type="submit" icon={Search} loading={busy} className="sm:mb-0">Retrieve</Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 t-meta">
            <Badge tone="neutral">{result.results?.length || 0} results</Badge>
            <Badge tone="neutral"><Clock size={11} /> {result.latency_ms} ms</Badge>
            {result.backend && <Badge tone="neutral"><Cpu size={11} /> {result.backend}</Badge>}
            <span>for “{result.query}”</span>
          </div>
          {result.results?.length ? result.results.map((r, i) => (
            <div key={r.chunk_id || i} className="rounded-lg border border-border bg-elevated/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="kbd">#{i + 1}</span>
                  <Badge tone="primary">{titleCase(r.section)} · {r.chunk_index}</Badge>
                </div>
                <span className="text-xs tabular-nums text-muted">score {typeof r.score === 'number' ? r.score.toFixed(3) : r.score}</span>
              </div>
              <p className="text-sm text-muted whitespace-pre-line leading-relaxed">{r.text || r.preview}</p>
            </div>
          )) : <p className="t-meta">No chunks matched this query.</p>}
        </div>
      )}
    </div>
  );
}

function ChunkGroup({ section, chunks }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm bg-elevated/50 hover:bg-elevated transition-colors" aria-expanded={open}>
        <span className="flex items-center gap-2 font-medium text-fg">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {titleCase(section)}</span>
        <span className="kbd">{chunks.length}</span>
      </button>
      {open && (
        <ul className="divide-y divide-border">
          {chunks.map((c) => (
            <li key={c.chunk_id} className="px-4 py-3">
              <div className="t-meta mb-1 flex items-center gap-1"><Hash size={11} /> chunk {c.chunk_index}</div>
              <p className="text-sm text-muted whitespace-pre-line leading-relaxed">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IndexedChunks({ candidateId }) {
  const load = useCallback(() => getCandidateChunks(candidateId), [candidateId]);
  const { data, error, loading, reload } = useLoader(load);
  const groups = useMemo(() => {
    const map = new Map();
    (data?.chunks || []).forEach((c) => { const key = c.section || 'other'; if (!map.has(key)) map.set(key, []); map.get(key).push(c); });
    return [...map.entries()].map(([section, chunks]) => [section, chunks.sort((a, b) => a.chunk_index - b.chunk_index)]);
  }, [data]);
  if (loading) return <Skeleton lines={4} />;
  if (error) return <ErrorState title="Could not load chunks" description={errMsg(error)} onRetry={reload} className="py-6" />;
  if (!groups.length) return <EmptyState icon={Database} title="No indexed chunks" description={data?.backend ? 'This resume has not been indexed for retrieval.' : 'The retrieval service is not running on the server.'} className="py-8" />;
  return (
    <div className="space-y-2">
      <div className="t-meta flex items-center gap-2">{data.chunks.length} chunks in {groups.length} sections{data.backend ? <Badge tone="neutral"><Cpu size={11} /> {data.backend}</Badge> : null}</div>
      {groups.map(([section, chunks]) => <ChunkGroup key={section} section={section} chunks={chunks} />)}
    </div>
  );
}

function RagInspector({ candidateId }) {
  const [tab, setTab] = useState('retrieve');
  return (
    <Card title="RAG inspector" subtitle="See exactly what the interviewer can retrieve from this resume.">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'retrieve', label: 'Retrieval test' }, { value: 'chunks', label: 'Indexed chunks' }]} className="mb-4" />
      {tab === 'retrieve' ? <RetrievalTest candidateId={candidateId} /> : <IndexedChunks candidateId={candidateId} />}
    </Card>
  );
}

/* ── Analysis view ────────────────────────────────────────────────────────── */
function AnalysisView({ view, onViewChange, onReupload }) {
  const navigate = useNavigate();
  const rejected = view.status === 'rejected';
  const missing = view.screening?.missing_skills || [];
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <PageHeader
          eyebrow="Resume analysis"
          title={view.name}
          className="mb-3"
          actions={
            <>
              <Badge tone={statusTone(view.status)} dot>{titleCase(view.status)}</Badge>
              <Button variant="secondary" icon={UploadCloud} onClick={onReupload}>Upload a new resume</Button>
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <InlineRole candidateId={view.id} value={view.target_role} onSaved={onViewChange} />
          <span className="t-meta">{view.email}</span>
          <span className="t-meta">Uploaded {fmtDateTime(view.created_at)}</span>
        </div>
      </div>

      {rejected && (
        <Alert tone="error" title="This resume did not pass screening for the selected role">
          {missing.length ? <>Missing skills: {missing.join(', ')}. </> : null}
          Update your resume to cover the gaps (or choose a different target role) and upload it again. Interviews cannot be started for a rejected profile.
        </Alert>
      )}

      <ScreeningCard view={view} />
      <ProfileSections profile={view.profile} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentStats resume={view.resume} />
        <RagInspector candidateId={view.id} />
      </div>

      <div className="card card-pad flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">{rejected ? 'Interview locked' : 'Ready for a mock interview?'}</div>
          <div className="t-meta">{rejected ? 'Screening did not pass — re-upload an updated resume to unlock interviews.' : 'Configure rounds, difficulty and mode, then start.'}</div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 shrink-0">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
          {rejected
            ? <Button icon={UploadCloud} onClick={onReupload}>Re-upload resume</Button>
            : <Button icon={Sparkles} iconRight={ArrowRight} onClick={() => navigate(`/interview/setup/${view.id}`)}>Configure interview</Button>}
        </div>
      </div>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton lines={2} className="max-w-md" />
      <div className="card card-pad"><div className="flex gap-6"><div className="skeleton h-[120px] w-[120px] rounded-full shrink-0" /><Skeleton lines={5} className="flex-1" /></div></div>
      <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="card card-pad"><Skeleton lines={4} /></div>)}</div>
    </div>
  );
}

function CandidateAnalysis({ candidateId, onReupload }) {
  const load = useCallback(() => getCandidateProfile(candidateId), [candidateId]);
  const { data, error, loading, reload, setData } = useLoader(load);
  if (loading) return <AnalysisSkeleton />;
  if (error) {
    return (
      <ErrorState title={error.status === 404 ? 'Resume not found' : 'Could not load the analysis'} description={errMsg(error)} onRetry={reload} />
    );
  }
  return <AnalysisView view={data} onViewChange={(v) => setData((prev) => ({ ...prev, ...v, resume: { ...prev.resume, ...(v.resume || {}) } }))} onReupload={onReupload} />;
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function Resume() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const [showUploader, setShowUploader] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // remounts the analysis after a re-upload of the same profile

  const loadMine = useCallback(() => (candidateId ? Promise.resolve(null) : getMyCandidates()), [candidateId]);
  const mine = useLoader(loadMine);
  const latestId = mine.data?.latest?.id || null;
  const latestRole = mine.data?.latest?.target_role;
  const activeId = candidateId || latestId;

  const onUploaded = (result) => {
    setShowUploader(false);
    setRefreshKey((k) => k + 1);
    navigate(`/resume/${result.candidate_id}`, { replace: !!candidateId });
    if (!candidateId) mine.reload();
  };

  let body;
  if (!candidateId && mine.loading) body = <AnalysisSkeleton />;
  else if (!candidateId && mine.error) body = <ErrorState title="Could not load your resumes" description={errMsg(mine.error)} onRetry={mine.reload} />;
  else if (showUploader || !activeId) {
    body = (
      <div className="space-y-6 animate-fade-up">
        {!activeId && (
          <PageHeader eyebrow="Step 1" title="Upload your resume" description="Your resume powers every round: screening, resume-aware technical questions and retrieval during the interview." />
        )}
        <div className="max-w-2xl">
          <Uploader onUploaded={onUploaded} onCancel={activeId ? () => setShowUploader(false) : undefined} initialRole={latestRole} />
        </div>
        {!activeId && (
          <EmptyState icon={Layers} title="No resume on file yet" description="Once analysed, you will see your ATS score, extracted profile and the RAG inspector here." className="max-w-2xl py-8" />
        )}
      </div>
    );
  } else {
    body = <CandidateAnalysis key={`${activeId}-${refreshKey}`} candidateId={activeId} onReupload={() => setShowUploader(true)} />;
  }

  return <AppShell title="Resume">{body}</AppShell>;
}
