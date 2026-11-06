/* Interview WebSocket hook — implements the v2 protocol (see backend/api/websocket.py).
 *
 * States: initializing | listening | processing | generating | speaking | waiting | completed | error
 * Every interviewer turn has a turn_id; audio for a turn is played sequentially and
 * `playback_finished` is sent back so the server can switch to listening precisely.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { useAudioCapture } from './useAudioCapture';

const getWsUrl = () => {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    if (hostname === 'localhost' || hostname === '127.0.0.1') return `${wsProtocol}//${hostname}:8002`;
    return `${wsProtocol}//${hostname}${port ? `:${port}` : ''}`;
  }
  return 'ws://localhost:8002';
};
const WS_URL = getWsUrl();

// Permanent server-side rejections: never reconnect on these.
const PERMANENT_CLOSE_CODES = new Set([4000, 4003, 4004]);

export const STATES = {
  INITIALIZING: 'initializing', LISTENING: 'listening', PROCESSING: 'processing', GENERATING: 'generating',
  SPEAKING: 'speaking', WAITING: 'waiting', COMPLETED: 'completed', ERROR: 'error',
};

export function useWebSocket({
  sessionId, enabled = true, voiceMode = true, muted = false,
  onAITranscript, onCandidateTranscript, onStateChange, onEvaluation, onRoundComplete, onInterviewComplete,
  onHistory, onError, onRedirect, volume: onVolumeChangeCallback,
}) {
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const playingRef = useRef(false);
  const reconnectRef = useRef(0);
  const seenTurnsRef = useRef(new Set());
  const closedByUsRef = useRef(false);

  const startRecordingRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const drainQueueRef = useRef(null);
  const sendRef = useRef(null);
  const connectRef = useRef(null);
  const voiceModeRef = useRef(voiceMode);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  const [isConnected, setIsConnected] = useState(false);
  const [turnState, setTurnState] = useState(STATES.INITIALIZING);
  const [stateMessage, setStateMessage] = useState('');
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState('disconnected');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [progress, setProgress] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const voiceEnabledRef = useRef(false);

  const callbacksRef = useRef({});
  useEffect(() => {
    callbacksRef.current = { onAITranscript, onCandidateTranscript, onStateChange, onEvaluation, onRoundComplete, onInterviewComplete, onHistory, onError, onRedirect, volume: onVolumeChangeCallback };
  });

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(data));
  }, []);

  const unlockAudio = useCallback(async () => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    } catch (e) { console.warn('[Audio] unlock failed', e); }
  }, []);

  const { startRecording, stopRecording, destroyAll, isRecording, hasPermission, isSpeaking } = useAudioCapture({
    onChunk: ({ data, duration_ms }) => sendRef.current?.({ type: 'audio_chunk', data, duration_ms }),
    onSilenceDetected: () => sendRef.current?.({ type: 'silence_detected' }),
    onVolumeChange: (v) => { setVolume(v); callbacksRef.current.volume?.(v); },
    muted,
  });

  const startRound = useCallback((round) => send({ type: 'start_round', ...(round ? { round } : {}) }), [send]);
  const sendText = useCallback((text) => send({ type: 'candidate_text', text }), [send]);
  const endRound = useCallback(() => { stopRecording(); send({ type: 'end_round' }); }, [send, stopRecording]);
  const cancelInterview = useCallback(() => { stopRecording(); send({ type: 'cancel_interview' }); }, [send, stopRecording]);

  /* Sequential audio playback; notifies the server when a turn's audio finished. */
  const drainQueue = useCallback(async () => {
    if (playingRef.current || audioQueueRef.current.length === 0) return;
    playingRef.current = true;
    setIsPlaying(true);
    while (audioQueueRef.current.length > 0) {
      const item = audioQueueRef.current.shift();
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') await ctx.resume();
        const bin = atob(item.data);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const audioBuf = await ctx.decodeAudioData(buf.buffer);
        await new Promise((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          src.onended = resolve;
          src.start(0);
        });
      } catch (err) {
        console.error('[Audio] playback error', err);
      } finally {
        sendRef.current?.({ type: 'playback_finished', turn_id: item.turn_id });
      }
    }
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) return;
    closedByUsRef.current = false;
    const token = localStorage.getItem('access_token') || '';
    const ws = new WebSocket(`${WS_URL}/ws/interview/${sessionId}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => { setIsConnected(true); setStatus('connected'); reconnectRef.current = 0; };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      switch (msg.type) {
        case 'connected':
          voiceEnabledRef.current = !!msg.voice_enabled;
          setVoiceEnabled(!!msg.voice_enabled);
          if (msg.progress) setProgress(msg.progress);
          if (msg.state) setTurnState(msg.state);
          break;
        case 'session_history':
          if (msg.progress) setProgress(msg.progress);
          callbacksRef.current.onHistory?.(msg);
          break;
        case 'state_change': {
          const s = msg.state;
          setTurnState(s);
          setStateMessage(msg.message || '');
          callbacksRef.current.onStateChange?.(s, msg.message);
          if (msg.redirect) callbacksRef.current.onRedirect?.(msg.redirect);
          if (s === STATES.LISTENING) {
            if (voiceEnabledRef.current && voiceModeRef.current) setTimeout(() => startRecordingRef.current?.(), 120);
          } else {
            stopRecordingRef.current?.();
          }
          break;
        }
        case 'ai_response':
          if (msg.turn_id && seenTurnsRef.current.has(msg.turn_id)) break;   // duplicate guard
          if (msg.turn_id) seenTurnsRef.current.add(msg.turn_id);
          if (msg.progress) setProgress(msg.progress);
          callbacksRef.current.onAITranscript?.({ text: msg.text, turnId: msg.turn_id, meta: msg.question_meta, progress: msg.progress });
          break;
        case 'transcript':
          callbacksRef.current.onCandidateTranscript?.({ text: msg.text, turnId: msg.turn_id, sttLatencyMs: msg.stt_latency_ms });
          break;
        case 'answer_evaluated':
          if (msg.progress) setProgress(msg.progress);
          callbacksRef.current.onEvaluation?.(msg);
          break;
        case 'ai_audio':
          if (voiceModeRef.current) { audioQueueRef.current.push({ data: msg.data, turn_id: msg.turn_id }); drainQueueRef.current?.(); }
          else sendRef.current?.({ type: 'playback_finished', turn_id: msg.turn_id });
          break;
        case 'round_should_end':
          break; // the server finalises the round itself
        case 'round_complete':
          callbacksRef.current.onRoundComplete?.(msg);
          break;
        case 'interview_complete':
          callbacksRef.current.onInterviewComplete?.(msg);
          break;
        case 'interview_cancelled':
          callbacksRef.current.onInterviewComplete?.({ ...msg, cancelled: true });
          break;
        case 'error':
          callbacksRef.current.onError?.(msg.message, msg.code);
          break;
        case 'ping':
          sendRef.current?.({ type: 'pong' });
          break;
        default:
          break;
      }
    };

    ws.onerror = () => setStatus('error');
    ws.onclose = (event) => {
      setIsConnected(false);
      if (closedByUsRef.current) { setStatus('disconnected'); return; }
      if (PERMANENT_CLOSE_CODES.has(event.code)) {
        setStatus('disconnected');
        if (event.code === 4003) callbacksRef.current.onError?.('Session authentication failed. Please sign in again.', 4003);
        if (event.code === 4004) callbacksRef.current.onError?.('Interview session not found.', 4004);
        return;
      }
      if (reconnectRef.current < 5) {
        reconnectRef.current += 1;
        setStatus('reconnecting');
        setTimeout(() => connectRef.current?.(), Math.min(8000, 1000 * 2 ** reconnectRef.current));
      } else {
        setStatus('disconnected');
        callbacksRef.current.onError?.('Connection lost. Please refresh the page to resume.', 'offline');
      }
    };
  }, [sessionId]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
    drainQueueRef.current = drainQueue;
    sendRef.current = send;
    connectRef.current = connect;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    connect();
    return () => {
      closedByUsRef.current = true;
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [connect, enabled]);

  return {
    isConnected, status, turnState, stateMessage, volume, progress, isPlaying,
    isRecording, hasPermission, isSpeaking, voiceEnabled,
    unlockAudio, startRound, sendText, endRound, cancelInterview, startRecording, stopRecording, destroyAll,
  };
}
