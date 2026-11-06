import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Check, Circle, KeyRound, LogIn } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../components/ui';

// Mirrors backend/core/schemas.py ResetPassword validators.
const TOKEN_RE = /^[a-zA-Z0-9_-]+$/;
const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One digit', test: (p) => /\d/.test(p) },
];

function validate(f) {
  const errors = {};
  if (!f.token.trim()) errors.token = 'Reset token is required.';
  else if (f.token.trim().length > 128 || !TOKEN_RE.test(f.token.trim())) errors.token = 'Token may only contain letters, digits, “-” and “_”.';
  if (!f.password) errors.password = 'New password is required.';
  else if (f.password.length > 128) errors.password = 'Password must be 128 characters or fewer.';
  else if (!PASSWORD_RULES.every((r) => r.test(f.password))) errors.password = 'Password does not meet all requirements.';
  if (!f.confirm) errors.confirm = 'Please confirm your new password.';
  else if (f.confirm !== f.password) errors.confirm = 'Passwords do not match.';
  return errors;
}

function PasswordField({ id, label, value, onChange, onBlur, error, show, onToggle }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id} name={id} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="••••••••"
          value={value} onChange={onChange} onBlur={onBlur} className={`input pr-11 ${error ? 'input-error' : ''}`} required
        />
        <button
          type="button" onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost h-7 w-7 p-0 rounded"
          aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get('token') || '';
  const [form, setForm] = useState({ token: tokenFromUrl, password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const setField = (name) => (e) => {
    const next = { ...form, [name]: e.target.value };
    setForm(next);
    if (touched[name]) setErrors(validate(next));
  };
  const onBlur = (name) => () => {
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors(validate(form));
  };
  const shown = (name) => (touched[name] ? errors[name] : undefined);

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    setTouched({ token: true, password: true, confirm: true });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setServerError('');
    setSubmitting(true);
    try {
      await resetPassword(form.token.trim(), form.password, form.confirm);
      setDone(true);
    } catch (err) {
      setServerError(err.status === 400 || err.status === 404 ? 'This reset token is invalid or has expired. Request a new one and try again.' : err.message || 'Could not reset your password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={tokenFromUrl ? 'Your reset token was read from the link. Set a new password below.' : 'Paste the reset token from the backend log, then set a new password.'}
      footer={<>Need a token? <Link to="/forgot-password" className="link">Request a reset</Link></>}
    >
      {done ? (
        <div className="space-y-5">
          <Alert tone="success" title="Password updated">Your password has been reset. Sign in with your new password to continue.</Alert>
          <Link to="/signin" className="btn btn-md btn-primary w-full"><LogIn size={16} /> Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {serverError && <Alert tone="error" title="Reset failed">{serverError}</Alert>}
          {tokenFromUrl ? (
            <div>
              <span className="label">Reset token</span>
              <div className="input font-mono text-xs text-muted truncate" title={tokenFromUrl}>{tokenFromUrl}</div>
              <button type="button" className="link text-xs mt-1.5" onClick={() => { setForm((f) => ({ ...f, token: '' })); window.history.replaceState(null, '', '/reset-password'); }}>Use a different token</button>
            </div>
          ) : (
            <Input
              label="Reset token" name="token" type="text" autoComplete="one-time-code" placeholder="Paste the token from the backend log"
              className="font-mono" value={form.token} onChange={setField('token')} onBlur={onBlur('token')} error={shown('token')} required
            />
          )}
          <div>
            <PasswordField id="password" label="New password" value={form.password} onChange={setField('password')} onBlur={onBlur('password')} error={shown('password')} show={show} onToggle={() => setShow((s) => !s)} />
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5" aria-label="Password requirements">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(form.password);
                return (
                  <li key={r.id} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-success' : 'text-dim'}`}>
                    {ok ? <Check size={13} /> : <Circle size={13} />} {r.label}
                  </li>
                );
              })}
            </ul>
          </div>
          <PasswordField id="confirm" label="Confirm new password" value={form.confirm} onChange={setField('confirm')} onBlur={onBlur('confirm')} error={shown('confirm')} show={show} onToggle={() => setShow((s) => !s)} />
          <Button type="submit" size="lg" className="w-full" loading={submitting} icon={KeyRound}>
            {submitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
