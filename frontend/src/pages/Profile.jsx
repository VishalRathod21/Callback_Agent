/* Profile & settings — account, security, interview preferences, resumes and the danger zone. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, ShieldCheck, Settings2, FileText, AlertTriangle, LogOut, KeyRound, Save, Trash2, ExternalLink, BadgeCheck } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  updateProfile, changePassword, getPreferences, updatePreferences, getMyCandidates, deleteCandidate, deleteAccount, logoutAll,
} from '../api/endpoints';
import {
  Button, Card, Badge, toneForScore, Input, Select, Toggle, SegmentedControl, Tabs, Modal, Skeleton, EmptyState, ErrorState, Alert, PageHeader, useToast,
  fmtDate, fmtScore, titleCase, roundLabel,
} from '../components/ui';

const TABS = [
  { value: 'account', label: 'Account' },
  { value: 'security', label: 'Security' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'resumes', label: 'Resumes' },
  { value: 'danger', label: 'Danger zone' },
];
const ROUNDS = ['dsa', 'technical', 'hr'];
const QUESTION_COUNTS = Array.from({ length: 11 }, (_, i) => ({ value: String(i + 2), label: `${i + 2} questions` }));
const STATUS_TONE = { screened: 'success', uploaded: 'warning', interviewing: 'accent', completed: 'success', rejected: 'error' };
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const DEFAULT_PREFS = { default_mode: 'text', default_difficulty: 'medium', default_rounds: [...ROUNDS], questions_per_round: 5, adaptive: true, target_role: '' };
const fetchPrefs = () => getPreferences().then((d) => ({ ...DEFAULT_PREFS, ...(d.preferences || {}) }));
const fetchCandidates = () => getMyCandidates().then((d) => d.candidates || []);

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

/* ── Account ────────────────────────────────────────────────────────────── */
function AccountTab({ user }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: user?.full_name || '', email: user?.email || '' });
  const [saved, setSaved] = useState(null); // last server response (keeps the UI fresh without a reload)
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const current = saved || user || {};
  const dirty = form.full_name !== (current.full_name || '') || form.email !== (current.email || '');

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.full_name.trim().length < 2) errs.full_name = 'Name must be at least 2 characters.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = {};
      if (form.full_name.trim() !== current.full_name) body.full_name = form.full_name.trim();
      if (form.email !== current.email) body.email = form.email;
      const res = await updateProfile(body);
      setSaved(res);
      setForm({ full_name: res.full_name, email: res.email });
      toast.success(body.email ? 'Profile updated. Please verify your new email address.' : 'Profile updated.');
    } catch (err) {
      toast.error(err.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Profile" subtitle="Your name and sign-in email" className="lg:col-span-2">
        <form onSubmit={submit} className="space-y-4">
          <Input label="Full name" name="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} autoComplete="name" />
          <Input label="Email" name="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} help="Changing your email will require re-verification." autoComplete="email" />
          <div className="flex justify-end">
            <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>Save changes</Button>
          </div>
        </form>
      </Card>
      <Card title="Account status">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Email</dt>
            <dd>{current.is_verified ? <Badge tone="success"><BadgeCheck size={12} />Verified</Badge> : <Badge tone="warning">Unverified</Badge>}</dd>
          </div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted">Member since</dt><dd className="font-medium">{fmtDate(current.created_at)}</dd></div>
          {current.last_login && <div className="flex items-center justify-between gap-3"><dt className="text-muted">Last sign-in</dt><dd className="font-medium">{fmtDate(current.last_login)}</dd></div>}
        </dl>
        {saved && saved.full_name !== user?.full_name && <p className="help mt-4">The sidebar will show your new name after your next sign-in or page refresh.</p>}
      </Card>
    </div>
  );
}

