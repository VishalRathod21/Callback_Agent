import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios, { API_BASE } from '../api/client';
import { useInterviewStore } from '../store/interviewStore';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Navbar from '../components/ui/Navbar';
import './Upload.css';

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

// ── BULLET COMPARISONS ──
const SUGGESTED_REWRITES = [
  {
    before: "Responsible for building the main dashboard page.",
    after: "Architected a responsive React dashboard, integrating telemetry trackers to reduce layout load times by 40%."
  },
  {
    before: "Helped write back-end code and API integrations.",
    after: "Designed robust RESTful endpoints in Python, streamlining DB indexing query times by 180ms."
  },
  {
    before: "Fixed general bugs and looked after tests.",
    after: "Implemented Jest test suites raising code coverage to 94% and automating integration validation pipelines."
  }
];

function SparklesIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5 5 3Z" opacity="0.5" />
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" opacity="0.5" />
    </svg>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const setCandidate = useInterviewStore((state) => state.setCandidate);

  // States
  const [targetRole, setTargetRole] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  
  // Custom absorption / analysis phases
  const [analysisPhase, setAnalysisPhase] = useState(0); // 0:Idle, 1:Scanning, 2:Extracting, 3:Done
  const [displayedAtsScore, setDisplayedAtsScore] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  // Validation
  const validateAndSetFile = (f) => {
    setError('');
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') {
      setError('Unsupported file format. Please drop a PDF or DOCX.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File size limit exceeded (maximum 5MB).');
      return;
    }
    setFile(f);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragOver(true);
    } else if (e.type === 'dragleave') {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) validateAndSetFile(f);
  };

  // Submit and execute multi-stage AI simulation
  const handleAnalyze = async () => {
    if (!targetRole) { setError('Please choose your target role track.'); return; }
    if (!file) { setError('Please drop a resume.'); return; }
    
    setLoading(true);
    setError('');
    setAnalysisPhase(1); // Phase 1: Scanning

    const name = user?.full_name || 'Candidate';
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

      // Phase 2 transition
      setTimeout(() => {
        setAnalysisPhase(2); // Phase 2: Extracting details
      }, 2000);

      // Phase 3 transition
      setTimeout(() => {
        setAnalysisPhase(3); // Phase 3: Complete
        setResult(data);
        setCandidate({
          id: data.candidate_id,
          name,
          email,
          role: targetRole,
          atsScore: data.ats_score,
          status: data.decision === 'pass' ? 'screened' : 'rejected'
        });
        setLoading(false);
      }, 4200);

    } catch (err) {
      setError(err.message || 'Analysis failed. Please retry.');
      setLoading(false);
      setAnalysisPhase(0);
    }
  };

  // Animate ATS Dial on success
  useEffect(() => {
    if (result?.ats_score && analysisPhase === 3) {
      let current = 0;
      const target = Math.round(result.ats_score);
      const step = () => {
        current += 2;
        if (current >= target) {
          setDisplayedAtsScore(target);
        } else {
          setDisplayedAtsScore(current);
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    }
  }, [result, analysisPhase]);

  const scoreCircumference = 2 * Math.PI * 50; // Radius = 50
  const scoreOffset = scoreCircumference - (displayedAtsScore / 100) * scoreCircumference;

  return (
    <div className="upload-root">
      <div className="noise-overlay" />
      
      {/* Background Museum Depth Layers */}
      <div className="museum-background">
        <div className="aurora-glow" style={{ opacity: 0.7 }} />
        <div className="light-cloud-1" />
        <div className="volumetric-light-ray" />
        <div className="volumetric-light-ray-2" />
      </div>

      <Navbar />

      <main className="portal-container">
        
        <AnimatePresence mode="wait">
          
          {/* PHASE 0 & 1 & 2: Portal Upload and Live Scanning */}
          {analysisPhase < 3 ? (
            <motion.div
              key="portal-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="portal-glass"
            >
              {analysisPhase === 0 ? (
                // ── PORTAL IDLE UPLOAD UPRIGHT ──
                <>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#888888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      CAREER ORCHESTRATION GATEWAY
                    </span>
                    <h1 style={{ fontSize: '23px', fontWeight: 600, letterSpacing: '-0.02em', marginTop: '10px', marginBottom: '8px' }}>
                      Hand your resume to AI
                    </h1>
                    <p style={{ fontSize: '13px', color: '#888888', maxWidth: '380px', margin: '0 auto 28px' }}>
                      Select a track. Drop your document inside the Core. Let our neural scanners parse your experience.
                    </p>

                    {error && (
                      <div style={{ padding: '10px 14px', background: 'rgba(211, 47, 47, 0.05)', border: '1px solid rgba(211, 47, 47, 0.15)', borderRadius: '8px', fontSize: '12px', color: '#D32F2F', marginBottom: '16px' }}>
                        {error}
                      </div>
                    )}

                    {/* Role selector */}
                    <div style={{ marginBottom: '24px', textAlign: 'left' }}>
                      <label style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#555555', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                        TARGET ROLE TRACK
                      </label>
                      <select
                        value={targetRole}
                        onChange={(e) => setTargetRole(e.target.value)}
                        className="luxury-role-select"
                      >
                        <option value="" disabled>Select track role...</option>
                        {ROLES.map((role, idx) => (
                          <option key={idx} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>

                    {/* Breathing Portal Orb Zone */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`portal-orb-zone ${isDragOver ? 'dragover' : ''}`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx"
                        style={{ display: 'none' }}
                        onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
                      />
                      
                      <div className="portal-pulse-ring" />
                      <div className="portal-pulse-ring" style={{ animationDelay: '2s' }} />

                      <div style={{ width: '80px', height: '80px', position: 'relative', zIndex: 5, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', border: '2px solid rgba(255, 255, 255, 0.2)' }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.3)', animation: 'pulse 2s infinite' }} />
                      </div>

                      {file && (
                        <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#ffffff', background: 'rgba(5,5,5,0.7)', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          📄 {file.name.slice(0, 15)}...
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '20px', fontFamily: 'var(--font-code)', fontSize: '8px', color: '#444444' }}>
                      DRAG DIRECTLY INSIDE CORE // MAXIMUM SIZE 5MB
                    </div>

                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={!file || !targetRole}
                      onClick={handleAnalyze}
                    >
                      Absorb & Analyze Track →
                    </Button>
                  </div>
                </>
              ) : (
                // ── PORTAL SCANNING BEAM & PROGRESSIVE DETAILS ──
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', flex: 1, padding: '20px 0' }}>
                  <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    
                    {/* Laser sweep */}
                    <div className="hologram-laser-sweep" />

                    <div style={{ width: '120px', height: '120px', marginBottom: '24px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', border: '2px solid rgba(255, 255, 255, 0.2)', position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.3)', animation: 'pulse 1.5s infinite' }} />
                      <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.2)', animation: 'pulse 1.5s infinite reverse' }} />
                    </div>

                    <h2 style={{ fontSize: '18px', fontWeight: 600, textAlign: 'center', marginBottom: '8px' }}>
                      {analysisPhase === 1 ? 'Volumetric Laser scanning...' : 'Mapping neural skills and nodes...'}
                    </h2>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '380px', marginTop: '16px' }}>
                      {analysisPhase === 2 && ['EXPERIENCE', 'EDUCATION', 'COMPUTED_MATCH', 'METRICS', 'ATS_WEIGHT'].map((tag, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.2 }}
                          className="skill-bubble-tag"
                        >
                          {tag}
                        </motion.span>
                      ))}
                    </div>

                  </div>
                  
                  <div style={{ textAlign: 'center', fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555' }}>
                    {analysisPhase === 1 ? 'SWEEPING RESUME NODE SEGMENTS...' : 'STRUCTURING INDEX GRAPH...'}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            // ── PHASE 3: COMPLETED RESULT & RESUME TRANSFORMATION ──
            <motion.div
              key="results-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="portal-glass"
              style={{ padding: '36px', maxWidth: '640px' }}
            >
              <div>
                
                {/* Result header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', letterSpacing: '0.08em' }}>
                      SCANNING EVALUATION RESULT
                    </span>
                    <h2 style={{ fontSize: '20px', fontWeight: 600, marginTop: '4px' }}>
                      Profile Analysis Alignments
                    </h2>
                  </div>
                  
                  {/* ATS circle metric */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                      <svg className="circular-progress-svg" viewBox="0 0 120 120" style={{ width: '56px', height: '56px' }}>
                        <circle className="circular-bg-ring" cx="60" cy="60" r="50" />
                        <circle
                          className="circular-fill-ring"
                          cx="60"
                          cy="60"
                          r="50"
                          strokeDasharray={scoreCircumference}
                          strokeDashoffset={scoreOffset}
                        />
                      </svg>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-code)', fontSize: '11px', fontWeight: 700 }}>
                        {displayedAtsScore}
                      </div>
                    </div>
                    <Badge variant={result?.decision === 'pass' ? 'success' : 'danger'}>
                      {result?.decision === 'pass' ? 'PASSED' : 'NOT ALIGNED'}
                    </Badge>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', margin: '18px 0' }} />

                {/* Skill tags */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase', marginBottom: '8px' }}>
                    IDENTIFIED COMPETENCIES
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {result?.matched_skills?.map((skill, idx) => (
                      <span key={idx} className="skill-bubble-tag" style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.15)' }}>
                        {skill}
                      </span>
                    ))}
                    {result?.missing_skills?.map((skill, idx) => (
                      <span key={idx} className="skill-bubble-tag" style={{ color: '#555555', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.04)' }}>
                        {skill} (suggested)
                      </span>
                    ))}
                  </div>
                </div>

                {/* Resume Transformations rewritten nodes */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase', marginBottom: '8px' }}>
                    AI RESUME REWRITE SAMPLES
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {SUGGESTED_REWRITES.slice(0, 2).map((item, idx) => (
                      <div key={idx} className="rewritten-bullet-card">
                        <div style={{ fontSize: '11.5px', color: '#555555', textDecoration: 'line-through', marginBottom: '4px' }}>
                          {item.before}
                        </div>
                        <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: 500 }}>
                          {item.after}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conversational Insight coaches */}
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '14px', fontSize: '13px', lineHeight: 1.6, color: '#a3a3a3' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontFamily: 'var(--font-code)', fontSize: '8px', color: '#ffffff' }}>
                    <SparklesIcon size={12} /> AI COACH RECOMMENDATION
                  </div>
                  "Your resume reflects strong foundation capabilities. We populated rewritten metrics templates showing impact. Let's practice with code challenges in the next chapter."
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '28px' }}>
                {result?.decision === 'pass' ? (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => navigate(`/lobby/${result.candidate_id}`)}
                  >
                    Enter interview lobby →
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    fullWidth
                    onClick={() => {
                      setResult(null);
                      setAnalysisPhase(0);
                      setFile(null);
                    }}
                  >
                    Adjust role target track
                  </Button>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
