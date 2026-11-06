/* History — every interview session for the current user, with filters and actions. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, FileText, Play, XCircle, Sparkles, RefreshCw } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { listInterviews, cancelInterview } from '../api/endpoints';
import {
  Button, Card, Badge, toneForScore, toneForDifficulty, SegmentedControl, Modal, Skeleton, EmptyState, ErrorState, PageHeader, useToast,
  fmtDateTime, fmtDuration, fmtScore, titleCase, roundLabel,
} from '../components/ui';

const STATUS_TONE = { completed: 'success', active: 'accent', cancelled: 'neutral' };
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
];
const continueRoute = (s) => (s.current_round === 'dsa' ? `/interview/${s.session_id}/dsa` : `/interview/${s.session_id}`);
const fetchSessions = () => listInterviews({ limit: 200 }).then((d) => d.sessions || []);
const EMPTY = [];

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
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload, setData };
}

/* ── Row pieces ─────────────────────────────────────────────────────────── */
function RoundBadges({ rounds, roundScores }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(rounds || []).map((r) => {
        const sc = roundScores?.[r];
        return (
          <Badge key={r} tone={sc != null ? toneForScore(sc) : 'neutral'}>
            {roundLabel(r).replace(' Coding', '').replace(' / Behavioural', '')}{sc != null ? ` ${fmtScore(sc, 0)}` : ''}
          </Badge>
        );
      })}
    </div>
  );
}