/* ── Security ───────────────────────────────────────────────────────────── */
function SecurityTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [form, setForm] = useState({ old_password: '', new_password: '', new_password_confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.old_password.length < 8) errs.old_password = 'Enter your current password.';
    if (!PASSWORD_RULE.test(form.new_password)) errs.new_password = 'At least 8 characters with a letter and a number.';
    if (form.new_password !== form.new_password_confirm) errs.new_password_confirm = 'Passwords do not match.';
    if (form.new_password && form.new_password === form.old_password) errs.new_password = 'New password must differ from the current one.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const res = await changePassword(form);
      toast.success(res.message || 'Password changed.');
      setForm({ old_password: '', new_password: '', new_password_confirm: '' });
    } catch (err) {
      toast.error(err.message || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  const signOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await logoutAll();
      toast.success('Signed out from all devices.');
      await logout();
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Could not sign out everywhere.');
      setSigningOut(false);
      setConfirmAll(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Change password" subtitle="Use at least 8 characters including a letter and a number" className="lg:col-span-2">
        <form onSubmit={submit} className="space-y-4">
          <Input label="Current password" name="old_password" type="password" value={form.old_password} onChange={(e) => setForm({ ...form, old_password: e.target.value })} error={errors.old_password} autoComplete="current-password" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="New password" name="new_password" type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} error={errors.new_password} autoComplete="new-password" />
            <Input label="Confirm new password" name="new_password_confirm" type="password" value={form.new_password_confirm} onChange={(e) => setForm({ ...form, new_password_confirm: e.target.value })} error={errors.new_password_confirm} autoComplete="new-password" />
          </div>
          <div className="flex justify-end"><Button type="submit" icon={KeyRound} loading={saving}>Update password</Button></div>
        </form>
      </Card>
      <Card title="Sessions" subtitle="Devices signed in to your account">
        <p className="t-body">Signing out everywhere revokes every refresh token, including this device. You will need to sign in again.</p>
        <Button variant="secondary" icon={LogOut} className="mt-4 w-full" onClick={() => setConfirmAll(true)}>Sign out everywhere</Button>
      </Card>
      <Modal
        open={confirmAll} onClose={() => !signingOut && setConfirmAll(false)} size="sm"
        title="Sign out of all devices?" description="All active sessions will be revoked and you will be returned to the landing page."
        footer={<><Button variant="secondary" onClick={() => setConfirmAll(false)} disabled={signingOut}>Cancel</Button><Button icon={LogOut} onClick={signOutEverywhere} loading={signingOut}>Sign out everywhere</Button></>}
      />
    </div>
  );
}

