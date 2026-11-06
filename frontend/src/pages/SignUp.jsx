import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, Circle, UserPlus } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors backend/core/schemas.py UserSignup.full_name validator.
const NAME_RE = /^[A-Za-z]+([ '-][A-Za-z]+)*$/;

const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One digit', test: (p) => /\d/.test(p) },
];

function validate(f) {
  const errors = {};
  const name = f.fullName;
  if (!name.trim()) errors.fullName = 'Full name is required.';
  else if (name !== name.trim()) errors.fullName = 'Remove leading or trailing spaces.';
  else if (name.length < 2) errors.fullName = 'Full name must be at least 2 characters.';
  else if (name.length > 100) errors.fullName = 'Full name must be 100 characters or fewer.';
  else if (!NAME_RE.test(name)) errors.fullName = 'Only letters, spaces, hyphens and apostrophes are allowed.';

  if (!f.email.trim()) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(f.email.trim())) errors.email = 'Enter a valid email address.';
  else if (f.email.trim().length > 150) errors.email = 'Email must be 150 characters or fewer.';

  if (!f.password) errors.password = 'Password is required.';
  else if (f.password.length > 128) errors.password = 'Password must be 128 characters or fewer.';
  else if (!PASSWORD_RULES.every((r) => r.test(f.password))) errors.password = 'Password does not meet all requirements.';

  if (!f.passwordConfirm) errors.passwordConfirm = 'Please confirm your password.';
  else if (f.passwordConfirm !== f.password) errors.passwordConfirm = 'Passwords do not match.';
  return errors;
}

function PasswordField({ id, label, value, onChange, onBlur, error, autoComplete, show, onToggle }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id} name={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder="••••••••"
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

function StrengthChecklist({ password }) {
  return (
    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.id} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-success' : 'text-dim'}`}>
            {ok ? <Check size={13} /> : <Circle size={13} />} {r.label}
          </li>
        );
      })}
    </ul>
  );
}

export default function SignUp() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', passwordConfirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    setTouched({ fullName: true, email: true, password: true, passwordConfirm: true });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setServerError('');
    setSubmitting(true);
    try {
      await register(form.fullName, form.email.trim(), form.password, form.passwordConfirm);
      navigate('/resume', { replace: true });
    } catch (err) {
      setServerError(err.status === 409 ? 'An account with this email already exists.' : err.message || 'Could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Upload a resume next and start your first adaptive mock interview."
      footer={<>Already have an account? <Link to="/signin" className="link">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {serverError && <Alert tone="error" title="Sign up failed">{serverError}</Alert>}
        <Input
          label="Full name" name="fullName" type="text" autoComplete="name" placeholder="Ada Lovelace"
          value={form.fullName} onChange={setField('fullName')} onBlur={onBlur('fullName')} error={shown('fullName')} required
        />
        <Input
          label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com"
          value={form.email} onChange={setField('email')} onBlur={onBlur('email')} error={shown('email')} required
        />
        <div>
          <PasswordField
            id="password" label="Password" autoComplete="new-password" value={form.password}
            onChange={setField('password')} onBlur={onBlur('password')} error={shown('password')}
            show={show} onToggle={() => setShow((s) => !s)}
          />
          <StrengthChecklist password={form.password} />
        </div>
        <PasswordField
          id="passwordConfirm" label="Confirm password" autoComplete="new-password" value={form.passwordConfirm}
          onChange={setField('passwordConfirm')} onBlur={onBlur('passwordConfirm')} error={shown('passwordConfirm')}
          show={show} onToggle={() => setShow((s) => !s)}
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting} icon={UserPlus}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="t-meta text-center">By signing up you agree to use this tool for interview practice only.</p>
      </form>
    </AuthLayout>
  );
}
