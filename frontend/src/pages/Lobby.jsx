import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/client';
import { useInterviewStore } from '../store/interviewStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Navbar from '../components/ui/Navbar';

const API_BASE = 'http://localhost:8002/api';

export default function Lobby() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const setCandidateState = useInterviewStore(s => s.setCandidate);
  const setSessionState = useInterviewStore(s => s.setSession);
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState('');
  const [screeningInfo, setScreeningInfo] = useState({ decision: 'fail', reasoning: '' });

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const r = await axios.get(`${API_BASE}/candidates/${candidateId}`);
        const d = r.data;
        setCandidate(d);
        setCandidateState({ id: d.id, name: d.name, email: d.email, role: d.target_role, atsScore: d.ats_score, status: d.status });
        setScreeningInfo({
          decision: d.status === 'rejected' ? 'fail' : 'pass',
          reasoning: d.status === 'rejected' 
            ? 'Resume did not meet target qualifications.' 
            : 'Resume screening passed. Ready to start rounds.',
        });
      } catch (e) { 
        setError('Failed to load candidate data.'); 
      } finally { 
        setLoading(false); 
      }
    };
    fetch();
  }, [candidateId, setCandidateState]);

  const handleStartInterview = async () => {
    try {
      setSessionLoading(true);
      const r = await axios.post(`${API_BASE}/interviews/start/${candidateId}`);
      const s = r.data;
      setSessionState({ id: s.session_id, currentRound: s.current_round, roundScores: {}, status: s.status });
      if (s.current_round === 'dsa') navigate(`/interview/${s.session_id}/dsa`);
      else navigate(`/interview/${s.session_id}`);
    } catch { 
      setError('Failed to initialize interview session.'); 
    } finally { 
      setSessionLoading(false); 
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '80vh', gap: 'var(--space-4)', backgroundColor: 'var(--stage-black)', color: 'var(--paper)' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--spotlight)', boxShadow: '0 0 10px var(--spotlight)', animation: 'pulse-red 1.2s infinite ease-in-out' }} />
        <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--paper-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Syncing assessment lobby data...</p>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 var(--space-6)', animation: 'fadeIn 0.4s var(--ease)' }}>
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center', border: '1px solid var(--rec-red)', background: 'var(--panel-bg)' }} hoverable={false}>
          <h3 style={{ color: '#ffffff', fontSize: 'var(--text-md)', margin: '0 0 var(--space-3) 0', fontWeight: 700 }}>Workspace Sync Failed</h3>
          <p style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: '0 0 var(--space-6) 0' }}>{error || 'Candidate profile details could not be resolved from database.'}</p>
          <Button variant="ghost" onClick={() => navigate('/upload')}>← Return to Lobby Portal</Button>
        </Card>
      </div>
    );
  }

  const score = candidate.ats_score || 0;
  const isPass = candidate.status !== 'rejected';
  const tierColor = isPass ? 'var(--prompter-green)' : 'var(--rec-red)';

  const roundItems = [
    { icon: <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>, title: 'DSA Algorithmic', desc: 'Real-time interactive code sandboxing round.' },
    { icon: <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>, title: 'Systems & Architecture', desc: 'Scalable system design checklist evaluation.' },
    { icon: <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, title: 'Behavioural HR', desc: 'STAR scenarios parsing with audio diagnostics.' },
  ];

  return (
    <div style={{ backgroundColor: 'var(--stage-black)', color: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', overflowX: 'hidden' }}>
      <Navbar />

      <main style={{ flex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: 'var(--space-10) var(--space-6) var(--space-20)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', animation: 'fadeIn 0.5s var(--ease)' }}>
        
        {/* Header card */}
        <Card style={{ padding: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-6)', background: 'var(--panel-bg)' }} hoverable={false}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: tierColor, boxShadow: `0 0 8px ${tierColor}` }} />
              <span style={{ fontSize: '10px', color: tierColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{isPass ? 'Screening Passed' : 'Screening Rejected'}</span>
            </div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: '#ffffff', margin: '0 0 6px 0', letterSpacing: '-0.01em' }}>{candidate.name}</h2>
            <p style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', margin: 0 }}>Target Track: <strong style={{ color: 'var(--paper)' }}>{candidate.target_role}</strong></p>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', marginBottom: '4px', fontWeight: 600 }}>Screening score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '48px', fontWeight: 800, color: tierColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{score.toFixed(0)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--paper-dimmer)', fontWeight: 500 }}>%</span>
            </div>
          </div>
        </Card>

        {/* Two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }} className="lobby-columns">
          {/* Context */}
          <Card style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--panel-bg)' }} hoverable={false}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', borderBottom: '1px solid var(--card-border)', paddingBottom: '10px' }}>Evaluation context</span>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>Email Address</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 'var(--text-sm)', color: '#ffffff', fontWeight: 500 }}>{candidate.email}</p>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>ATS Screening Summary</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 'var(--text-sm)', color: 'var(--paper-dim)', lineHeight: 1.6 }}>{screeningInfo.reasoning}</p>
            </div>
          </Card>

          {/* Actions */}
          <Card style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
            {isPass ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--spotlight)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>Assessment Rounds Staged</span>
                  {roundItems.map((item, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '12px 16px',
                        border: '1.5px solid var(--card-border)',
                        borderRadius: '12px',
                        transition: 'all 0.3s var(--ease)',
                        cursor: 'default',
                        position: 'relative',
                        overflow: 'hidden',
                        background: 'var(--card-bg)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--spotlight)';
                        e.currentTarget.style.transform = 'translateX(4px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--card-border)';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }}
                    >
                      <div style={{ color: 'var(--spotlight)', display: 'flex', zIndex: 1 }}>{item.icon}</div>
                      <div style={{ zIndex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: '#ffffff' }}>{item.title}</div>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--paper-dim)' }}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="primary" size="lg" disabled={sessionLoading} onClick={handleStartInterview} style={{ width: '100%' }}>
                  {sessionLoading ? 'Initializing environment...' : 'Launch Assessment Workspace'}
                </Button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--rec-red)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>Alignment criteria missing</span>
                  <p style={{ margin: 0, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                    The screening evaluation flagged requirements gaps for {candidate.target_role}. Please review the missing skills list on the left and upload an updated resume document.
                  </p>
                </div>
                <Button variant="outline" size="lg" onClick={() => navigate('/upload')} style={{ width: '100%' }}>Upload New Resume</Button>
              </>
            )}
          </Card>
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .lobby-columns { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
