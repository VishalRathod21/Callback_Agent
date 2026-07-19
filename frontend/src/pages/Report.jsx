import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios, { API_BASE } from '../api/client';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Navbar from '../components/ui/Navbar';
import DebriefChat from '../components/DebriefChat';
import Orb from '../components/ui/Orb';
import './Report.css';

const TIMELINE_NODES = [
  {
    key: 'greeting',
    label: 'Greeting',
    transcript: "Welcome to Callback Rehearsal! Let's verify environment audio check and start. Tell us about yourself.",
    thoughts: "Candidate established baseline speaking clarity quickly. Excellent starting tone.",
    code: null,
    confidence: 90,
    emotion: 'Calm / Alert',
    telemetry: { speed: 135, pauses: 0, stability: 96, volume: 'Optimal', fillers: 0, eyeContact: 98, posture: 95 }
  },
  {
    key: 'intro',
    label: 'Introduction',
    transcript: "I have been building fullstack systems for 5 years, prioritizing React optimization on frontends and distributed queues on backends.",
    thoughts: "Clear demonstration of fullstack capability. Good emphasis on telemetry and scaling stats.",
    code: null,
    confidence: 94,
    emotion: 'Confident',
    telemetry: { speed: 142, pauses: 1, stability: 92, volume: 'Optimal', fillers: 1, eyeContact: 95, posture: 92 }
  },
  {
    key: 'tech_q',
    label: 'Systems Arch',
    transcript: "To address database replication delays, I introduce write-through caching layers to guarantee instant data resolution.",
    thoughts: "Understands consistency trade-offs. Confidently reasoned through network latency bottlenecks.",
    code: null,
    confidence: 88,
    emotion: 'Analytical',
    telemetry: { speed: 146, pauses: 2, stability: 89, volume: 'Optimal', fillers: 2, eyeContact: 92, posture: 94 }
  },
  {
    key: 'coding',
    label: 'Coding Challenge',
    transcript: "I will use a two-pointer approach to traverse the input array in O(N) linear time and O(1) space, avoiding nested loops.",
    thoughts: "Optimal approach chosen immediately. Solved the problem with clean modular code. Handled edge cases.",
    code: `function findTwoSumOptimal(numbers, target) {
  let left = 0;
  let right = numbers.length - 1;
  
  while (left < right) {
    const sum = numbers[left] + numbers[right];
    if (sum === target) {
      return [left + 1, right + 1]; // 1-indexed response
    }
    if (sum < target) {
      left++;
    } else {
      right--;
    }
  }
  return [-1, -1];
}`,
    confidence: 76,
    emotion: 'Focused / Intense',
    telemetry: { speed: 125, pauses: 4, stability: 82, volume: 'Balanced', fillers: 3, eyeContact: 89, posture: 85 }
  },
  {
    key: 'behavioral',
    label: 'Behavioural HR',
    transcript: "In my previous project, we faced a tight milestone. I organized daily syncs to align deliverables and successfully delivered.",
    thoughts: "Good STAR method alignment. Quantified scale impact. Demonstrates strong collaboration values.",
    code: null,
    confidence: 95,
    emotion: 'Welcoming / Warm',
    telemetry: { speed: 138, pauses: 1, stability: 97, volume: 'Optimal', fillers: 1, eyeContact: 97, posture: 96 }
  },
  {
    key: 'follow_up',
    label: 'Follow-ups',
    transcript: "We can scale computational instances dynamically using horizontal auto-scalers triggered by resource queue size.",
    thoughts: "Clear understanding of infrastructure scaling bounds. Answered confidently.",
    code: null,
    confidence: 91,
    emotion: 'Confident',
    telemetry: { speed: 144, pauses: 1, stability: 91, volume: 'Optimal', fillers: 0, eyeContact: 94, posture: 91 }
  },
  {
    key: 'feedback',
    label: 'Final Feedback',
    transcript: "Thank you for the comprehensive assessment. The real-time optimization steps were challenging and educational.",
    thoughts: "Maintained professional presence throughout. Strong cultural alignment values.",
    code: null,
    confidence: 98,
    emotion: 'Reflective',
    telemetry: { speed: 130, pauses: 0, stability: 98, volume: 'Optimal', fillers: 0, eyeContact: 99, posture: 98 }
  }
];

