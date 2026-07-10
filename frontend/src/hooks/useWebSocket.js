import { useRef, useState, useCallback, useEffect } from 'react';
import { useAudioCapture } from './useAudioCapture';
import client from '../api/client';

// Deduplicate DSA submissions to prevent backend state corruption
const activeSubmissions = new Set();

client.interceptors.request.use(
  (config) => {
    if (config.url && config.url.includes('/dsa/submit')) {
      if (activeSubmissions.has(config.url)) {
        console.warn('[API Interceptor] Blocking duplicate DSA submission');
        return Promise.reject(new Error('DUPLICATE_SUBMISSION_BLOCKED'));
      }
      activeSubmissions.add(config.url);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (response) => {
    if (response.config?.url && response.config.url.includes('/dsa/submit')) {
      activeSubmissions.delete(response.config.url);
    }
    return response;
  },
  (error) => {
    if (error.config?.url && error.config.url.includes('/dsa/submit')) {
      activeSubmissions.delete(error.config.url);
    }
    if (error.message === 'DUPLICATE_SUBMISSION_BLOCKED') {
      return new Promise(() => {}); // Keep it pending to discard silently
    }
    return Promise.reject(error);
  }
);


const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8002';

// Turn states (mirrors backend)
export const STATE_IDLE = 'idle';
export const STATE_AI_SPEAKING = 'ai_speaking';
export const STATE_LISTENING = 'listening';
export const STATE_PROCESSING = 'processing';

export function useWebSocket({
  sessionId,
  onAITranscript,
  onCandidateTranscript,
  onStateChange,
  onRoundComplete,
  onError,
  volume: onVolumeChangeCallback,
  muted,
}) {
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const playingRef = useRef(false);
  const unlockedRef = useRef(false);
  const reconnectRef = useRef(0);
  const volumeRef = useRef(0);
  const shouldEndRoundRef = useRef(false);

  // Refs to stabilize callback dependencies and prevent reconnect loops
  const startRecordingRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const endRoundRef = useRef(null);
  const drainQueueRef = useRef(null);
  const sendRef = useRef(null);
  const connectRef = useRef(null);

  const [isConnected, setIsConnected] = useState(false);
  const [turnState, setTurnState] = useState(STATE_IDLE);
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState('disconnected');

  // Keep callback references fresh without triggering dependency changes
  const callbacksRef = useRef({
    onAITranscript,
    onCandidateTranscript,
    onStateChange,
    onRoundComplete,
    onError,
    volume: onVolumeChangeCallback,
  });

  useEffect(() => {
    callbacksRef.current = {
      onAITranscript,
      onCandidateTranscript,
      onStateChange,
      onRoundComplete,
      onError,
      volume: onVolumeChangeCallback,
    };
  });

  // ── Unlock AudioContext (MUST happen on user gesture) ──
  const unlockAudio = useCallback(async () => {
    if (unlockedRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      await ctx.close();
      unlockedRef.current = true;
      console.log('[Audio] Unlocked');
    } catch (e) {
      console.warn('[Audio] Unlock failed:', e);
    }
  }, []);

  // ── WebSocket Send Helper ──
  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // ── Audio capture integration ──
  const { startRecording, stopRecording, destroyAll, isRecording, hasPermission, isSpeaking } = useAudioCapture({
    onChunk: ({ data, duration_ms }) => {
      sendRef.current?.({ type: 'audio_chunk', data, duration_ms });
    },
    onFlush: () => {
      sendRef.current?.({ type: 'silence_detected' });
    },
    onSilenceDetected: () => {
      sendRef.current?.({ type: 'silence_detected' });
    },
    onVolumeChange: (v) => {
      setVolume(v);
      callbacksRef.current.volume?.(v);
    },
    muted,
  });

  // ── Round control helpers ──
  const startRound = useCallback((round, targetRole, resumeContext = '') => {
    send({ type: 'start_round', round, target_role: targetRole, resume_context: resumeContext });
  }, [send]);

  const sendText = useCallback((text) => {
    send({ type: 'candidate_text', text });
  }, [send]);

  const endRound = useCallback(() => {
    stopRecording();
    send({ type: 'end_round' });
  }, [send, stopRecording]);

  // ── Audio playback queue (sequential, never overlap) ──
  const drainQueue = useCallback(async () => {
    if (playingRef.current || audioQueueRef.current.length === 0) return;
    playingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const item = audioQueueRef.current.shift();
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        const bin = atob(item.data);
        const buf = new ArrayBuffer(bin.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);

        const audioBuf = await ctx.decodeAudioData(buf);
        await new Promise((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          src.onended = resolve;
          src.start(0);
        });
      } catch (err) {
        console.error('[Audio] Playback error:', err);
      }
    }
    playingRef.current = false;
    
    // Auto-trigger endRound once concluding speech has finished playing
    if (shouldEndRoundRef.current) {
      shouldEndRoundRef.current = false;
      endRoundRef.current?.();
    }
  }, []);

  // ── WebSocket Connection and Message Loop ──
  const connect = useCallback(() => {
    if (!sessionId) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }
    const ws = new WebSocket(`${WS_URL}/ws/interview/${sessionId}`);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setIsConnected(true);
      setStatus('connected');
      reconnectRef.current = 0;
      console.log('[WS] Connected');
    };

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'connected':
          console.log('[WS] Session ready');
          break;

        case 'state_change': {
          const newState = msg.state;
          console.log('[WS] State:', newState);
          setTurnState(newState);
          callbacksRef.current.onStateChange?.(newState, msg.message);
          
          // AUTO-MIC: start recording when LISTENING, stop when AI speaks
          if (newState === 'listening') {
            // Small delay so AudioContext is ready
            setTimeout(() => startRecordingRef.current?.(), 150);
          } else if (newState === 'ai_speaking' || newState === 'processing') {
            stopRecordingRef.current?.();
          }
          break;
        }

        case 'ai_response':
          callbacksRef.current.onAITranscript?.({ text: msg.text, speaker: msg.speaker });
          break;

        case 'transcript':
          callbacksRef.current.onCandidateTranscript?.({ text: msg.text });
          break;

        case 'ai_audio':
          audioQueueRef.current.push({ data: msg.data });
          drainQueueRef.current?.();
          break;

        case 'round_should_end':
          shouldEndRoundRef.current = true;
          // Fallback in case no audio is queued/played within 1.5 seconds
          setTimeout(() => {
            if (shouldEndRoundRef.current && !playingRef.current && audioQueueRef.current.length === 0) {
              shouldEndRoundRef.current = false;
              endRoundRef.current?.();
            }
          }, 1500);
          break;

        case 'round_complete':
          callbacksRef.current.onRoundComplete?.(msg);
          break;

        case 'interview_complete':
          callbacksRef.current.onRoundComplete?.({ ...msg, next_round: 'complete' });
          break;

        case 'error':
          console.error('[WS] Error:', msg.message);
          callbacksRef.current.onError?.(msg.message);
          break;

        case 'ping':
          sendRef.current?.({ type: 'pong' });
          break;
      }
    };

    ws.onerror = () => setStatus('error');

    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectRef.current < 3) {
        reconnectRef.current++;
        setStatus(`reconnecting...`);
        setTimeout(() => {
          connectRef.current?.();
        }, reconnectRef.current * 2000);
      } else {
        setStatus('disconnected');
      }
    };
  }, [sessionId]);

  // Keep references updated on every render
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;
  endRoundRef.current = endRound;
  drainQueueRef.current = drainQueue;
  sendRef.current = send;
  connectRef.current = connect;

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      audioCtxRef.current?.close();
    };
  }, [connect]);

  return {
    isConnected, status, turnState, volume,
    isRecording, hasPermission, isSpeaking,
    unlockAudio, startRound, sendText, endRound,
    startRecording, stopRecording, destroyAll,
  };
}
