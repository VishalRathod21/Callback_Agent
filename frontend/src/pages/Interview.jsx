import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInterviewStore } from '../store/interviewStore';

const WS_BASE = 'ws://localhost:8002/ws/interview';

export default function Interview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Zustand Store
  const candidate = useInterviewStore((state) => state.candidate);
  const session = useInterviewStore((state) => state.session);
  const transcript = useInterviewStore((state) => state.transcript);
  const isConnected = useInterviewStore((state) => state.isConnected);
  const isRecording = useInterviewStore((state) => state.isRecording);
  
  const setSession = useInterviewStore((state) => state.setSession);
  const addTranscript = useInterviewStore((state) => state.addTranscript);
  const clearTranscript = useInterviewStore((state) => state.clearTranscript);
  const setConnected = useInterviewStore((state) => state.setConnected);
  const setRecording = useInterviewStore((state) => state.setRecording);

  // References
  const ws = useRef(null);
  const mediaRecorder = useRef(null);
  const audioContext = useRef(null);
  const audioStream = useRef(null);
  const chatEndRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  // Component States
  const [activeRound, setActiveRound] = useState('');
  const [roundCompleteInfo, setRoundCompleteInfo] = useState(null);
  const [error, setError] = useState('');
  const [micPermission, setMicPermission] = useState(false);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Request mic permission on mount
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        setMicPermission(true);
        stream.getTracks().forEach(track => track.stop());
      })
      .catch((err) => {
        console.error('Mic permission denied', err);
        setError('Microphone access is required for voice rounds.');
      });
  }, []);

  // Initialize WebSocket Connection
  useEffect(() => {
    if (!sessionId) return;

    console.log('Connecting to interview socket for session', sessionId);
    ws.current = new WebSocket(`${WS_BASE}/${sessionId}`);

    ws.current.onopen = () => {
      setConnected(true);
      setError('');
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'transcript') {
        addTranscript({ speaker: 'candidate', text: msg.text });
      } 
      else if (msg.type === 'ai_response') {
        addTranscript({ speaker: 'interviewer', text: msg.text });
      } 
      else if (msg.type === 'audio') {
        // Queue base64 audio response for sequential playback
        playAudioData(msg.data);
      } 
      else if (msg.type === 'round_complete') {
        setRoundCompleteInfo(msg);
        setActiveRound('');
        stopRecording();
      } 
      else if (msg.type === 'interview_complete') {
        // Redirect to report page after a short delay
        setTimeout(() => {
          if (candidate?.id) {
            navigate(`/report/${candidate.id}`);
          } else {
            navigate('/');
          }
        }, 3000);
      } 
      else if (msg.type === 'error') {
        setError(msg.message);
      }
    };

    ws.current.onclose = (event) => {
      setConnected(false);
      if (event.code === 4004) {
        setError('Interview session could not be verified.');
      } else {
        console.log('WebSocket connection closed');
      }
    };

    ws.current.onerror = (err) => {
      console.error('WebSocket encountered an error', err);
    };

    return () => {
      if (ws.current) ws.current.close();
      stopRecording();
    };
  }, [sessionId]);

  // Sequential audio playback queue
  const playAudioData = (base64Data) => {
    audioQueueRef.current.push(base64Data);
    if (!isPlayingRef.current) {
      processAudioQueue();
    }
  };

  const processAudioQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const nextData = audioQueueRef.current.shift();
    
    try {
      const binaryString = atob(nextData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onended = () => {
        URL.revokeObjectURL(url);
        processAudioQueue();
      };

      audio.play().catch(err => {
        console.error('Audio playback failed', err);
        processAudioQueue();
      });
    } catch (e) {
      console.error('Failed to decode audio bytes', e);
      processAudioQueue();
    }
  };

  // Start a specific round (DSA, Tech, HR)
  const startRound = (roundName) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    setError('');
    clearTranscript();
    setRoundCompleteInfo(null);
    setActiveRound(roundName);

    // Update Zustand session state
    setSession({
      ...session,
      currentRound: roundName,
      status: 'active'
    });

    ws.current.send(JSON.stringify({
      type: 'start_round',
      round: roundName
    }));

    // Automatically turn on recording for the voice stream
    startRecording();
  };

  // Audio Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.current = stream;

      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && ws.current && ws.current.readyState === WebSocket.OPEN) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            ws.current.send(JSON.stringify({
              type: 'audio_chunk',
              data: base64data
            }));
          };
          reader.readAsDataURL(e.data);
        }
      };

      // Slice audio in 1-second chunks
      mediaRecorder.current.start(1000);
      setRecording(true);
    } catch (err) {
      console.error('Failed to capture microphone stream', err);
      setError('Failed to capture audio stream from microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    if (audioStream.current) {
      audioStream.current.getTracks().forEach(track => track.stop());
    }
    setRecording(false);
  };

  const triggerEndRound = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'end_round' }));
    }
  };

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '24px auto',
      padding: '0 24px',
      display: 'grid',
      gridTemplateColumns: '350px 1fr',
      gap: '24px',
      height: 'calc(100vh - 48px)',
      boxSizing: 'border-box'
    }}>
      {/* Left panel - Interrogator Control console */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: isConnected ? 'var(--color-success)' : 'var(--color-error)',
              boxShadow: isConnected ? '0 0 10px var(--color-success)' : 'none'
            }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              {isConnected ? 'LIVE AGENT LINK ACTIVE' : 'DISCONNECTED'}
            </span>
          </div>

          <h3 style={{ fontSize: '24px', marginBottom: '6px' }}>Console</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
            Select a round to initiate voice evaluation.
          </p>

          {error && (
            <div className="glass-panel" style={{ padding: '12px', borderColor: 'var(--color-error)', background: 'var(--color-error-bg)', color: '#fff', fontSize: '12px', borderRadius: '8px', marginBottom: '20px' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Round selectors */}
          {!activeRound && !roundCompleteInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button className="btn-secondary" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => startRound('dsa')}>
                <span>💻</span> DSA Algorithmic Round
              </button>
              <button className="btn-secondary" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => startRound('technical')}>
                <span>⚙️</span> Systems & Deep Tech Round
              </button>
              <button className="btn-secondary" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => startRound('hr')}>
                <span>🤝</span> Behavioural HR Round
              </button>
            </div>
          )}

          {/* Active Round Controls */}
          {activeRound && (
            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-cyan)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ textTransform: 'uppercase', fontSize: '12px', color: 'var(--accent-cyan)', letterSpacing: '0.05em' }}>
                ROUND {activeRound} IN PROGRESS
              </h4>

              {/* Animated Microphone Avatar */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: isRecording ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: isRecording ? '2px solid var(--accent-cyan)' : '2px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isRecording ? 'pulseGlow 2s infinite ease-in-out' : 'none'
                }}>
                  <span style={{ fontSize: '32px' }}>🎤</span>
                </div>
              </div>

              {isRecording && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className="wave-container">
                    <div className="wave-bar" />
                    <div className="wave-bar" />
                    <div className="wave-bar" />
                    <div className="wave-bar" />
                    <div className="wave-bar" />
                  </div>
                </div>
              )}

              <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--color-error) 0%, #b91c1c 100%)', boxShadow: '0 4px 14px rgba(239,68,68,0.4)', width: '100%' }} onClick={triggerEndRound}>
                Finish Round
              </button>
            </div>
          )}

          {/* Round Score summary card */}
          {roundCompleteInfo && (
            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-success)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ textTransform: 'uppercase', fontSize: '12px', color: 'var(--color-success)', letterSpacing: '0.05em' }}>
                ✓ Round Evaluated
              </h4>
              <h3 style={{ fontSize: '28px' }}>{roundCompleteInfo.score?.toFixed(0)}%</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {roundCompleteInfo.feedback}
              </p>
              <button className="btn-primary" style={{ marginTop: '8px' }} onClick={() => setRoundCompleteInfo(null)}>
                Start Next Round
              </button>
            </div>
          )}
        </div>

        <button className="btn-secondary" onClick={() => { if (candidate?.id) navigate(`/report/${candidate.id}`); else navigate('/'); }}>
          Exit Workspace
        </button>
      </div>

      {/* Right panel - Live dialogue stream flow */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '18px' }}>Dialogue History</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-time transcript updates
          </span>
        </div>

        {/* Chats stream container */}
        <div style={{
          flexGrow: 1,
          padding: '24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: 'rgba(0,0,0,0.1)'
        }}>
          {transcript.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '48px', marginBottom: '16px' }}>💬</span>
              <p>Dialogue stream is currently inactive.</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>Rounds use microphone-based inputs.</p>
            </div>
          ) : (
            transcript.map((item, idx) => {
              const isMe = item.speaker === 'candidate';
              return (
                <div key={idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  alignSelf: isMe ? 'flex-end' : 'flex-start'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isMe ? 'Candidate' : 'Interviewer AI'}
                  </span>
                  <div className="glass-panel" style={{
                    padding: '12px 18px',
                    borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    background: isMe ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    borderColor: isMe ? 'rgba(139, 92, 246, 0.2)' : 'var(--border-color)',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: '#fff'
                  }}>
                    {item.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
}
