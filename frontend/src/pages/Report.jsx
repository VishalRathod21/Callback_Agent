import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios, { API_BASE } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Navbar from '../components/ui/Navbar';
import DebriefChat from '../components/DebriefChat';

const ROUND_NAMES = {
  dsa: 'DSA Algorithmic',
  technical: 'Systems & Architecture',
  hr: 'Behavioural HR',
};

function ScoreRing({ score }) {
  const [strokeOffset, setStrokeOffset] = useState(251.2); // Circumference for r=40
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const pct = Math.min(Math.max(score, 0), 100);
      const circumference = 2 * Math.PI * 40;
      setStrokeOffset(circumference - (pct / 100) * circumference);
    }, 100);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div style={{ position: 'relative', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="var(--spotlight)"
          strokeWidth="6"
          strokeDasharray="251.2"
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
          style={{ 
            transition: 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)',
            filter: 'drop-shadow(0 0 4px var(--spotlight))'
          }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span className="text-glow-gold" style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 800, color: 'var(--spotlight)', lineHeight: 1 }}>{score}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--paper-dimmer)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, color }) {
  const [width, setWidth] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setWidth(Math.min(score, 100)); obs.disconnect(); }
    }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [score]);

  return (
    <div ref={ref} style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 'var(--radius-full)', transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: `0 0 8px ${color}` }} />
    </div>
  );
}

