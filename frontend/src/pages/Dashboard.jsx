import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios, { API_BASE } from '../api/client';
import Navbar from '../components/ui/Navbar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const suggestionsMap = {
  "DSA Coding": [
    "Practice common graph traversals (BFS/DFS) and dynamic programming patterns.",
    "Be sure to calculate and vocalize time and space complexities during interviews.",
    "Explain your code structure and logic before starting to write the implementation."
  ],
  "Technical": [
    "Review database indexing, caching strategies, and load balancing patterns.",
    "Practice drawing out component and data flow architectures for high-scale systems.",
    "Deep dive into system communication trade-offs (e.g. gRPC vs REST vs WebSockets)."
  ],
  "HR Behavioral": [
    "Structure your answers using the STAR method (Situation, Task, Action, Result).",
    "Prepare stories highlighting cross-team collaboration, leadership, and conflict resolution.",
    "Be explicit about your personal contribution and the quantifiable business outcomes."
  ]
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-strong)',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 6px 0', color: 'var(--paper)' }}>Session #{payload[0].payload.session_number}</p>
        {payload.map((entry, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', margin: '4px 0', color: 'var(--paper-dim)' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color }} />
            <span style={{ textTransform: 'capitalize' }}>{entry.name === 'overall' ? 'Overall Score' : entry.name.toUpperCase()}:</span>
            <span style={{ fontWeight: 700, color: 'var(--paper)' }}>{entry.value}%</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCalculation, setShowCalculation] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE}/dashboard/${candidateId}`);
        setData(res.data);
      } catch (err) {
        console.error("Error fetching dashboard metrics:", err);
        setError('Could not load progress metrics.');
      } finally {
        setLoading(false);
      }
    };
    if (candidateId) {
      fetchDashboardData();
    }
  }, [candidateId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '80vh', gap: 'var(--space-4)', background: 'var(--stage-black)', color: 'var(--paper)' }}>
        <div style={{ position: 'relative', width: '48px', height: '48px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(110, 168, 254, 0.15)' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'var(--spotlight)', animation: 'spin 1s linear infinite' }} />
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Compiling performance history...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: 'var(--stage-black)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <Card style={{ padding: 'var(--space-8)', maxWidth: '480px', width: '100%', textAlign: 'center', border: '1px solid var(--rec-red)', background: 'var(--panel-bg)' }} hoverable={false}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', fontWeight: 700 }}>Dashboard Unavailable</h3>
          <p style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>{error || 'Dashboard statistics could not be loaded.'}</p>
          <Button variant="ghost" onClick={() => navigate('/')}>← Return Home</Button>
        </Card>
      </div>
    );
  }

  const {
    has_data,
    candidate_name,
    target_role,
    total_sessions,
    total_time_min,
    readiness_score,
    readiness_breakdown,
    score_timeline,
    trends,
    averages,
    weak_areas,
    best_session,
    worst_session,
  } = data;

  if (!has_data) {
    return (
      <div style={{ background: 'var(--stage-black)', color: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', position: 'relative' }}>
        <Navbar />
        <main style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '100px 24px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 1 }}>
          <Card style={{ padding: '48px', maxWidth: '640px', width: '100%', textAlign: 'center', background: 'var(--panel-bg)' }} hoverable={false}>
            <div style={{ fontSize: '48px', marginBottom: '24px' }}>📈</div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Progress Dashboard for {candidate_name}
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--paper-dim)', marginBottom: '4px' }}>
              Targeting: {target_role || 'General Role'}
            </p>
            <p style={{ color: 'var(--paper-dimmer)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: '32px' }}>
              You haven't completed any interview sessions yet. Once you finish your first session, your score progression, readiness metrics, and detailed analytics will be compiled and displayed here.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <Button variant="primary" size="lg" onClick={() => navigate('/upload')}>
                Start First Rehearsal →
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate('/practice')}>
                Start Quick Practice →
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // Get color for readiness score
  const readinessColor = readiness_score >= 75 ? 'var(--prompter-green)' : readiness_score >= 50 ? 'var(--spotlight)' : 'var(--rec-red)';

  // Find weakest round details
  const weakestRound = weak_areas && weak_areas.length > 0 ? weak_areas[0] : null;
  const weakestRoundSuggestions = weakestRound ? (suggestionsMap[weakestRound.name] || []) : [];

  return (
    <div style={{ background: 'var(--stage-black)', color: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', overflowX: 'hidden', position: 'relative' }}>
      {/* Background Glowing Orbs */}
      <div style={{ position: 'fixed', top: '-15%', left: '10%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(110, 168, 254, 0.08) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-15%', right: '10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(208, 188, 255, 0.06) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />

      <Navbar />

      <main style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '100px 24px 80px', position: 'relative', zIndex: 1 }}>
        
        {/* Header Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Performance &amp; Progress Dashboard
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--paper-dim)' }}>
              Candidate: <strong>{candidate_name}</strong> · Role: <strong>{target_role || 'General Role'}</strong>
            </p>
          </div>
          <Button 
            variant="primary" 
            onClick={() => navigate('/practice')}
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
              color: '#FFFFFF'
            }}
          >
            Start Quick Practice →
          </Button>
        </div>

        {/* SECTION 1 — TOP STATS ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          
          {/* Readiness Score */}
          <Card style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
            <div style={{ fontSize: '36px', fontWeight: 800, color: readinessColor, fontFamily: 'var(--font-mono)' }}>
              {readiness_score}%
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--paper)', marginTop: '8px' }}>
              Interview Readiness
            </div>
            <div style={{ fontSize: '11px', color: 'var(--paper-dimmer)', marginTop: '4px' }}>
              Updated after each session
            </div>
          </Card>

          {/* Sessions Completed */}
          <Card style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--paper)', fontFamily: 'var(--font-mono)' }}>
              {total_sessions}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--paper)', marginTop: '8px' }}>
              Sessions Completed
            </div>
            <div style={{ fontSize: '11px', color: 'var(--paper-dimmer)', marginTop: '4px' }}>
              Total practice time: {total_time_min} min
            </div>
          </Card>

          {/* Overall Trend */}
          <Card style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: 800, 
              color: trends.overall >= 0 ? 'var(--prompter-green)' : 'var(--rec-red)',
              fontFamily: 'var(--font-mono)' 
            }}>
              {trends.overall >= 0 ? `+${trends.overall}` : trends.overall}%
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--paper)', marginTop: '8px' }}>
              Score Change
            </div>
            <div style={{ fontSize: '11px', color: 'var(--paper-dimmer)', marginTop: '4px' }}>
              From first to latest session
            </div>
          </Card>

          {/* Best Score */}
          <Card style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--spotlight)', fontFamily: 'var(--font-mono)' }}>
              {best_session ? Math.round(best_session.overall) : 0}%
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--paper)', marginTop: '8px' }}>
              Personal Best
            </div>
            <div style={{ fontSize: '11px', color: 'var(--paper-dimmer)', marginTop: '4px' }}>
              Session #{best_session ? best_session.session_number : 0}
            </div>
          </Card>
        </div>

        {/* SECTION 2 — SCORE TREND CHART */}
        <Card style={{ padding: '24px', marginBottom: '32px', background: 'var(--panel-bg)' }} hoverable={false}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--paper)', marginBottom: '24px' }}>
            Score progression over time
          </div>
          
          {score_timeline.length < 2 ? (
            <div style={{ height: '280px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed var(--card-border)', borderRadius: '8px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
              <div style={{ fontSize: '14px', color: 'var(--paper-dim)' }}>Complete 2+ sessions to see your trend</div>
            </div>
          ) : (
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={score_timeline} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(27, 35, 64, 0.03)" />
                  <XAxis dataKey="session_number" tickFormatter={(v) => `Session #${v}`} tick={{ fontSize: 11, fill: 'var(--paper-dimmer)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--paper-dimmer)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  <Line name="overall" type="monotone" dataKey="overall" stroke="#6366f1" strokeWidth={2.5} activeDot={{ r: 8 }} />
                  <Line name="dsa" type="monotone" dataKey="dsa" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="5 5" />
                  <Line name="technical" type="monotone" dataKey="technical" stroke="#2dd4bf" strokeWidth={1.5} strokeDasharray="5 5" />
                  <Line name="hr" type="monotone" dataKey="hr" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* SECTION 3 — ROUND AVERAGES (3 cards) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {['dsa', 'technical', 'hr'].map((key) => {
            const avg = averages[key] || 0;
            const trendVal = trends[key] || 0;
            const roundLabel = key === 'dsa' ? 'DSA Algorithmic' : key === 'technical' ? 'Systems & Architecture' : 'Behavioural HR';
            
            let statusText = "Developing — needs more practice";
            if (avg >= 75) statusText = "Strong area — keep practicing";
            else if (avg < 50) statusText = "Weak area — focus here";

            return (
              <Card key={key} style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {roundLabel}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: trendVal >= 0 ? 'rgba(46, 125, 50, 0.08)' : 'rgba(198, 40, 40, 0.08)',
                    color: trendVal >= 0 ? 'var(--prompter-green)' : 'var(--rec-red)',
                    border: trendVal >= 0 ? '1px solid rgba(46, 125, 50, 0.15)' : '1px solid rgba(198, 40, 40, 0.15)'
                  }}>
                    {trendVal >= 0 ? `+${trendVal}` : trendVal}%
                  </div>
                </div>

                <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--paper)', marginBottom: '12px', background: 'linear-gradient(135deg, var(--paper) 0%, var(--paper-dim) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {Math.round(avg)}%
                </div>

                {/* Progress Bar */}
                <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                  <div style={{
                    height: '100%',
                    width: `${avg}%`,
                    background: 'linear-gradient(90deg, #6366f1 0%, #4F46E5 100%)',
                    borderRadius: '999px'
                  }} />
                </div>

                <div style={{ fontSize: '12px', color: 'var(--paper-dim)' }}>
                  {statusText}
                </div>
              </Card>
            );
          })}
        </div>

        {/* SECTION 4 — WEAK AREAS (YOUR FOCUS AREA) */}
        {weakestRound && (
          <Card 
            style={{ 
              padding: '28px', 
              marginBottom: '32px', 
              background: 'var(--panel-bg)',
              borderLeft: '4px solid var(--spotlight)' 
            }} 
            hoverable={false}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--spotlight)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px' }}>
              YOUR FOCUS AREA
            </div>
            
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Based on your sessions, your weakest area is {weakestRound.name} with an average of {Math.round(weakestRound.avg_score)}/100.
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {weakestRoundSuggestions.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--spotlight)', fontSize: '14px', flexShrink: 0, lineHeight: 1.4 }}>➔</span>
                  <span style={{ fontSize: '14px', color: 'var(--paper-dim)', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>

            <Button 
              variant="primary" 
              onClick={() => navigate('/upload')}
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                color: '#FFFFFF'
              }}
            >
              Practice {weakestRound.name} now →
            </Button>
          </Card>
        )}

        {/* SECTION 5 — SESSION HISTORY TABLE */}
        <Card style={{ padding: '24px', marginBottom: '32px', background: 'var(--panel-bg)', overflowX: 'auto' }} hoverable={false}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--paper)', marginBottom: '20px' }}>
            Session History
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                {['#', 'Date', 'DSA', 'Technical', 'HR', 'Overall', 'Action'].map((th) => (
                  <th key={th} style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 700, color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {score_timeline.map((s) => {
                const isBest = best_session && s.session_id === best_session.session_id;
                const formattedDate = s.date 
                  ? new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'N/A';

                return (
                  <tr 
                    key={s.session_id} 
                    style={{ 
                      borderBottom: '1px solid var(--card-border)',
                      background: isBest ? 'rgba(217, 142, 43, 0.02)' : 'transparent',
                      borderLeft: isBest ? '2px solid var(--spotlight)' : 'none',
                    }}
                  >
                    <td style={{ padding: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--paper)' }}>
                      Session #{s.session_number}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: 'var(--paper-dim)' }}>
                      {formattedDate}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', fontWeight: 500, color: s.dsa >= 75 ? 'var(--prompter-green)' : s.dsa >= 50 ? 'var(--spotlight)' : 'var(--rec-red)' }}>
                      {s.dsa}%
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', fontWeight: 500, color: s.technical >= 75 ? 'var(--prompter-green)' : s.technical >= 50 ? 'var(--spotlight)' : 'var(--rec-red)' }}>
                      {s.technical}%
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', fontWeight: 500, color: s.hr >= 75 ? 'var(--prompter-green)' : s.hr >= 50 ? 'var(--spotlight)' : 'var(--rec-red)' }}>
                      {s.hr}%
                    </td>
                    <td style={{ padding: '16px', fontSize: '15px', fontWeight: 700, color: 'var(--paper)' }}>
                      {s.overall}%
                    </td>
                    <td style={{ padding: '16px' }}>
                      <button 
                        onClick={() => navigate(`/report/${candidateId}`)}
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: '#6366F1', 
                          fontSize: '13px', 
                          fontWeight: 600, 
                          cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                          textDecoration: 'underline'
                        }}
                      >
                        View Report
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* SECTION 6 — READINESS BREAKDOWN */}
        <Card style={{ padding: '24px', background: 'var(--panel-bg)' }} hoverable={false}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              cursor: 'pointer' 
            }}
            onClick={() => setShowCalculation(!showCalculation)}
          >
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--paper)' }}>
              How is readiness calculated?
            </div>
            <button style={{ background: 'none', border: 'none', color: 'var(--paper-dim)', cursor: 'pointer' }}>
              {showCalculation ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>
          </div>

          {showCalculation && readiness_breakdown && (
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s ease' }}>
              {/* Latest score contribution */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--paper-dim)' }}>Latest score contribution (40% weight)</span>
                  <span style={{ fontWeight: 600, color: 'var(--paper)' }}>{readiness_breakdown.latest_score_factor}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(readiness_breakdown.latest_score_factor / 40) * 100}%`, background: '#6366f1', borderRadius: '999px' }} />
                </div>
              </div>

              {/* Improvement trend */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--paper-dim)' }}>Improvement trend (30% weight)</span>
                  <span style={{ fontWeight: 600, color: 'var(--paper)' }}>{readiness_breakdown.trend_factor}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(readiness_breakdown.trend_factor / 30) * 100}%`, background: '#a855f7', borderRadius: '999px' }} />
                </div>
              </div>

              {/* Consistency */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--paper-dim)' }}>Consistency factor (20% weight)</span>
                  <span style={{ fontWeight: 600, color: 'var(--paper)' }}>{readiness_breakdown.consistency_factor}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(readiness_breakdown.consistency_factor / 20) * 100}%`, background: '#2dd4bf', borderRadius: '999px' }} />
                </div>
              </div>

              {/* Sessions done */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--paper-dim)' }}>Sessions completed factor (10% weight)</span>
                  <span style={{ fontWeight: 600, color: 'var(--paper)' }}>{readiness_breakdown.sessions_factor}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(readiness_breakdown.sessions_factor / 10) * 100}%`, background: '#f59e0b', borderRadius: '999px' }} />
                </div>
              </div>
            </div>
          )}
        </Card>

      </main>
    </div>
  );
}
