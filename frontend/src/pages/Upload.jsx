import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios, { API_BASE } from '../api/client';
import { useInterviewStore } from '../store/interviewStore';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Navbar from '../components/ui/Navbar';

const ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Fullstack Developer',
  'ML Engineer',
  'Data Scientist',
  'Data Engineer',
  'Mobile Engineer (iOS/Android)',
  'DevOps Engineer',
  'Cloud Architect',
  'Cybersecurity Specialist',
  'QA Automation Engineer',
  'Systems Engineer',
  'Product Manager',
  'Product Designer (UI/UX)'
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '380px', justifyContent: 'space-between', animation: 'fadeIn 0.5s var(--ease)', flex: 1 }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--spotlight)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '12px',
          fontWeight: 700,
        }}>
          ATS VALIDATOR ACTIVE
        </div>
        <h2 style={{
          fontSize: '22px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: '24px',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
        }}>
          Analyzing candidate profile
        </h2>
        
        {/* Terminal Container */}
        <div style={{
          position: 'relative',
          backgroundColor: 'rgba(0,0,0,0.35)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid var(--card-border)',
          overflow: 'hidden',
          minHeight: '220px',
        }}>
          {/* Scanning laser sweep bar */}
          <div className="laser-sweep-line" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lines.map((line, idx) => {
              const isVisible = idx < visibleCount;
              const isActive = idx === visibleCount - 1;
              return (
                <div
                  key={idx}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: isActive ? 'var(--spotlight)' : isVisible ? 'var(--paper)' : 'var(--paper-dimmer)',
                    opacity: isVisible ? 1 : 0.35,
                    transform: isVisible ? 'translateY(0)' : 'translateY(4px)',
                    transition: 'all 200ms var(--ease)',
                    letterSpacing: '0.02em',
                    lineHeight: 1.5,
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
      <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: '11px', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', paddingTop: '20px' }}>
        Please wait while we verify your alignment to {targetRole}...
      </div>
    </div>
  );
}

function DropZone({ file, onFile, onRemove }) {
  const [isDrag, setIsDrag] = useState(false);
  const [isHover, setIsHover] = useState(false);
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
          background: 'var(--accent-subtle)',
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
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      style={{
        height: '160px',
        background: isDrag 
          ? 'var(--accent-subtle)' 
          : isHover 
            ? 'rgba(255, 255, 255, 0.03)' 
            : 'rgba(255, 255, 255, 0.02)',
        borderWidth: '1.5px',
        borderStyle: 'dashed',
        borderColor: isDrag 
          ? 'var(--spotlight)' 
          : isHover 
            ? 'rgba(255, 255, 255, 0.25)' 
            : 'var(--card-border)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        cursor: 'pointer',
        transition: 'all 0.3s var(--ease)',
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

/* ── Result details ── */
function ResultDetails({ result, targetRole, navigate }) {
  const isPass = result.decision === 'pass';
  const score = Math.round(result.ats_score);
  const scoreColor = isPass ? 'var(--prompter-green)' : 'var(--rec-red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '380px', justifyContent: 'space-between', animation: 'fadeIn 0.5s var(--ease)', flex: 1 }}>
      <div>
        {/* Score header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--paper-dimmer)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
              fontWeight: 700,
            }}>ATS compatibility match</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span className={isPass ? "text-glow-green" : "text-glow-red"} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '44px',
                fontWeight: 800,
                color: scoreColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}>{score}</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '18px',
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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 700 }}>
              Matched skills
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {result.matched_skills.map((skill, sIdx) => (
                <span key={sIdx} className="glow-green" style={{ fontSize: '11px', background: 'rgba(62, 207, 142, 0.08)', color: 'var(--prompter-green)', border: '1px solid rgba(62, 207, 142, 0.2)', padding: '4px 8px', borderRadius: '6px', fontFamily: 'var(--font-mono)', boxShadow: '0 0 10px rgba(62, 207, 142, 0.15)' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.missing_skills?.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 700 }}>
              Missing skills
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {result.missing_skills.map((skill, sIdx) => (
                <span key={sIdx} className="glow-red" style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--rec-red)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '4px 8px', borderRadius: '6px', fontFamily: 'var(--font-mono)', boxShadow: '0 0 10px rgba(226, 72, 61, 0.15)' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {!isPass && (
          <p style={{ fontSize: '13px', color: 'var(--paper-dim)', marginBottom: '24px', lineHeight: 1.6 }}>
            Your profile is currently missing core skill alignments required for the {targetRole} track. Refine your resume and try again.
          </p>
        )}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isPass ? (
          <Button variant="primary" size="lg" fullWidth onClick={() => navigate(`/lobby/${result.candidate_id}`)}>
            Proceed to interview room →
          </Button>
        ) : (
          <Button variant="outline" size="lg" fullWidth onClick={() => window.location.reload()}>
            Try another role track
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const setCandidate = useInterviewStore((state) => state.setCandidate);

  const [targetRole, setTargetRole] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [coords, setCoords] = useState({ x: 50, y: 50 });
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCoords({ x, y });
  };

  const validateAndSetFile = (f) => {
    setError('');
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') { setError('Unsupported file type. Allowed: PDF, DOCX.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('File exceeds 5MB limit.'); return; }
    setFile(f);
  };

  const handleAnalyze = async () => {
    if (!targetRole) { setError('Please select a target role.'); return; }
    if (!file) { setError('Please select a resume file.'); return; }
    setLoading(true); setError('');

    const name = user?.full_name || 'Unknown';
    const email = user?.email || '';

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
    } catch (err) {
      setError(err.message || 'Analysis failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: 'var(--stage-black)',
      color: 'var(--paper)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background Glowing Orbs */}
      <div style={{ position: 'fixed', top: '-15%', left: '10%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217, 142, 43, 0.08) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-15%', right: '10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />

      <Navbar />

      <main style={{
        flex: 1,
        maxWidth: '580px',
        width: '100%',
        margin: '0 auto',
        padding: 'var(--space-12) var(--space-6)',
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        <div 
          onMouseMove={handleMouseMove}
          className="glass-panel"
          style={{ 
            position: 'relative',
            animation: 'fadeIn 0.4s var(--ease)',
            padding: '40px 36px',
            minHeight: '480px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          {/* Radial Spotlight Glow */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle 220px at ${coords.x}% ${coords.y}%, rgba(217, 142, 43, 0.045), transparent 75%)`,
            pointerEvents: 'none',
            zIndex: 0,
          }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', flex: 1, justifyContent: 'space-between' }}>
          {/* Loading state */}
          {loading ? (
            <TerminalLoader targetRole={targetRole} />
          ) : result ? (
            <ResultDetails result={result} targetRole={targetRole} navigate={navigate} />
          ) : (
            <>
              <div>
                {/* Greeting chip */}
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--spotlight)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: '12px',
                  fontWeight: 700,
                }}>
                  CANDIDATE PORTAL
                </div>

                {/* Page title */}
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  marginBottom: '10px',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--text-primary)',
                }}>
                  Upload your resume
                </h1>
                <p style={{
                  fontSize: '14px',
                  color: 'var(--paper-dim)',
                  marginBottom: '32px',
                  lineHeight: 1.6,
                }}>
                  Select your target role and upload your resume so our AI evaluator can score ATS compatibility.
                </p>

                {/* Error */}
                {error && (
                  <div style={{
                    padding: '12px 16px',
                    background: 'var(--danger-subtle)',
                    border: '1px solid var(--danger)',
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: 'var(--rec-red)',
                    marginBottom: '20px',
                    fontWeight: 500,
                    animation: 'fadeIn 0.2s var(--ease)',
                  }}>
                    ⚠️ {error}
                  </div>
                )}

                {/* Single-step form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <Select
                    label="Target role"
                    value={targetRole}
                    onChange={setTargetRole}
                    options={ROLES}
                    placeholder="Select a role..."
                  />
                  <DropZone
                    file={file}
                    onFile={validateAndSetFile}
                    onRemove={() => setFile(null)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={!file || !targetRole}
                  onClick={handleAnalyze}
                >
                  Analyze resume & score matching →
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(-1)}
                  style={{ alignSelf: 'center' }}
                >
                  ← Go Back
                </Button>
              </div>
            </>
          )}
          </div>
        </div>
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