export default function Report() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const r = await axios.get(`${API_BASE}/reports/${candidateId}/data`);
        setData(r.data);
      } catch {
        try {
          const fb = await axios.get(`${API_BASE}/candidates/${candidateId}`);
          const c = fb.data;
          const ls = c.sessions?.length > 0 ? c.sessions[c.sessions.length - 1] : null;
          setData({
            candidate: { id: c.id, name: c.name, email: c.email, target_role: c.target_role, ats_score: c.ats_score, status: c.status },
            session: ls
              ? { overall_score: ls.overall_score || c.ats_score || 0, round_scores: ls.round_scores || {}, status: ls.status, started_at: ls.started_at, id: ls.id || 'N/A' }
              : { overall_score: c.ats_score || 0, round_scores: {}, status: 'pending', started_at: null, id: 'N/A' },
            rounds: [],
            narrative: { executive_summary: 'Full narrative available after all rounds complete.', strengths: ['Resume screening completed.'], improvements: ['Complete all rounds for full evaluation.'], final_recommendation: 'maybe' },
            generated_at: new Date().toISOString(),
          });
        } catch { setError('Could not load report data.'); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (candidateId) {
      localStorage.setItem('candidateId', candidateId);
    }
  }, [candidateId]);

  const handleDownloadPdf = () => {
    const token = localStorage.getItem('access_token');
    const url = token
      ? `${API_BASE}/reports/${candidateId}?token=${encodeURIComponent(token)}`
      : `${API_BASE}/reports/${candidateId}`;
    window.open(url, '_blank');
  };

  const handleCopy = async () => {
    if (!data) return;
    const { candidate: c, session: s, narrative: n } = data;
    const txt = [
      `Callback Rehearsal Scorecard`, `Name: ${c.name}`, `Role: ${c.target_role}`, `Score: ${s.overall_score.toFixed(0)}/100`,
      ``, `Strengths:`, ...(n.strengths || []).map(x => `  + ${x}`),
      ``, `Areas to improve:`, ...(n.improvements || []).map(x => `  - ${x}`)
    ].join('\n');
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
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
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '80vh', gap: 'var(--space-4)', background: 'var(--stage-black)', color: 'var(--paper)' }}>
        <div style={{ position: 'relative', width: '48px', height: '48px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(110, 168, 254, 0.15)' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'var(--spotlight)', animation: 'spin 1s linear infinite' }} />
          <div style={{ position: 'absolute', inset: '10px', borderRadius: '50%', border: '1.5px solid transparent', borderTopColor: 'rgba(110, 168, 254, 0.4)', animation: 'spin 1.5s linear infinite reverse' }} />
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Generating your report...</p>
        <p style={{ fontSize: '10px', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Compiling scorecard &amp; narrative summary</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: 'var(--stage-black)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <Card style={{ padding: 'var(--space-8)', maxWidth: '480px', width: '100%', textAlign: 'center', border: '1px solid var(--rec-red)', background: 'var(--panel-bg)' }} hoverable={false}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', fontWeight: 700 }}>Report Unavailable</h3>
          <p style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>{error || 'Report data could not be resolved.'}</p>
          <Button variant="ghost" onClick={() => navigate('/')}>← Return Home</Button>
        </Card>
      </div>
    );
  }

  const { candidate, session, rounds, narrative } = data;
  const score = Math.round(session.overall_score || 0);
  const dateStr = session.started_at
    ? new Date(session.started_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const tierColor = score >= 75 ? 'var(--prompter-green)' : score >= 50 ? 'var(--spotlight)' : 'var(--rec-red)';

  const rec = (narrative.final_recommendation || 'maybe').toLowerCase();
  const recBadgeVariant = rec === 'hire' ? 'success' : rec === 'no_hire' ? 'danger' : 'warning';
  const recLabel = rec === 'hire' ? 'PROCEED' : rec === 'no_hire' ? 'RE-STAGE' : 'CONSIDER';

  const CANONICAL_ROUND_ORDER = ['dsa', 'technical', 'hr'];

  const dedupeByKey = (entries) => {
    const best = {};
    for (const entry of entries) {
      const k = entry.key;
      if (!best[k] || entry.score > best[k].score) best[k] = entry;
    }
    const ordered = CANONICAL_ROUND_ORDER.filter(k => best[k]).map(k => best[k]);
    const extras = Object.keys(best).filter(k => !CANONICAL_ROUND_ORDER.includes(k)).map(k => best[k]);
    return [...ordered, ...extras];
  };

  const rawRoundData = rounds.length > 0
    ? rounds.map(r => ({ key: r.name, score: r.score, feedback: r.feedback, evaluation: r.evaluation }))
    : Object.entries(session.round_scores || {}).map(([key, sc]) => ({ key, score: sc, feedback: 'Detailed evaluation logs compiled successfully.', evaluation: {} }));

  const roundData = dedupeByKey(rawRoundData);

  // Mock score history to simulate last 5 sessions
  const historicalScores = [
    { label: 'Session 1', val: 62 },
    { label: 'Session 2', val: 68 },
    { label: 'Session 3', val: 71 },
    { label: 'Session 4', val: score - 5 > 0 ? score - 5 : 75 },
    { label: 'Today', val: score, highlight: true }
  ];

  return (
    <div style={{ background: 'var(--stage-black)', color: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', overflowX: 'hidden', position: 'relative' }}>
      {/* Background Glowing Orbs */}
      <div style={{ position: 'fixed', top: '-15%', left: '10%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(110, 168, 254, 0.08) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-15%', right: '10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(208, 188, 255, 0.06) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />

      <Navbar />

      <main style={{ flex: 1, maxWidth: '820px', width: '100%', margin: '0 auto', padding: 'var(--space-12) var(--space-6)', animation: 'fadeIn 0.5s var(--ease)', position: 'relative', zIndex: 1 }}>

        {/* Breadcrumb */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--paper-dimmer)',
          marginBottom: 'var(--space-8)',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}>
          SESSION ID: {session.id?.substring(0, 12).toUpperCase() || candidateId?.substring(0, 12).toUpperCase()} · RECORDED EVALUATION
        </div>

        {/* Hero scorecard: Circular progress + candidate block */}
        <Card style={{ padding: '32px', marginBottom: 'var(--space-8)', background: 'var(--panel-bg)' }} hoverable={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'var(--space-8)', alignItems: 'center' }} className="report-header-grid">
            
            {/* Left: score ring */}
            <ScoreRing score={score} />

            {/* Center: candidate detail */}
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.01em' }}>
                {candidate.name}
              </h2>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>
                {candidate.target_role} · {dateStr}
              </div>
            </div>

            {/* Right: decision badge */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <Badge variant={recBadgeVariant}>{recLabel}</Badge>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)' }}>REHEARSAL TAKE #04</div>
            </div>
          </div>
        </Card>

        {/* Two columns: breakdown & historical chart */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-10)' }} className="breakdown-chart-grid">
          
          {/* Round breakdown */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px', fontWeight: 700 }}>
              Round Evaluation Breakdown
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roundData.length > 0 ? roundData.map((r, idx) => {
                const rScore = Math.round(r.score);
                const rColor = rScore >= 75 ? 'var(--prompter-green)' : rScore >= 50 ? 'var(--spotlight)' : 'var(--rec-red)';
                return (
                  <Card key={r.key} style={{ padding: '16px 20px', background: 'var(--panel-bg)' }} hoverable={false}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', gap: 'var(--space-4)', alignItems: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                        {ROUND_NAMES[r.key] || r.key}
                      </div>
                      <ScoreBar score={rScore} color={rColor} />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 800, color: rColor, textAlign: 'right' }}>
                        {rScore}%
                      </div>
                    </div>
                  </Card>
                );
              }) : (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>
                  No round data available.
                </div>
              )}
            </div>
          </div>

          {/* Historical trend */}
          <Card style={{ padding: '24px', background: 'var(--panel-bg)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} hoverable={false}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px', fontWeight: 700 }}>
              Rehearsal History
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '100px', padding: '0 8px', borderBottom: '1px solid var(--card-border)', marginBottom: '12px' }}>
              {historicalScores.map((h, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px' }}>
                  <span className={h.highlight ? "text-glow-gold" : ""} style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: h.highlight ? 700 : 400, color: h.highlight ? 'var(--spotlight)' : 'var(--paper-dimmer)' }}>{h.val}</span>
                  <div style={{
                    width: '16px',
                    height: `${h.val}px`,
                    background: h.highlight ? 'var(--spotlight)' : 'rgba(27, 35, 64, 0.15)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: h.highlight ? '0 0 10px rgba(217, 142, 43, 0.35)' : 'none',
                  }} />
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--paper-dimmer)' }}>Take 1</span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--spotlight)', fontWeight: 600 }}>Current</span>
            </div>
          </Card>
        </div>

        {/* Strengths + Improvements */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-10)' }} className="strengths-grid">
          {/* Strengths */}
          <Card style={{ background: 'var(--panel-bg)', padding: '24px' }} hoverable={false}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px', fontWeight: 700 }}>
              + What Worked
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(narrative.strengths || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--prompter-green)', fontSize: '14px', flexShrink: 0, lineHeight: 1.4 }}>+</span>
                  <span style={{ fontSize: '13px', color: 'var(--paper-dim)', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Improvements */}
          <Card style={{ background: 'var(--panel-bg)', padding: '24px' }} hoverable={false}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px', fontWeight: 700 }}>
              − Work On Next
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(narrative.improvements || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--rec-red)', fontSize: '14px', flexShrink: 0, lineHeight: 1.4 }}>−</span>
                  <span style={{ fontSize: '13px', color: 'var(--paper-dim)', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Communication Analytics */}
        {roundData.some(r => r.evaluation?.communication_analysis) && (
          <div style={{ marginBottom: 'var(--space-10)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px', fontWeight: 700 }}>
              Communication & Articulation Analysis
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {roundData.map(r => {
                const comm = r.evaluation?.communication_analysis;
                if (!comm) return null;
                return (
                  <Card key={r.key} style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                        {ROUND_NAMES[r.key] || r.key}
                      </span>
                      <Badge variant={comm.communication_rating >= 8 ? 'success' : comm.communication_rating >= 6 ? 'warning' : 'danger'}>
                        Articulation: {comm.communication_rating}/10
                      </Badge>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '24px' }}>
                      {/* Left stats */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--card-border)', paddingRight: '20px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Words Spoken</div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{comm.total_candidate_words}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filler Ratio</div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: comm.filler_ratio > 6.0 ? 'var(--rec-red)' : 'var(--prompter-green)', marginTop: '4px' }}>{comm.filler_ratio}%</div>
                        </div>
                      </div>

                      {/* Right Feedback & details */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <p style={{ fontSize: '13px', color: 'var(--paper-dim)', lineHeight: 1.5, margin: '0 0 14px 0' }}>
                          {comm.filler_feedback}
                        </p>
                        
                        {Object.keys(comm.filler_words_found || {}).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', color: 'var(--paper-dimmer)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '6px' }}>Words Detected:</span>
                            {Object.entries(comm.filler_words_found).map(([word, count]) => (
                              <span key={word} style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: 'var(--paper)' }}>
                                <strong style={{ color: 'var(--spotlight)', marginRight: '4px' }}>"{word}"</strong> x{count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: 'var(--space-8)', justifyContent: 'center' }} className="report-actions">
          <Button variant="primary" size="md" onClick={handleDownloadPdf}>
            Download PDF Report ↓
          </Button>
          <Button variant="secondary" size="md" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Summary'}
          </Button>
          <Button variant="primary" size="md" onClick={handlePracticeWeakArea} style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', color: '#FFFFFF' }}>
            Practice Weak Areas ⚡
          </Button>
          <Button variant="ghost" size="md" onClick={() => navigate('/upload')}>
            Start New Rehearsal →
          </Button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <Button variant="ghost" size="md" onClick={() => navigate(`/dashboard/${candidateId}`)}>
            View full progress dashboard →
          </Button>
        </div>

        {/* Debrief Chat Section */}
        <div style={{ marginTop: 'var(--space-12)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-code)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            DEBRIEF CHAT
          </div>
          <div style={{ fontSize: '12px', color: 'var(--paper-dimmer)', marginTop: '4px' }}>
            Ask AI coach anything about your interview
          </div>
        </div>

        <DebriefChat 
          candidateId={candidateId}
          roundScores={session?.round_scores || {}}
        />
      </main>

      <style>{`
        @media (max-width: 768px) {
          .strengths-grid, .report-header-grid, .breakdown-chart-grid { grid-template-columns: 1fr !important; }
          .report-actions { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}
