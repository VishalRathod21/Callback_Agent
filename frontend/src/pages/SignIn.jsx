import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Toggle, Alert } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  return errors;
}

export default function SignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    setTouched({ email: true, password: true });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setServerError('');
    setSubmitting(true);
    try {
      await login(form.email.trim(), form.password, remember);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      setServerError(err.status === 401 ? 'Incorrect email or password.' : err.message || 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your interview practice."
      footer={<>Don’t have an account? <Link to="/signup" className="link">Create one</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {serverError && <Alert tone="error" title="Sign in failed">{serverError}</Alert>}
        <Input
          label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com"
          value={form.email} onChange={setField('email')} onBlur={onBlur('email')}
          error={touched.email ? errors.email : undefined} required
        />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="label mb-0">Password</label>
            <Link to="/forgot-password" className="link text-xs">Forgot password?</Link>
          </div>
          <div className="relative">
            <input
              id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              placeholder="••••••••" value={form.password} onChange={setField('password')} onBlur={onBlur('password')}
              className={`input pr-11 ${touched.password && errors.password ? 'input-error' : ''}`} required
            />
            <button
              type="button" onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost h-7 w-7 p-0 rounded"
              aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {touched.password && errors.password && <p className="error-text">{errors.password}</p>}
        </div>
        <Toggle checked={remember} onChange={setRemember} label="Remember me" description="Keep me signed in on this device." />
        <Button type="submit" size="lg" className="w-full" loading={submitting} icon={LogIn}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
