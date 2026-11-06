import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, LayoutDashboard } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import client from '../api/client';
import { Alert, Spinner, Button } from '../components/ui';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState(token ? 'loading' : 'missing'); // loading | success | error | missing
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    client.post('/auth/verify-email?token=' + encodeURIComponent(token))
      .then((res) => {
        if (cancelled) return;
        setMessage(res.data?.message || 'Your email address has been verified.');
        setStatus('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err.message || 'The verification link is invalid or has expired.');
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [token, attempt]);

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Confirming the verification token from your link."
      footer={<Link to="/signin" className="link">Back to sign in</Link>}
    >
      {status === 'loading' && (
        <div className="card card-pad flex items-center gap-3" role="status" aria-live="polite">
          <Spinner size={20} />
          <div>
            <div className="text-sm font-medium text-fg">Verifying…</div>
            <div className="t-meta">Checking your token with the server.</div>
          </div>
        </div>
      )}
      {status === 'success' && (
        <div className="space-y-5">
          <Alert tone="success" title="Email verified">{message}</Alert>
          <Link to="/dashboard" className="btn btn-md btn-primary w-full"><LayoutDashboard size={16} /> Go to dashboard</Link>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-5">
          <Alert tone="error" title="Verification failed">{message}</Alert>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setStatus('loading'); setAttempt((a) => a + 1); }}>Try again</Button>
            <Link to="/dashboard" className="btn btn-md btn-primary flex-1"><LayoutDashboard size={16} /> Go to dashboard</Link>
          </div>
        </div>
      )}
      {status === 'missing' && (
        <div className="space-y-5">
          <Alert tone="warning" title="No token found">
            This page expects a <span className="font-mono">?token=</span> parameter from your verification link. Open the link exactly as it appears in the backend log or email.
          </Alert>
          <div className="flex items-center gap-2 t-meta"><MailCheck size={14} /> You can still use the app while unverified.</div>
          <Link to="/dashboard" className="btn btn-md btn-primary w-full"><LayoutDashboard size={16} /> Go to dashboard</Link>
        </div>
      )}
    </AuthLayout>
  );
}
