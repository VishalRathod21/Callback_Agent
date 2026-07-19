import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function SignUp() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await register(fullName, email, password, confirm);
      navigate('/upload');
    } catch (err) {
      setError(err.message || 'Could not create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background spotlights */}
      <div className="spotlight-glow" style={{ top: '15%', right: '15%', width: '450px', height: '450px', background: 'radial-gradient(circle, rgba(217, 142, 43, 0.06) 0%, transparent 70%)', opacity: 0.8, position: 'absolute', pointerEvents: 'none' }} />
      <div className="spotlight-glow" style={{ bottom: '15%', left: '15%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(124, 58, 237, 0.04) 0%, transparent 70%)', opacity: 0.6, position: 'absolute', pointerEvents: 'none' }} />

      <Card 
        depth={2} 
        hoverable={false}
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '48px 40px',
          zIndex: 5,
        }}
      >
        {/* Logo Wordmark */}
        <div 
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '32px',
            cursor: 'pointer',
            width: 'fit-content',
            transition: 'transform 0.2s',
          }}
        >
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
          <span style={{
            color: 'var(--text-primary)',
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-display)',
          }}>Callback</span>
        </div>

        <h1 style={{
          color: 'var(--text-primary)',
          fontSize: '24px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-display)',
        }}>Create account</h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '14px',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Start rehearsing for technical and behavioral interviews.</p>

        {error && (
          <div style={{
            background: 'rgba(198, 40, 40, 0.05)',
            border: '1px solid rgba(198, 40, 40, 0.2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--rec-red)',
            padding: '12px 16px',
            fontSize: '13px',
            marginBottom: '24px',
            lineHeight: 1.5,
            fontWeight: 500,
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input
            label="Full Name"
            type="text"
            placeholder="Jane Smith"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Min 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            hint="Must be at least 8 characters long"
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} style={{ marginTop: '8px' }}>
            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
          </Button>
        </form>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          margin: '28px 0',
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: 600,
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(27, 35, 64, 0.08)' }} />
          <span>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(27, 35, 64, 0.08)' }} />
        </div>

        <div style={{
          textAlign: 'center',
          fontSize: '14px',
          color: 'var(--text-secondary)',
        }}>
          Already have an account?{' '}
          <span 
            onClick={() => navigate('/signin')}
            style={{
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Sign in
          </span>
        </div>
      </Card>
    </div>
  );
}
