import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/client';
import { useInterviewStore } from '../store/interviewStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Navbar from '../components/ui/Navbar';

const API_BASE = 'http://localhost:8002/api';

const ROLES = [
  'Software Engineer',
  'ML Engineer',
  'Data Scientist',
  'Frontend Developer',
  'Backend Developer',
  'DevOps Engineer',
  'Product Manager',
];

/* ── Terminal loading animation ── */
function TerminalLoader({ targetRole }) {
  const lines = [
    '> Initializing sandbox environment...',
    '> Parsing resume document structure...',
    '> Extracting professional skills and experience milestones...',
    `> Cross-referencing qualifications against ${targetRole} requirements...`,
    '> Running deep neural validation scanner...',
    '> Generating final ATS suitability report...',
  ];
  const [visibleCount, setVisibleCount] = useState(0);
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    if (visibleCount < lines.length) {
      const t = setTimeout(() => setVisibleCount(v => v + 1), 380);
      return () => clearTimeout(t);
    } else {
      setShowCursor(true);
    }
  }, [visibleCount, lines.length]);

  return (
    <div style={{ textAlign: 'left', maxWidth: '540px', margin: '40px auto 0 auto', animation: 'fadeIn 0.5s var(--ease)' }}>
      <div style={{
        fontSize: 'var(--text-md)',
        fontWeight: 700,
        color: '#ffffff',
        marginBottom: 'var(--space-4)',
        fontFamily: 'var(--font-sans)',
        textAlign: 'center',
        letterSpacing: '-0.01em',
      }}>
        Analyzing candidate profile
      </div>
      
      {/* High tech scanner terminal container */}
      <div style={{
        position: 'relative',
        backgroundColor: 'var(--panel-bg)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px 24px',
        border: '1.5px solid var(--card-border)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
        minHeight: '210px',
      }}>
        {/* Moving scanning bar */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, var(--spotlight), transparent)',
          animation: 'scanner-sweep 2s linear infinite',
          zIndex: 5,
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {lines.map((line, idx) => {
            const isVisible = idx < visibleCount;
            const isActive = idx === visibleCount - 1;
            return (
              <div
                key={idx}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: isActive ? 'var(--spotlight)' : isVisible ? 'var(--paper)' : 'var(--paper-dimmer)',
                  opacity: isVisible ? 1 : 0.3,
                  transform: isVisible ? 'translateY(0)' : 'translateY(6px)',
                  transition: 'all 250ms var(--ease)',
                  letterSpacing: '0.02em',
                }}
              >
                {line}
                {isActive && showCursor && (
                  <span style={{
                    display: 'inline-block',
                    marginLeft: '2px',
                    animation: 'prompter-caret 1s infinite',
                    color: 'var(--spotlight)',
                  }}>█</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Drop zone ── */
function DropZone({ file, onFile, onRemove }) {
  const [isDrag, setIsDrag] = useState(false);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDrag(e.type === 'dragenter' || e.type === 'dragover');
  };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  if (file) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1.5px solid var(--accent-border)',
        borderRadius: '12px',
        padding: '16px 20px',
        animation: 'fadeIn 0.35s var(--ease)',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(242, 184, 75, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--spotlight)',
          border: '1px solid var(--accent-border)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', marginTop: '2px' }}>{sizeMB} MB</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} style={{ padding: '0 var(--space-2)', minWidth: '32px', height: '32px' }}>✕</Button>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        height: '180px',
        background: isDrag ? 'rgba(242, 184, 75, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        border: `1.5px dashed ${isDrag ? 'var(--spotlight)' : 'var(--card-border)'}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        cursor: 'pointer',
        transition: 'all 0.3s var(--ease)',
      }}
      onMouseEnter={e => {
        if (!isDrag) {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        }
      }}
      onMouseLeave={e => {
        if (!isDrag) {
          e.currentTarget.style.borderColor = 'var(--card-border)';
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div style={{
        width: '42px',
        height: '42px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--card-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--paper-dim)',
        marginBottom: '4px',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--paper)', textAlign: 'center' }}>
        Drop PDF or DOCX resume here
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dimmer)' }}>maximum file size 5MB</div>
    </div>
  );
}

/* ── Result card ── */
function ResultCard({ result, targetRole, navigate }) {
  const isPass = result.decision === 'pass';
  const score = Math.round(result.ats_score);
  const borderColor = isPass ? 'var(--success)' : 'var(--danger)';
  const scoreColor = isPass ? 'var(--success)' : 'var(--danger)';

  return (
    <Card elevated style={{ borderLeft: `4px solid ${borderColor}`, padding: '32px', animation: 'fadeIn 0.5s var(--ease)', background: 'var(--panel-bg)' }}>
      {/* Score row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--paper-dimmer)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '8px',
            fontWeight: 600,
          }}>ATS compatibility match</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '48px',
              fontWeight: 800,
              color: scoreColor,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>{score}</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '20px',
              color: 'var(--paper-dimmer)',
              fontWeight: 500,
            }}>/100</span>
          </div>
        </div>
        <Badge variant={isPass ? 'success' : 'danger'}>
          {isPass ? 'QUALIFIED' : 'NOT QUALIFIED'}
        </Badge>
      </div>

      <div style={{ borderTop: '1px solid var(--card-border)', margin: '20px 0' }} />

      {result.matched_skills?.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 600 }}>
            Matched skills
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {result.matched_skills.map((skill, sIdx) => (
              <span key={sIdx} style={{ fontSize: '11px', background: 'var(--success-subtle)', color: 'var(--success)', border: '1px solid rgba(62, 207, 142, 0.2)', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.missing_skills?.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 600 }}>
            Missing skills
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {result.missing_skills.map((skill, sIdx) => (
              <span key={sIdx} style={{ fontSize: '11px', background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid rgba(226, 72, 61, 0.2)', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isPass && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--paper-dim)', marginBottom: '24px', lineHeight: 1.6 }}>
          Your profile is currently missing core skill alignments required for the {targetRole} track. Refine your resume and try again.
        </p>
      )}

      {isPass ? (
        <Button variant="primary" size="lg" fullWidth onClick={() => navigate(`/lobby/${result.candidate_id}`)}>
          Proceed to interview room →
        </Button>
      ) : (
        <Button variant="outline" size="lg" fullWidth onClick={() => window.location.reload()}>
          Try another role track
        </Button>
      )}
    </Card>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const setCandidate = useInterviewStore((state) => state.setCandidate);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [targetRole, setTargetRole] = useState('Software Engineer');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const validateAndSetFile = (f) => {
    setError('');
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') { setError('Unsupported file type. Allowed: PDF, DOCX.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('File exceeds 5MB limit.'); return; }
    setFile(f);
  };

  const handleNextStep = () => {
    if (!name.trim() || !email.trim()) { setError('All fields are required.'); return; }
    setError(''); setStep(2);
  };

  const handleAnalyze = async () => {
    if (!file) { setError('Please select a resume file.'); return; }
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('name', name);
    formData.append('email', email);
    formData.append('target_role', targetRole);
    formData.append('resume', file);
    try {
      const response = await axios.post(`${API_BASE}/candidates/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = response.data;
      setResult(data);
      setCandidate({
        id: data.candidate_id, name, email,
        role: targetRole, atsScore: data.ats_score,
        status: data.decision === 'pass' ? 'screened' : 'rejected'
      });
      setStep('result');
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = step === 1 ? '1' : step === 2 ? '2' : '2';

  return (
    <div style={{
      backgroundColor: 'var(--stage-black)',
      color: 'var(--paper)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
    }}>
      <Navbar />

      <main style={{
        flex: 1,
        maxWidth: '540px',
        width: '100%',
        margin: '0 auto',
        padding: 'var(--space-12) var(--space-6)',
      }}>
        {/* Loading state */}
        {loading ? (
          <TerminalLoader targetRole={targetRole} />
        ) : result ? (
          <ResultCard result={result} targetRole={targetRole} navigate={navigate} />
        ) : (
          <div style={{ animation: 'fadeIn 0.4s var(--ease)' }}>
            {/* Step indicator */}
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--spotlight)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '12px',
              fontWeight: 700,
            }}>
              STEP {stepLabel} / 2
            </div>

            {/* Page title */}
            <h1 style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: '10px',
              fontFamily: 'var(--font-sans)',
              color: '#ffffff',
            }}>
              {step === 1 ? 'Tell us about yourself' : 'Upload your resume'}
            </h1>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--paper-dim)',
              marginBottom: '36px',
              lineHeight: 1.5,
            }}>
              {step === 1
                ? 'We need a few details before we can launch your custom assessment workspace.'
                : 'Upload your experience outline so our AI evaluator can score ATS compatibility.'}
            </p>

            {/* Error */}
            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--danger-subtle)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                color: 'var(--rec-red)',
                marginBottom: '20px',
                fontWeight: 500,
                animation: 'fadeIn 0.2s var(--ease)',
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Step 1 */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <Input
                  label="Full name"
                  placeholder="e.g. Jane Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <Input
                  label="Email address"
                  type="email"
                  placeholder="e.g. jane@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <Select
                  label="Target role"
                  value={targetRole}
                  onChange={setTargetRole}
                  options={ROLES}
                />
                <Button variant="primary" size="lg" fullWidth onClick={handleNextStep} style={{ marginTop: '10px' }}>
                  Continue to resume upload →
                </Button>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <DropZone
                  file={file}
                  onFile={validateAndSetFile}
                  onRemove={() => setFile(null)}
                />
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={!file}
                  onClick={handleAnalyze}
                  style={{ marginTop: '10px' }}
                >
                  Analyze resume & score matching →
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(1)}
                  style={{ alignSelf: 'center' }}
                >
                  ← Go Back
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
      
      <style>{`
        @keyframes scanner-sweep {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}