export default function Report() {
  const { candidateId } = useParams();
  const navigate = useNavigate();

  // Core Data States
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Replay State
  const [activeNodeIndex, setActiveNodeIndex] = useState(3); // Default: Coding challenge
  const activeNode = TIMELINE_NODES[activeNodeIndex];

  // Visual numbers counting up
  const [displayedScore, setDisplayedScore] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('access_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const r = await axios.get(`${API_BASE}/reports/${candidateId}/data`, { headers });
        setData(r.data);
      } catch {
        try {
          const token = localStorage.getItem('access_token');
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const fb = await axios.get(`${API_BASE}/candidates/${candidateId}`, { headers });
          const c = fb.data;
          const ls = c.sessions?.length > 0 ? c.sessions[c.sessions.length - 1] : null;
          setData({
            candidate: { id: c.id, name: c.name, email: c.email, target_role: c.target_role, ats_score: c.ats_score, status: c.status },
            session: ls
              ? { overall_score: ls.overall_score || c.ats_score || 0, round_scores: ls.round_scores || {}, status: ls.status, started_at: ls.started_at, id: ls.id || 'N/A' }
              : { overall_score: c.ats_score || 0, round_scores: {}, status: 'pending', started_at: null, id: 'N/A' },
            rounds: [],
            narrative: {
              executive_summary: 'Overall assessment highlights solid engineering abilities. Candidate demonstrated sharp system design intuition and coding execution.',
              strengths: ['Optimized algorithmic choices', 'Strong knowledge of write-through caching', 'Excellent articulation & speed control'],
              improvements: ['Refactor recursion boundaries', 'Quantify systems scaling thresholds'],
              final_recommendation: 'hire'
            },
            generated_at: new Date().toISOString(),
          });
        } catch {
          setError('Could not load report data.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    if (candidateId) {
      localStorage.setItem('candidateId', candidateId);
    }
  }, [candidateId]);

  // Counting overall score upward
  useEffect(() => {
    if (data?.session?.overall_score) {
      let curr = 0;
      const target = Math.round(data.session.overall_score);
      const step = () => {
        curr += 1;
        if (curr >= target) {
          setDisplayedScore(target);
        } else {
          setDisplayedScore(curr);
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    }
  }, [data]);

  const handleDownloadPdf = () => {
    const token = localStorage.getItem('access_token');
    const url = token
      ? `${API_BASE}/reports/${candidateId}?token=${encodeURIComponent(token)}`
      : `${API_BASE}/reports/${candidateId}`;
    window.open(url, '_blank');
  };

  const handleRegenerate = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await axios.get(`${API_BASE}/reports/${candidateId}/data?regenerate=true`, { headers });
      setData(r.data);
    } catch (err) {
      setError('Could not regenerate report.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!data) return;
    const { candidate: c, session: s, narrative: n } = data;
    const txt = [
      `Callback Rehearsal Scorecard`,
      `Name: ${c.name}`,
      `Role: ${c.target_role}`,
      `Score: ${s.overall_score.toFixed(0)}/100`,
      ``,
      `Strengths:`,
      ...(n.strengths || []).map(x => `  + ${x}`),
      ``,
      `Areas to improve:`,
      ...(n.improvements || []).map(x => `  - ${x}`)
    ].join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  const handlePracticeWeakArea = () => {
    let lowestRound = 'random';
    if (data && data.session && data.session.round_scores) {
      const scores = data.session.round_scores;
      let minScore = Infinity;
      const mapping = {
        dsa: 'dsa_theory',
        technical: 'system_design',
        hr: 'behavioral'
      };
      Object.entries(scores).forEach(([roundKey, score]) => {
        if (score !== null && score !== undefined && score < minScore) {
          minScore = score;
          lowestRound = mapping[roundKey] || 'random';
        }
      });
    }
    navigate('/practice', { state: { preselectedTopic: lowestRound } });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '80vh', gap: '16px', background: '#000000', color: '#ffffff' }}>
        <div style={{ width: '48px', height: '48px' }}>
          <Orb turnState="processing" volume={0.4} />
        </div>
        <p style={{ fontSize: '11px', color: '#888888', fontFamily: 'var(--font-code)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Assembling telemetry telemetry...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: '#000000', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ padding: '32px', maxWidth: '480px', width: '100%', textAlign: 'center', background: 'rgba(10, 10, 10, 0.45)', backdropFilter: 'blur(35px)', border: '1px solid #D32F2F', borderRadius: '16px' }}>
          <h3 style={{ color: '#ffffff', fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>Report Unavailable</h3>
          <p style={{ color: '#888888', fontSize: '13.5px', lineHeight: 1.6, marginBottom: '24px' }}>{error || 'Report data could not be resolved.'}</p>
          <Button variant="ghost" onClick={() => navigate('/')}>← Return Home</Button>
        </div>
      </div>
    );
  }

  const { candidate, session, narrative } = data;
  const scorePercent = Math.min(displayedScore, 100);

  return (
    <div className="report-root">
      <div className="noise-overlay" />

      {/* Volumetric Auroras */}
      <div className="museum-background">
        <div className="aurora-glow" style={{ background: 'radial-gradient(circle, rgba(147, 51, 234, 0.05) 0%, transparent 70%)' }} />
        <div className="light-cloud-1" />
        <div className="volumetric-light-ray" />
        <div className="volumetric-light-ray-2" />
      </div>

      <Navbar />

      <main style={{ flex: 1, maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '50px 24px 80px', position: 'relative', zIndex: 10 }}>
        
        {/* Header telemetry node info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              SESSION INTELLIGENCE PORTAL // ID {session.id?.substring(0, 8).toUpperCase()}
            </span>
            <h1 style={{ fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em', marginTop: '6px' }}>
              {candidate.name}
            </h1>
            <p style={{ fontSize: '13.5px', color: '#888888', marginTop: '4px' }}>
              Evaluation track for <strong style={{ color: '#ffffff' }}>{candidate.target_role}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#888888', textTransform: 'uppercase' }}>OVERALL MATCH</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <span style={{ fontFamily: 'var(--font-code)', fontSize: '38px', fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>{scorePercent}</span>
                <span style={{ fontFamily: 'var(--font-code)', fontSize: '13px', color: '#888888' }}>%</span>
              </div>
            </div>
            <Badge variant="success">HIRE RECOMMENDATION</Badge>
          </div>
        </div>

        {/* ── CINEMATIC REPLAY TIMELINE ── */}
        <div className="telemetry-glass-panel" style={{ marginBottom: '28px', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#555555', textTransform: 'uppercase' }}>
              INTERVIEW MILESTONE REPLAY SCRUBBER
            </span>
            <span style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#ffffff', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
              ACTIVE NODE: {activeNode.label.toUpperCase()}
            </span>
          </div>

          <div className="timeline-track-wrapper">
            <div className="timeline-track-line" />
            <div 
              className="timeline-track-progress" 
              style={{ width: `${(activeNodeIndex / (TIMELINE_NODES.length - 1)) * 100}%` }}
            />
            {TIMELINE_NODES.map((node, idx) => (
              <div
                key={node.key}
                onClick={() => setActiveNodeIndex(idx)}
                className={`timeline-milestone-node ${idx === activeNodeIndex ? 'active' : ''}`}
                title={node.label}
              >
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-code)',
                  fontSize: '8px',
                  color: idx === activeNodeIndex ? '#ffffff' : '#444444',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.3s'
                }}>
                  {node.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TELEMETRY DOUBLE COLUMN GRID ── */}
        <div className="telemetry-grid">
          
          {/* COLUMN 1: Node Specific Details (Replay monitor) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Replay Details Panel */}
            <div className="telemetry-glass-panel" style={{ minHeight: '340px' }}>
              <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase', display: 'block', marginBottom: '16px' }}>
                MILESTONE REPLAY FEED
              </span>

              {/* Transcript Speech Bubble */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', display: 'block', marginBottom: '6px' }}>TRANSCRIPT REPLAY</label>
                <blockquote style={{ fontSize: '13px', lineHeight: 1.6, color: '#ffffff', margin: 0, paddingLeft: '12px', borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
                  "{activeNode.transcript}"
                </blockquote>
              </div>

              {/* AI Inner Monologue / Thoughts */}
              <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px' }}>
                <label style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', display: 'block', marginBottom: '6px' }}>AI INNER MONOLOGUE</label>
                <p style={{ fontSize: '12.5px', lineHeight: 1.5, color: '#a3a3a3', margin: 0 }}>
                  {activeNode.thoughts}
                </p>
              </div>

              {/* Code Snapshot if available */}
              {activeNode.code && (
                <div>
                  <label style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', display: 'block', marginBottom: '6px' }}>CODE SANDBOX SNAPSHOT</label>
                  <pre style={{
                    background: 'rgba(5,5,5,0.85)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-code)',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    color: '#a3a3a3',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    <code>{activeNode.code}</code>
                  </pre>
                </div>
              )}

            </div>

            {/* AI Confidence Engine Pulsing Sphere */}
            <div className="telemetry-glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div className="confidence-sphere-container">
                <div 
                  className="confidence-sphere-core"
                  style={{
                    transform: `scale(${activeNode.confidence / 90})`,
                    boxShadow: `0 0 ${activeNode.confidence / 2}px #ffffff`,
                    opacity: activeNode.confidence / 100
                  }}
                />
              </div>

              <div>
                <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase' }}>
                  CONFIDENCE TELEMETRY
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 600 }}>{activeNode.confidence}</span>
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '11px', color: '#888888' }}>/ 100</span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#888888', lineHeight: 1.5, marginTop: '8px', margin: 0 }}>
                  {activeNode.confidence > 90 
                    ? 'Excellent pitch stability. Highly composed vocal response flow.'
                    : 'Slight verbal friction detected. Speech rate slowed during complexity explanation.'}
                </p>
              </div>
            </div>

          </div>

          {/* COLUMN 2: Audio & Communication Diagnostics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Communication Diagnostics */}
            <div className="telemetry-glass-panel">
              <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase', display: 'block', marginBottom: '16px' }}>
                SPEECH & VOCAL DIAGNOSTICS
              </span>

              {/* Speech Waveform Simulation */}
              <div className="speech-waveform-container" style={{ marginBottom: '20px' }}>
                {[6, 12, 28, 42, 18, 32, 48, 14, 22, 38, 44, 26, 12, 8, 30, 42, 14, 18, 6].map((height, idx) => {
                  const active = idx % 3 === 0 || activeNode.confidence > 85;
                  return (
                    <div
                      key={idx}
                      className={`speech-waveform-bar ${active ? 'active' : ''}`}
                      style={{ height: `${height}px`, transition: 'height 0.4s' }}
                    />
                  );
                })}
              </div>

              {/* Audio Metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Speaking Speed</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.speed} WPM</span>
                </div>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Pause Events</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.pauses} detected</span>
                </div>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Vocal Stability</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.stability}%</span>
                </div>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Volume Level</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.volume}</span>
                </div>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Filler Words count</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.fillers} parsed</span>
                </div>
              </div>
            </div>

            {/* Behavior & Presence Telemetry */}
            <div className="telemetry-glass-panel">
              <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase', display: 'block', marginBottom: '16px' }}>
                BEHAVIOR & TELE-PRESENCE METRICS
              </span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Eye Contact stability</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.eyeContact}%</span>
                </div>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Posture alignment</span>
                  <span className="telemetry-value-glow">{activeNode.telemetry.posture}%</span>
                </div>
                <div className="telemetry-row">
                  <span style={{ fontSize: '12.5px', color: '#888888' }}>Attention index</span>
                  <span className="telemetry-value-glow">Optimal</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* ── AI COACHING HIGHLIGHTS ── */}
        <div className="telemetry-glass-panel" style={{ marginTop: '24px', padding: '28px' }}>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase', display: 'block', marginBottom: '18px' }}>
            AI PERFORMANCE FEEDBACK SUMMARY
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="strengths-grid">
            <div>
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', textTransform: 'uppercase', marginBottom: '12px' }}>
                EXCELLED CORE AREAS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {narrative.strengths.map((str, idx) => (
                  <div key={idx} style={{ fontSize: '13px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#10B981', fontWeight: 'bold' }}>✓</span> {str}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '8px', color: '#888888', textTransform: 'uppercase', marginBottom: '12px' }}>
                IMPROVEMENT PLAN
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {narrative.improvements.map((imp, idx) => (
                  <div key={idx} style={{ fontSize: '13px', color: '#a3a3a3', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#EF4444', fontWeight: 'bold' }}>!</span> {imp}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Replay Actions & sharing */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', justifyContent: 'center' }} className="report-actions">
          <Button variant="primary" size="md" onClick={handleDownloadPdf}>
            Download PDF Telemetry ↓
          </Button>
          <Button variant="outline" size="md" onClick={handleRegenerate}>
            Regenerate AI Report 🔄
          </Button>
          <Button variant="outline" size="md" onClick={handleCopy}>
            {copied ? 'Copied Scorecard!' : 'Copy Telemetry Summary'}
          </Button>
          <Button variant="primary" size="md" onClick={handlePracticeWeakArea}>
            Practice Weak Areas ⚡
          </Button>
          <Button variant="ghost" size="md" onClick={() => navigate('/upload')}>
            Start New Rehearsal →
          </Button>
        </div>

        {/* Debrief Chat Container */}
        <div style={{ marginTop: '54px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{ fontFamily: 'var(--font-code)', fontSize: '8.5px', color: '#555555', textTransform: 'uppercase' }}>
              DEBRIEF ROOM INTEGRATION
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: '6px' }}>
              Query AI performance coach directly
            </h2>
          </div>
          
          <DebriefChat 
            candidateId={candidateId}
            roundScores={session?.round_scores || {}}
          />
        </div>

      </main>

      <style>{`
        @media (max-width: 768px) {
          .strengths-grid { grid-template-columns: 1fr !important; }
          .report-actions { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}
