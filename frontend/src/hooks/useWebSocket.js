import { useRef, useState, useCallback, useEffect } from 'react';
import { useAudioCapture } from './useAudioCapture';

export function useWebSocket({ sessionId, onTranscript, onAIResponse, onRoundComplete, onInterviewComplete, onSessionHistory, onRoundShouldEnd }) {
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const currentSourceRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const pingIntervalRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECTS = 3;

  // ── AUDIO CONTEXT UNLOCKING ───────────────────────────────────────────
  const unlockAudioContext = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      console.log('Playback AudioContext unlocked successfully, state:', ctx.state);
    } catch (err) {
      console.error('Failed to unlock playback AudioContext:', err);
    }
  }, []);

  // ── AUDIO PLAYBACK ────────────────────────────────────────────────────
  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Already stopped or finished
      }
      currentSourceRef.current = null;
    }
  }, []);

  const playNextInQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const base64Data = audioQueueRef.current.shift();

    if (!base64Data) {
      isPlayingRef.current = false;
      playNextInQueue();
      return;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceRef.current = source;
      
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
          isPlayingRef.current = false;
          console.log('Audio playback finished');
          playNextInQueue();
        }
      };
      
      source.start(0);
      console.log('Audio playback started');
    } catch (err) {
      console.error('Audio playback error:', err);
      console.log('Audio playback failed');
      isPlayingRef.current = false;
      playNextInQueue();
    }
  }, []);

  const playAudio = useCallback(async (base64Data) => {
    audioQueueRef.current.push(base64Data);
    if (!isPlayingRef.current) {
      await playNextInQueue();
    }
  }, [playNextInQueue]);

  const callbacksRef = useRef({});
  useEffect(() => {
    callbacksRef.current = {
      onTranscript,
      onAIResponse,
      onRoundComplete,
      onInterviewComplete,
      onSessionHistory,
      onRoundShouldEnd
    };
  }, [onTranscript, onAIResponse, onRoundComplete, onInterviewComplete, onSessionHistory, onRoundShouldEnd]);

  // ── WEBSOCKET CONNECTION ──────────────────────────────────────────────
  const connect = useCallback(() => {
    // Avoid creating multiple simultaneous connections (React StrictMode mounts twice)
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already open or connecting, skipping new connect');
      return;
    }
    const WS_URL = `ws://localhost:8002/ws/interview/${sessionId}`;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setConnectionStatus('connecting');

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
      console.log('WebSocket connected');

      // Send keepalive ping every 25 seconds
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* swallow send errors */ }
        }
      }, 25000);
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'connected':
          console.log('Session ready:', msg.session_id);
          break;

        case 'transcript':
          callbacksRef.current.onTranscript?.({ speaker: 'candidate', text: msg.text });
          break;

        case 'ai_response':
          callbacksRef.current.onAIResponse?.({ text: msg.text });
          break;

        case 'audio':
          // Play synthesized audio response
          console.log('Audio message received');
          await playAudio(msg.data);
          break;

        case 'round_complete':
          callbacksRef.current.onRoundComplete?.(msg);
          break;

        case 'interview_complete':
          callbacksRef.current.onInterviewComplete?.(msg);
          break;

        case 'session_history':
          callbacksRef.current.onSessionHistory?.(msg);
          break;

        case 'round_should_end':
          callbacksRef.current.onRoundShouldEnd?.(msg);
          break;

        case 'error':
          console.error('WS server error:', msg.message);
          break;

        case 'ping':
          // Server keepalive — respond immediately
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch (e) {}
          break;

        case 'pong':
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      // Clear ping interval when socket closes
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      setIsConnected(false);
      setConnectionStatus('disconnected');
      console.log('WebSocket disconnected');
      if (reconnectAttemptsRef.current < MAX_RECONNECTS) {
        reconnectAttemptsRef.current++;
        const delay = reconnectAttemptsRef.current * 1500;
        setTimeout(() => connect(), delay);
        setConnectionStatus(`reconnecting (${reconnectAttemptsRef.current}/${MAX_RECONNECTS})`);
      }
    };
  }, [sessionId, playAudio]);

  // ── SEND HELPERS ──────────────────────────────────────────────────────
  const sendMessage = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const startRound = useCallback((round, targetRole, resumeContext = '') => {
    sendMessage({ type: 'start_round', round, target_role: targetRole, resume_context: resumeContext });
  }, [sendMessage]);

  const sendAudioChunk = useCallback((base64Data, durationMs) => {
    sendMessage({ type: 'audio_chunk', data: base64Data, duration_ms: durationMs });
    console.log('Audio chunk sent');
  }, [sendMessage]);

  const flushAudio = useCallback(() => {
    sendMessage({ type: 'audio_flush' });
  }, [sendMessage]);

  const endRound = useCallback(() => {
    sendMessage({ type: 'end_round' });
  }, [sendMessage]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connect();
    return () => {
      try {
        wsRef.current?.close();
      } catch (e) {
        // ignore
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      }
    };
  }, [connect]);

  // ── AUDIO CAPTURE (integrated) ────────────────────────────────────────
  const { startRecording, stopRecording, isRecording, hasPermission, isMuted, toggleMute, analyser } = useAudioCapture({
    onChunk: ({ data, duration_ms }) => sendAudioChunk(data, duration_ms),
    onFlush: flushAudio,
  });

  const submitTypedAnswer = useCallback((text) => {
    sendMessage({ type: 'typed_answer', text });
  }, [sendMessage]);

  return {
    isConnected,
    connectionStatus,
    isRecording,
    hasPermission,
    isMuted,
    toggleMute,
    analyser,
    startRound,
    startRecording,
    stopRecording,
    stopAudioPlayback,
    endRound,
    unlockAudioContext,
    submitTypedAnswer,
  };
}
