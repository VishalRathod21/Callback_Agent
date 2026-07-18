import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios, { API_BASE } from '../api/client';
import Navbar from '../components/ui/Navbar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const TOPIC_DETAILS = {
  dsa_theory: {
    title: "DSA Theory",
    color: "#a855f7",
    description: "Time complexity, algorithms, data structures explained verbally",
    meta: "6 questions · ~10 min",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    )
  },
  system_design: {
    title: "System Design",
    color: "#3b82f6",
    description: "Scalability, architecture, trade-off discussions",
    meta: "6 questions · ~10 min",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="10" x2="6" y2="14" />
      </svg>
    )
  },
  behavioral: {
    title: "Behavioral",
    color: "#14b8a6",
    description: "STAR method, situational responses, communication",
    meta: "6 questions · ~10 min",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  },
  random: {
    title: "Random Mix",
    color: "#f59e0b",
    description: "Mix of all categories — simulate real variety",
    meta: "6 questions · ~10 min",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
        <polyline points="16 3 21 3 21 8" />
        <line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" />
        <line x1="15" y1="15" x2="21" y2="21" />
        <line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    )
  }
};

export default function QuickPractice() {
  const navigate = useNavigate();
  const location = useLocation();

  // State Management
  const [step, setStep] = useState(1); // 1: Selection, 2: Q&A, 3: Feedback, 4: Results
  const [selectedTopic, setSelectedTopic] = useState(null);

  useEffect(() => {
    if (location.state && location.state.preselectedTopic) {
      setSelectedTopic(location.state.preselectedTopic);
    }
  }, [location.state]);
  const [targetRole, setTargetRole] = useState('Software Engineer');
  const [candidateId, setCandidateId] = useState('');
  
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [summary, setSummary] = useState(null);
  const [questionsHistory, setQuestionsHistory] = useState([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Timer & Speech Recognition
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const storedId = localStorage.getItem('candidateId');
    if (storedId) {
      setCandidateId(storedId);
    }
  }, []);

  // Timer Effect
  useEffect(() => {
    if (step === 2 || step === 3) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const formatTime = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Web Speech API
  const toggleRecording = () => {
    if (isRecording) {
      if (recognition) {
        recognition.stop();
      }
      setIsRecording(false);
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Voice recognition is not supported in this browser. Please use Chrome or Safari.");
        return;
      }
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
      };

      rec.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setAnswerText((prev) => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      rec.onerror = (e) => {
        console.error("Speech recognition error:", e);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      rec.start();
      setRecognition(rec);
    }
  };

  const startPracticeSession = async () => {
    if (!selectedTopic) return;
    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE}/practice/start`, {
        topic: selectedTopic,
        target_role: targetRole,
        candidate_id: candidateId || null,
        question_count: 6
      });
      setSession(res.data);
      setCurrentQuestion(res.data.first_question);
      setQuestionsHistory([res.data.first_question]);
      setAnswerText('');
      setSeconds(0);
      setStep(2);
    } catch (err) {
      console.error("Failed to start practice:", err);
      alert("Error starting practice session.");
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (skip = false) => {
    if (isRecording && recognition) {
      recognition.stop();
    }
    
    const ans = skip ? "I will skip this question." : answerText.trim();
    if (!skip && ans.length < 5) {
      alert("Please write a complete answer (at least 5 characters).");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE}/practice/answer`, {
        session_id: session.session_id,
        question_id: currentQuestion.id,
        answer: ans
      });

      setEvaluation(res.data.evaluation);
      
      // Update history with response data
      setQuestionsHistory((prev) =>
        prev.map((q) =>
          q.id === currentQuestion.id
            ? { ...q, answered: true, candidate_answer: ans, score: res.data.evaluation.score, feedback: res.data.evaluation }
            : q
        )
      );

      setStep(3); // Show Feedback State

      if (res.data.session_complete) {
        setSummary(res.data.summary);
      } else {
        // Pre-fetch/set next question for later navigation
        setSession((prev) => ({
          ...prev,
          next_question: res.data.next_question
        }));
      }
    } catch (err) {
      console.error("Error evaluating answer:", err);
      alert("Error evaluating answer.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (summary) {
      setStep(4); // Results State
    } else {
      const nextQ = session.next_question;
      setCurrentQuestion(nextQ);
      setQuestionsHistory((prev) => [...prev, nextQ]);
      setAnswerText('');
      setEvaluation(null);
      setStep(2); // Back to Q&A
    }
  };

  const saveToDatabase = async () => {
    if (!candidateId || !summary || saving) return;
    try {
      setSaving(true);
      await axios.post(`${API_BASE}/practice/save`, {
        candidate_id: candidateId,
        session_id: session.session_id,
        topic: selectedTopic,
        average_score: summary.average_score
      });
      setSaved(true);
      setTimeout(() => {
        navigate(`/dashboard/${candidateId}`);
      }, 1500);
    } catch (err) {
      console.error("Error saving progress:", err);
      alert("Could not save to progress dashboard.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--stage-black)', color: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', position: 'relative' }}>
      
      {/* Background Glowing Orbs */}
      <div style={{ position: 'fixed', top: '-10%', left: '20%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '20%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(55px)', pointerEvents: 'none', zIndex: 0 }} />

      <Navbar />

      <main style={{ flex: 1, maxWidth: '720px', width: '100%', margin: '0 auto', padding: '110px 24px 80px', position: 'relative', zIndex: 1 }}>
        
        {/* STEP 1: TOPIC SELECTION */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <h1 style={{ fontSize: '32px', fontWeight: 800, background: 'linear-gradient(135deg, var(--paper) 0%, var(--paper-dim) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>
                Quick Practice
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--paper-dim)' }}>
                10-minute warm-up · No setup · Instant feedback
              </p>
            </div>

            {/* Grid of Topics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
              {Object.entries(TOPIC_DETAILS).map(([key, details]) => {
                const isSelected = selectedTopic === key;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedTopic(key)}
                    style={{
                      background: 'var(--panel-bg)',
                      border: isSelected ? `2px solid ${details.color}` : '1px solid var(--card-border)',
                      borderRadius: '16px',
                      padding: '24px',
                      cursor: 'pointer',
                      boxShadow: isSelected ? `0 0 20px rgba(99, 102, 241, 0.15)` : 'var(--shadow-sm)',
                      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      transform: isSelected ? 'translateY(-4px)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = details.color;
                        e.currentTarget.style.transform = 'translateY(-3px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'var(--card-border)';
                        e.currentTarget.style.transform = 'none';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      {details.icon}
                      <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--paper)' }}>{details.title}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--paper-dim)', lineHeight: 1.5, marginBottom: '16px', minHeight: '40px' }}>
                      {details.description}
                    </p>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {details.meta}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Target Role input */}
            <Card style={{ padding: '20px', background: 'var(--panel-bg)', marginBottom: '32px' }} hoverable={false}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--paper-dimmer)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                Your Target Role (Optional)
              </label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Frontend Engineer, Product Manager..."
                style={{
                  width: '100%',
                  height: '42px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--paper)',
                  padding: '0 16px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </Card>

            <Button
              variant="primary"
              onClick={startPracticeSession}
              disabled={!selectedTopic || loading}
              fullWidth
              style={{
                height: '50px',
                background: selectedTopic 
                  ? `linear-gradient(135deg, ${TOPIC_DETAILS[selectedTopic].color} 0%, #4F46E5 100%)`
                  : 'var(--text-primary)',
                color: '#FFFFFF'
              }}
            >
              {loading ? 'Initializing warmup...' : 'Start Practice →'}
            </Button>
          </div>
        )}

        {/* STEP 2 & 3: Q&A / FEEDBACK STATE */}
        {(step === 2 || step === 3) && currentQuestion && (
          <div style={{ animation: 'fadeIn 0.25s ease' }}>
            {/* Top progress bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--paper-dimmer)', textTransform: 'uppercase' }}>
                Question {currentQuestion.id} of {session.total_questions}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)', textTransform: 'uppercase', color: TOPIC_DETAILS[selectedTopic].color }}>
                  {TOPIC_DETAILS[selectedTopic].title}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--paper-dim)' }}>
                  {formatTime(seconds)}
                </span>
              </div>
            </div>

            {/* Progress track */}
            <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '999px', overflow: 'hidden', marginBottom: '32px' }}>
              <div style={{
                height: '100%',
                width: `${(currentQuestion.id / session.total_questions) * 100}%`,
                background: `linear-gradient(90deg, ${TOPIC_DETAILS[selectedTopic].color} 0%, #4F46E5 100%)`,
                transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }} />
            </div>

            {/* Question card */}
            <Card style={{ padding: '28px', background: 'var(--panel-bg)', borderLeft: `3px solid ${TOPIC_DETAILS[selectedTopic].color}`, marginBottom: '24px' }} hoverable={false}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: TOPIC_DETAILS[selectedTopic].color, fontFamily: 'var(--font-mono)' }}>
                  Q{currentQuestion.id}
                </span>
                <p style={{ fontSize: '18px', fontWeight: 500, color: 'var(--paper)', lineHeight: 1.6, margin: 0 }}>
                  {currentQuestion.question}
                </p>
              </div>
            </Card>

            {/* Q&A Active Input */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Type your answer here... speak clearly and specifically to get detailed advice."
                    disabled={loading}
                    style={{
                      width: '100%',
                      minHeight: '160px',
                      borderRadius: '12px',
                      border: '1px solid var(--card-border)',
                      background: 'rgba(255,255,255,0.02)',
                      color: 'var(--paper)',
                      padding: '16px',
                      fontSize: '14px',
                      lineHeight: 1.7,
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                  
                  {/* Floating Voice/Mic Input button */}
                  <button
                    onClick={toggleRecording}
                    style={{
                      position: 'absolute',
                      right: '16px',
                      bottom: '16px',
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      border: isRecording ? '2px solid var(--spotlight)' : '1px solid var(--card-border)',
                      background: isRecording ? 'rgba(217, 142, 43, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      animation: isRecording ? 'pulse 1.5s infinite ease-in-out' : 'none'
                    }}
                  >
                    {isRecording ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--spotlight)" strokeWidth="2.5">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--paper-dim)" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                      </svg>
                    )}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button variant="ghost" onClick={() => submitAnswer(true)} disabled={loading}>
                    Skip this question
                  </Button>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--paper-dimmer)' }}>
                      {answerText.length} chars
                    </span>
                    <Button 
                      variant="primary" 
                      onClick={() => submitAnswer(false)} 
                      loading={loading}
                      disabled={loading || answerText.trim().length < 5}
                      style={{
                        background: `linear-gradient(135deg, ${TOPIC_DETAILS[selectedTopic].color} 0%, #4F46E5 100%)`,
                        color: '#FFFFFF'
                      }}
                    >
                      Submit Answer →
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* FEEDBACK STATE CARD */}
            {step === 3 && evaluation && (
              <div style={{ animation: 'slideIn 0.3s ease-out' }}>
                <Card style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', marginBottom: '32px' }} hoverable={false}>
                  {/* Top Verdict Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--card-border)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>SCORE:</span>
                      <span style={{
                        fontSize: '32px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        color: evaluation.score >= 7 ? 'var(--prompter-green)' : evaluation.score >= 4 ? 'var(--spotlight)' : 'var(--rec-red)'
                      }}>
                        {evaluation.score}/10
                      </span>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: evaluation.verdict === 'strong' ? 'rgba(46, 125, 50, 0.1)' : evaluation.verdict === 'decent' ? 'rgba(217, 142, 43, 0.1)' : 'rgba(198, 40, 40, 0.1)',
                      color: evaluation.verdict === 'strong' ? 'var(--prompter-green)' : evaluation.verdict === 'decent' ? 'var(--spotlight)' : 'var(--rec-red)',
                      border: evaluation.verdict === 'strong' ? '1px solid rgba(46,125,50,0.2)' : evaluation.verdict === 'decent' ? '1px solid rgba(217,142,43,0.2)' : '1px solid rgba(198,40,40,0.2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}>
                      {evaluation.verdict ? evaluation.verdict.replace('_', ' ') : 'DECENT'}
                    </span>
                  </div>

                  {/* Feedback Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Strength */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ color: 'var(--prompter-green)', fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>✔</div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '2px' }}>STRENGTH</div>
                        <p style={{ fontSize: '13px', color: 'var(--paper-dim)', margin: 0, lineHeight: 1.4 }}>{evaluation.strength}</p>
                      </div>
                    </div>

                    {/* Gap */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ color: 'var(--spotlight)', fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>▲</div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '2px' }}>GAP</div>
                        <p style={{ fontSize: '13px', color: 'var(--paper-dim)', margin: 0, lineHeight: 1.4 }}>{evaluation.gap}</p>
                      </div>
                    </div>

                    {/* Tip */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ color: '#6366F1', fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>💡</div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--paper-dimmer)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '2px' }}>TIP</div>
                        <p style={{ fontSize: '13px', color: 'var(--paper-dim)', margin: 0, lineHeight: 1.4 }}>{evaluation.tip}</p>
                      </div>
                    </div>
                  </div>
                </Card>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="primary"
                    onClick={handleNext}
                    style={{
                      background: `linear-gradient(135deg, ${TOPIC_DETAILS[selectedTopic].color} 0%, #4F46E5 100%)`,
                      color: '#FFFFFF'
                    }}
                  >
                    {summary ? 'See Results →' : 'Next Question →'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: RESULTS SUMMARY */}
        {step === 4 && summary && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <Card style={{ padding: '36px', background: 'var(--panel-bg)', textAlign: 'center', marginBottom: '32px' }} hoverable={false}>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Practice Complete!
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--paper-dimmer)', marginBottom: '32px' }}>
                Topic: <strong>{TOPIC_DETAILS[selectedTopic].title}</strong> · {summary.total_questions} questions
              </p>

              {/* Big Score Breakdown */}
              <div style={{ display: 'inline-block', marginBottom: '32px' }}>
                <span style={{ fontSize: '12px', color: 'var(--paper-dimmer)', display: 'block', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>Average score</span>
                <span style={{ fontSize: '56px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--spotlight)', lineHeight: 1 }}>
                  {summary.average_score}/10
                </span>
              </div>

              {/* Score breakdown pills */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '12px' }}>
                <div style={{ padding: '6px 14px', borderRadius: '24px', background: 'rgba(46, 125, 50, 0.08)', border: '1px solid rgba(46, 125, 50, 0.15)', color: 'var(--prompter-green)', fontSize: '13px', fontWeight: 600 }}>
                  {summary.strong} Strong
                </div>
                <div style={{ padding: '6px 14px', borderRadius: '24px', background: 'rgba(217, 142, 43, 0.08)', border: '1px solid rgba(217, 142, 43, 0.15)', color: 'var(--spotlight)', fontSize: '13px', fontWeight: 600 }}>
                  {summary.decent} Decent
                </div>
                <div style={{ padding: '6px 14px', borderRadius: '24px', background: 'rgba(198, 40, 40, 0.08)', border: '1px solid rgba(198, 40, 40, 0.15)', color: 'var(--rec-red)', fontSize: '13px', fontWeight: 600 }}>
                  {summary.needs_work} Needs Work
                </div>
              </div>
            </Card>

            {/* Collapsible Question Review */}
            <Card style={{ padding: '24px', background: 'var(--panel-bg)', marginBottom: '32px' }} hoverable={false}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--paper)', marginBottom: '20px' }}>
                Question Review
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {questionsHistory.map((q) => {
                  const isExpanded = expandedQuestionId === q.id;
                  const scoreColor = q.score >= 7 ? 'var(--prompter-green)' : q.score >= 4 ? 'var(--spotlight)' : 'var(--rec-red)';

                  return (
                    <div 
                      key={q.id} 
                      style={{ 
                        border: '1px solid var(--card-border)', 
                        borderRadius: '8px', 
                        background: 'rgba(255,255,255,0.01)',
                        overflow: 'hidden'
                      }}
                    >
                      <div 
                        onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                        style={{ 
                          padding: '16px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          cursor: 'pointer' 
                        }}
                      >
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: scoreColor, fontFamily: 'var(--font-mono)' }}>
                            [{q.score}/10]
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--paper)', fontWeight: 500, textAlign: 'left' }}>
                            {q.question.length > 60 ? `${q.question.substring(0, 60)}...` : q.question}
                          </span>
                        </div>
                        <span style={{ color: 'var(--paper-dimmer)', fontSize: '12px' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>

                      {isExpanded && q.feedback && (
                        <div style={{ padding: '16px', borderTop: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.08)', fontSize: '13px', lineHeight: 1.5 }}>
                          <div style={{ marginBottom: '12px' }}>
                            <strong>Your Answer:</strong>
                            <p style={{ color: 'var(--paper-dim)', margin: '4px 0 0 0', fontStyle: 'italic' }}>{q.candidate_answer}</p>
                          </div>
                          <div>
                            <strong>Actionable Tip:</strong>
                            <p style={{ color: '#6366F1', margin: '4px 0 0 0' }}>{q.feedback.tip}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Action Row */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => {
                setStep(1);
                setSelectedTopic(null);
                setSession(null);
                setSummary(null);
                setEvaluation(null);
                setSeconds(0);
              }}>
                Try Different Topic
              </Button>
              
              <Button variant="outline" onClick={startPracticeSession}>
                Practice Again
              </Button>

              <Button variant="primary" onClick={() => navigate('/upload')} style={{ background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)', color: '#FFFFFF' }}>
                Start Full Interview
              </Button>

              {candidateId && (
                <Button 
                  variant="primary" 
                  onClick={saveToDatabase}
                  loading={saving}
                  disabled={saving || saved}
                  style={{
                    background: saved ? 'var(--prompter-green)' : 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                    color: '#FFFFFF'
                  }}
                >
                  {saved ? 'Progress Saved!' : 'Save to Progress'}
                </Button>
              )}
            </div>
          </div>
        )}

      </main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217, 142, 43, 0.4); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(217, 142, 43, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217, 142, 43, 0); }
        }
      `}</style>
    </div>
  );
}
