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
      return new Promise(() => { }); // Keep it pending to discard silently
    }
    return Promise.reject(error);
  }
);


const getWsUrl = () => {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${wsProtocol}//${hostname}:8002`;
    }
    return `${wsProtocol}//${hostname}${port ? `:${port}` : ''}`;
  }

  return 'ws://localhost:8002';
};

const WS_URL = getWsUrl();

console.log("VITE_WS_URL =", import.meta.env.VITE_WS_URL);
console.log("WS_URL =", WS_URL);

// Close codes that indicate a permanent server-side rejection (not transient network drops).
// We must NOT reconnect on these — doing so causes the infinite loop visible in the logs:
//   4000 = invalid session_id format
//   4003 = auth token missing / invalid / access denied
//   4004 = session not found
const PERMANENT_CLOSE_CODES = new Set([4000, 4003, 4004]);

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
  enabled = true,   // set to false to defer connection until auth is confirmed
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
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const voiceEnabledRef = useRef(true);

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
  // NOTE: `enabled` is in deps so the callback is re-created when auth resolves,
  // ensuring the fresh access token in localStorage is read at connection time.
  const connect = useCallback(() => {
    if (!sessionId) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    // Attach the access token as a query parameter so the backend can authenticate
    // the WebSocket handshake. Browsers don't allow custom headers on WS connections,
    // so the token must go in the URL. The backend reads ?token=<jwt> to verify identity.
    const token = localStorage.getItem('access_token') || '';
    const wsUrl = token
      ? `${WS_URL}/ws/interview/${sessionId}?token=${encodeURIComponent(token)}`
      : `${WS_URL}/ws/interview/${sessionId}`;

    const ws = new WebSocket(wsUrl);
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
          if (msg.voice_enabled !== undefined) {
            voiceEnabledRef.current = !!msg.voice_enabled;
            setVoiceEnabled(!!msg.voice_enabled);
          }
          break;

        case 'state_change': {
          const newState = msg.state;
          console.log('[WS] State:', newState);
          setTurnState(newState);
          callbacksRef.current.onStateChange?.(newState, msg.message);

          // AUTO-MIC: start recording when LISTENING, stop when AI speaks
          if (newState === 'listening') {
            // Small delay so AudioContext is ready
            if (voiceEnabledRef.current) {
              setTimeout(() => startRecordingRef.current?.(), 150);
            }
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

    ws.onclose = (event) => {
      setIsConnected(false);

      // Do NOT reconnect on permanent server-side rejections.
      // These are auth failures or invalid IDs — retrying will always fail
      // and creates the reconnect storm visible in the server logs.
      if (PERMANENT_CLOSE_CODES.has(event.code)) {
        console.warn(`[WS] Permanent close (code ${event.code}: ${event.reason}). Not reconnecting.`);
        setStatus('disconnected');
        if (event.code === 4003) {
          callbacksRef.current.onError?.('Session authentication failed. Please refresh and try again.');
        }
        return;
      }

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
  }, [sessionId, enabled]);

  // Keep references updated on every render
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;
  endRoundRef.current = endRound;
  drainQueueRef.current = drainQueue;
  sendRef.current = send;
  connectRef.current = connect;

  useEffect(() => {
    if (!enabled) return;   // don't open until caller says auth is ready
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      audioCtxRef.current?.close();
    };
  }, [connect, enabled]);

  return {
    isConnected, status, turnState, volume,
    isRecording, hasPermission, isSpeaking, voiceEnabled,
    unlockAudio, startRound, sendText, endRound,
    startRecording, stopRecording, destroyAll,
  };
}
