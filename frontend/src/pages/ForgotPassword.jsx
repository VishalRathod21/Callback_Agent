import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (v) => (!v.trim() ? 'Email is required.' : !EMAIL_RE.test(v.trim()) ? 'Enter a valid email address.' : '');

  const onSubmit = async (e) => {
    e.preventDefault();
    const err = validate(email);
    setError(err);
    if (err) return;
    setServerError('');
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err2) {
      setServerError(err2.message || 'Could not start the password reset. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we’ll issue a reset token."
      footer={<>Remembered it? <Link to="/signin" className="link">Back to sign in</Link></>}
    >
      {sent ? (
        <div className="space-y-5">
          <Alert tone="success" title="Reset token issued">
            If an account exists for <span className="text-fg">{email.trim()}</span>, a reset token has been generated.
            This deployment has no mailer, so the token is written to the <span className="font-mono">backend log</span> instead of being emailed.
            Copy it from the server output and paste it on the reset page.
          </Alert>
          <Link to="/reset-password" className="btn btn-md btn-primary w-full"><KeyRound size={16} /> Go to reset page</Link>
          <button type="button" className="btn btn-md btn-ghost w-full" onClick={() => { setSent(false); setEmail(''); }}>Use a different email</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {serverError && <Alert tone="error" title="Request failed">{serverError}</Alert>}
          <Input
            label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(validate(e.target.value)); }}
            onBlur={() => setError(validate(email))} error={error || undefined} required
          />
          <Button type="submit" size="lg" className="w-full" loading={submitting} icon={Mail}>
            {submitting ? 'Requesting…' : 'Send reset token'}
          </Button>
          <p className="t-meta">Already have a token? <Link to="/reset-password" className="link">Reset your password</Link>.</p>
        </form>
      )}
    </AuthLayout>
  );
}