/* ── Preferences ────────────────────────────────────────────────────────── */
function PreferencesTab() {
  const toast = useToast();
  const { data: prefs, loading, error, reload: load, setData: setPrefs } = useRequest(fetchPrefs);
  const [saving, setSaving] = useState(false);

  const toggleRound = (r) => {
    const has = prefs.default_rounds.includes(r);
    if (has && prefs.default_rounds.length === 1) return;
    setPrefs({ ...prefs, default_rounds: has ? prefs.default_rounds.filter((x) => x !== r) : ROUNDS.filter((x) => x === r || prefs.default_rounds.includes(x)) });
  };

  const save = async (e) => {
    e.preventDefault();
    if (prefs.target_role && prefs.target_role.trim().length < 2) { toast.error('Target role must be at least 2 characters.'); return; }
    setSaving(true);
    try {
      const body = {
        default_mode: prefs.default_mode, default_difficulty: prefs.default_difficulty, default_rounds: prefs.default_rounds,
        questions_per_round: Number(prefs.questions_per_round), adaptive: prefs.adaptive,
      };
      if (prefs.target_role?.trim()) body.target_role = prefs.target_role.trim();
      const res = await updatePreferences(body);
      setPrefs({ ...DEFAULT_PREFS, ...(res.preferences || {}) });
      toast.success('Preferences saved. New interviews will use these defaults.');
    } catch (err) {
      toast.error(err.message || 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) return error ? <ErrorState title="Could not load preferences" description={error} onRetry={load} /> : <Card><Skeleton lines={6} /></Card>;

  return (
    <form onSubmit={save} className="grid lg:grid-cols-3 gap-4">
      <Card title="Interview defaults" subtitle="Pre-filled on the interview setup page" className="lg:col-span-2">
        <div className="space-y-5">
          <div>
            <span className="label">Default mode</span>
            <SegmentedControl value={prefs.default_mode} onChange={(v) => setPrefs({ ...prefs, default_mode: v })} options={[{ value: 'text', label: 'Text' }, { value: 'voice', label: 'Voice' }]} />
            <p className="help">Voice falls back to text when speech services are not configured.</p>
          </div>
          <div>
            <span className="label">Default difficulty</span>
            <SegmentedControl value={prefs.default_difficulty} onChange={(v) => setPrefs({ ...prefs, default_difficulty: v })} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
          </div>
          <div>
            <span className="label">Default rounds</span>
            <div className="grid sm:grid-cols-3 gap-2">
              {ROUNDS.map((r) => {
                const on = prefs.default_rounds.includes(r);
                return (
                  <label key={r} className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 cursor-pointer transition-colors ${on ? 'border-primary bg-primary-soft' : 'border-border bg-elevated hover:border-border-strong'}`}>
                    <input type="checkbox" className="accent-primary h-4 w-4" checked={on} onChange={() => toggleRound(r)} />
                    <span className="text-sm">{roundLabel(r)}</span>
                  </label>
                );
              })}
            </div>
            <p className="help">At least one round is required.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Questions per round" name="questions_per_round" value={String(prefs.questions_per_round)} onChange={(e) => setPrefs({ ...prefs, questions_per_round: Number(e.target.value) })} options={QUESTION_COUNTS} />
            <Input label="Default target role" name="target_role" placeholder="e.g. Backend Developer" value={prefs.target_role || ''} onChange={(e) => setPrefs({ ...prefs, target_role: e.target.value })} />
          </div>
          <Toggle checked={!!prefs.adaptive} onChange={(v) => setPrefs({ ...prefs, adaptive: v })} label="Adaptive difficulty" description="Raise or lower question difficulty based on how each answer scores." />
        </div>
      </Card>
      <Card title="Summary">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">Mode</dt><dd className="font-medium">{titleCase(prefs.default_mode)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Difficulty</dt><dd><Badge tone={{ easy: 'success', medium: 'warning', hard: 'error' }[prefs.default_difficulty]}>{titleCase(prefs.default_difficulty)}</Badge></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Rounds</dt><dd className="font-medium text-right">{prefs.default_rounds.map(roundLabel).join(', ')}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Questions / round</dt><dd className="font-medium">{prefs.questions_per_round}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Adaptive</dt><dd className="font-medium">{prefs.adaptive ? 'On' : 'Off'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Target role</dt><dd className="font-medium text-right">{prefs.target_role || '—'}</dd></div>
        </dl>
        <Button type="submit" icon={Save} loading={saving} className="mt-5 w-full">Save preferences</Button>
      </Card>
    </form>
  );
}

/* ── Resumes ────────────────────────────────────────────────────────────── */
function ResumesTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload: load, setData: setCands } = useRequest(fetchCandidates);
  const cands = data || [];
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteCandidate(toDelete.id);
      setCands((prev) => (prev || []).filter((c) => c.id !== toDelete.id));
      toast.success('Resume profile deleted.');
      setToDelete(null);
    } catch (err) {
      toast.error(err.message || 'Could not delete this profile.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Card><Skeleton lines={5} /></Card>;
  if (error) return <ErrorState title="Could not load resumes" description={error} onRetry={load} />;
  if (!cands.length) {
    return <EmptyState icon={FileText} title="No resumes yet" description="Upload a resume to create a candidate profile and unlock interviews." action={<Button icon={FileText} onClick={() => navigate('/resume')}>Upload resume</Button>} />;
  }

  return (
    <>
      <div className="flex justify-end mb-3"><Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate('/resume')}>Upload another</Button></div>
      <div className="space-y-3">
        {cands.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold truncate">{c.name}</span>
                  <Badge tone={STATUS_TONE[c.status] || 'neutral'} dot>{titleCase(c.status)}</Badge>
                  {c.screening?.source === 'heuristic' && <Badge tone="warning">Heuristic screening</Badge>}
                </div>
                <div className="t-body mt-0.5">{c.target_role || 'No target role'}</div>
                <div className="t-meta mt-1.5 flex flex-wrap gap-x-3">
                  {c.resume?.filename && <span className="truncate max-w-[220px]">{c.resume.filename}</span>}
                  {c.resume?.parsed_at ? <span>Parsed {fmtDate(c.resume.parsed_at)}</span> : <span>Created {fmtDate(c.created_at)}</span>}
                  {c.resume?.pages != null && <span>{c.resume.pages} page{c.resume.pages === 1 ? '' : 's'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 md:gap-6">
                <div className="text-center">
                  <div className="t-label">ATS</div>
                  {c.ats_score != null ? <Badge tone={toneForScore(c.ats_score)} className="mt-1">{fmtScore(c.ats_score, 0)}</Badge> : <div className="t-meta mt-1">—</div>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => navigate(`/resume/${c.id}`)}>Open</Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => setToDelete(c)}>Delete</Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Modal
        open={!!toDelete} onClose={() => !deleting && setToDelete(null)} size="sm"
        title="Delete this resume profile?"
        description={toDelete ? `"${toDelete.name}" and all of its interview sessions, reports, files and embeddings will be permanently removed.` : ''}
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleting}>Keep</Button><Button variant="danger" icon={Trash2} onClick={confirmDelete} loading={deleting}>Delete profile</Button></>}
      />
    </>
  );
}

/* ── Danger zone ────────────────────────────────────────────────────────── */
function DangerTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const destroy = async () => {
    if (confirm !== 'DELETE') return;
    setBusy(true);
    try {
      await deleteAccount();
      toast.success('Your account has been deleted.');
      await logout();
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Could not delete account.');
      setBusy(false);
    }
  };

  return (
    <Card className="border-error/30" title="Delete account" subtitle="This cannot be undone">
      <Alert tone="error" title="All data will be permanently erased">
        Your profile, every resume and candidate record, interview sessions, transcripts, reports, uploaded files and vector embeddings will be removed immediately.
      </Alert>
      <div className="mt-5 flex justify-end">
        <Button variant="danger" icon={AlertTriangle} onClick={() => { setConfirm(''); setOpen(true); }}>Delete my account</Button>
      </div>
      <Modal
        open={open} onClose={() => !busy && setOpen(false)} size="sm"
        title="Confirm account deletion" description="Type DELETE in capital letters to confirm. This action is irreversible."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={destroy} loading={busy} disabled={confirm !== 'DELETE'}>Permanently delete</Button></>}
      >
        <Input label="Confirmation" name="confirm_delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" autoComplete="off" />
      </Modal>
    </Card>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Profile() {
  const { user } = useAuth();
  const [tab, setTab] = useState('account');
  const TabIcon = { account: UserIcon, security: ShieldCheck, preferences: Settings2, resumes: FileText, danger: AlertTriangle }[tab];

  return (
    <AppShell title="Profile & settings">
      <PageHeader title="Profile & settings" description="Manage your account, security, interview defaults and uploaded resumes." />
      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-6 min-w-max" />
      </div>
      <div className="flex items-center gap-2 mb-4 text-muted"><TabIcon size={16} /><span className="t-label">{TABS.find((t) => t.value === tab)?.label}</span></div>
      <div className="animate-fade-up" key={tab}>
        {tab === 'account' && <AccountTab user={user} />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'preferences' && <PreferencesTab />}
        {tab === 'resumes' && <ResumesTab />}
        {tab === 'danger' && <DangerTab />}
      </div>
    </AppShell>
  );
}