function Actions({ s, onCancel }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      {s.status === 'completed' && (
        <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/results/${s.session_id}`)}>View report</Button>
      )}
      {s.status === 'active' && (
        <>
          <Button size="sm" variant="primary" icon={Play} onClick={() => navigate(continueRoute(s))}>Continue</Button>
          <Button size="sm" variant="danger" icon={XCircle} onClick={() => onCancel(s)}>Cancel</Button>
        </>
      )}
      {s.status === 'cancelled' && <span className="t-meta self-center">No actions</span>}
    </div>
  );
}

function SessionTable({ sessions, onCancel }) {
  return (
    <div className="card overflow-x-auto hidden md:block">
      <table className="table min-w-[900px]">
        <thead>
          <tr>
            <th>Date</th><th>Role</th><th>Rounds</th><th>Mode</th><th>Difficulty</th><th className="text-right">Score</th><th>Duration</th><th>Questions</th><th>Status</th><th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.session_id} className="hover:bg-elevated/50 transition-colors">
              <td className="whitespace-nowrap">
                <div className="text-fg">{fmtDateTime(s.started_at)}</div>
                {s.candidate_name && <div className="t-meta">{s.candidate_name}</div>}
              </td>
              <td className="text-fg">{s.target_role || '—'}</td>
              <td><RoundBadges rounds={s.rounds} roundScores={s.round_scores} /></td>
              <td>{titleCase(s.mode || 'text')}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={toneForDifficulty(s.difficulty)}>{titleCase(s.difficulty || 'medium')}</Badge>
                  {s.adaptive && <Badge tone="primary">Adaptive</Badge>}
                </div>
              </td>
              <td className="text-right">
                {s.overall_score != null ? <Badge tone={toneForScore(s.overall_score)}>{fmtScore(s.overall_score)}%</Badge> : '—'}
              </td>
              <td className="whitespace-nowrap">{fmtDuration(s.duration_seconds)}</td>
              <td className="tabular-nums">{s.total_questions ?? 0}</td>
              <td><Badge tone={STATUS_TONE[s.status] || 'neutral'} dot>{titleCase(s.status)}</Badge></td>
              <td><Actions s={s} onCancel={onCancel} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionCards({ sessions, onCancel }) {
  return (
    <div className="space-y-3 md:hidden">
      {sessions.map((s) => (
        <Card key={s.session_id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{s.target_role || 'Interview'}</div>
              <div className="t-meta">{fmtDateTime(s.started_at)}</div>
            </div>
            <Badge tone={STATUS_TONE[s.status] || 'neutral'} dot>{titleCase(s.status)}</Badge>
          </div>
          <div className="mt-3"><RoundBadges rounds={s.rounds} roundScores={s.round_scores} /></div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="t-meta">Score</dt><dd>{s.overall_score != null ? <Badge tone={toneForScore(s.overall_score)}>{fmtScore(s.overall_score)}%</Badge> : '—'}</dd></div>
            <div><dt className="t-meta">Mode</dt><dd className="text-muted">{titleCase(s.mode || 'text')}</dd></div>
            <div><dt className="t-meta">Difficulty</dt><dd className="flex flex-wrap gap-1"><Badge tone={toneForDifficulty(s.difficulty)}>{titleCase(s.difficulty || 'medium')}</Badge>{s.adaptive && <Badge tone="primary">Adaptive</Badge>}</dd></div>
            <div><dt className="t-meta">Duration · Questions</dt><dd className="text-muted">{fmtDuration(s.duration_seconds)} · {s.total_questions ?? 0}</dd></div>
          </dl>
          <div className="mt-4"><Actions s={s} onCancel={onCancel} /></div>
        </Card>
      ))}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="card card-pad space-y-4">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} lines={2} />)}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function History() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload: load, setData: setSessions } = useRequest(fetchSessions);
  const sessions = data || EMPTY;
  const [filter, setFilter] = useState('all');
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const counts = useMemo(() => sessions.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {}), [sessions]);
  const visible = useMemo(() => (filter === 'all' ? sessions : sessions.filter((s) => s.status === filter)), [sessions, filter]);

  const confirmCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      await cancelInterview(toCancel.session_id);
      setSessions((prev) => (prev || []).map((s) => (s.session_id === toCancel.session_id ? { ...s, status: 'cancelled', ended_at: new Date().toISOString() } : s)));
      toast.success('Interview cancelled.');
      setToCancel(null);
    } catch (e) {
      toast.error(e.message || 'Could not cancel the interview.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AppShell title="History" wide>
      <PageHeader
        title="Interview history"
        description={loading ? 'Loading your sessions…' : `${sessions.length} session${sessions.length === 1 ? '' : 's'} on record.`}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
            <Button icon={Sparkles} onClick={() => navigate('/interview/setup')}>New interview</Button>
          </>
        }
      />

      <SegmentedControl
        className="mb-4 max-w-full overflow-x-auto"
        value={filter} onChange={setFilter}
        options={FILTERS.map((f) => ({ ...f, label: f.value === 'all' ? `All (${sessions.length})` : `${f.label} (${counts[f.value] || 0})` }))}
      />

      {loading ? <HistorySkeleton /> : error ? (
        <ErrorState title="Could not load your history" description={error} onRetry={load} />
      ) : sessions.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No interviews yet" description="Your completed and in-progress mock interviews will appear here." action={<Button icon={Sparkles} onClick={() => navigate('/interview/setup')}>Start your first interview</Button>} />
      ) : visible.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={`No ${filter} sessions`} description="Try a different filter." action={<Button variant="secondary" onClick={() => setFilter('all')}>Show all</Button>} />
      ) : (
        <>
          <SessionTable sessions={visible} onCancel={setToCancel} />
          <SessionCards sessions={visible} onCancel={setToCancel} />
        </>
      )}

      <Modal
        open={!!toCancel} onClose={() => !cancelling && setToCancel(null)} size="sm"
        title="Cancel this interview?"
        description={toCancel ? `${toCancel.target_role || 'Interview'} started ${fmtDateTime(toCancel.started_at)}. Progress so far will be kept but the session cannot be resumed.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToCancel(null)} disabled={cancelling}>Keep going</Button>
            <Button variant="danger" onClick={confirmCancel} loading={cancelling} icon={XCircle}>Cancel interview</Button>
          </>
        }
      />
    </AppShell>
  );
}
