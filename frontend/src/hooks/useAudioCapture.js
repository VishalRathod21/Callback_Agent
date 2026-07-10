import { useRef, useState, useCallback, useEffect } from 'react';

const SILENCE_MS = 1800;   // 1.8s silence → auto submit
const CHUNK_MS   = 400;    // collect audio every 400ms

export function useAudioCapture({ onChunk, onSilenceDetected, onVolumeChange, muted }) {
  const recorderRef   = useRef(null);
  const streamRef     = useRef(null);
  const audioCtxRef   = useRef(null);
  const analyserRef   = useRef(null);
  const silTimerRef   = useRef(null);
  const rafRef        = useRef(null);
  const chunkTimeRef  = useRef(null);
  const activeRef     = useRef(false);   // tracks if we WANT to be recording
  const hasSpokenRef  = useRef(false);   // tracks if speech was detected at least once in the current session
  const startTimeRef  = useRef(0);       // tracks when recording actually started

  const [isRecording,   setIsRecording]   = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [isSpeaking,    setIsSpeaking]    = useState(false);

  // Sync mute state changes with active stream tracks
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }, [muted]);

  // ── Silence timer helpers ──────────────────────────────────
  const clearSilTimer = () => {
    if (silTimerRef.current) {
      clearTimeout(silTimerRef.current);
      silTimerRef.current = null;
    }
  };
  const startSilTimer = useCallback(() => {
    clearSilTimer();
    silTimerRef.current = setTimeout(() => {
      if (activeRef.current) {
        onSilenceDetected?.();
      }
    }, SILENCE_MS);
  }, [onSilenceDetected]);

  // ── Volume analysis loop ───────────────────────────────────
  const startVolumeLoop = useCallback((stream) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;
    src.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!activeRef.current) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += Math.abs(data[i] - 128);
      }
      const avgDeviation = sum / data.length;

      // Scale volume for UI visualizer
      const volume = Math.min(1.0, avgDeviation / 40.0);
      onVolumeChange?.(volume);

      // Speaking threshold (deviation > 3.0 represents voice presence)
      const speaking = avgDeviation > 3.0;
      setIsSpeaking(speaking);

      if (speaking) {
        // Only trigger spoken-once state after the initial 1.0s settling window
        if (Date.now() - startTimeRef.current > 1000) {
          hasSpokenRef.current = true;
        }
        clearSilTimer();
      } else {
        if (hasSpokenRef.current) {
          if (!silTimerRef.current) startSilTimer();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [onVolumeChange, startSilTimer]);

  // ── Create and start a MediaRecorder ──────────────────────
  const startRecorderOnStream = useCallback((stream) => {
    const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    recorderRef.current = rec;
    chunkTimeRef.current = Date.now();

    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size < 50 || !activeRef.current) return;
      const elapsed = Date.now() - (chunkTimeRef.current || Date.now());
      chunkTimeRef.current = Date.now();
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = reader.result?.split(',')[1];
        if (b64 && activeRef.current) onChunk({ data: b64, duration_ms: elapsed });
      };
      reader.readAsDataURL(e.data);
    };

    rec.onerror = () => {
      // Auto-restart recorder on error
      console.warn('[MIC] Recorder error — restarting');
      if (activeRef.current && streamRef.current) {
        setTimeout(() => startRecorderOnStream(streamRef.current), 200);
      }
    };

    rec.onstop = () => {
      // If we still want to record, restart immediately
      if (activeRef.current && streamRef.current?.active) {
        setTimeout(() => startRecorderOnStream(streamRef.current), 100);
      }
    };

    rec.start(CHUNK_MS);
  }, [onChunk]);

  // ── PUBLIC: startRecording ─────────────────────────────────
  const startRecording = useCallback(async () => {
    if (activeRef.current) return;  // already recording
    activeRef.current = true;
    setIsRecording(true);
    hasSpokenRef.current = false; // Reset speech detection for the new recording session
    startTimeRef.current = Date.now();

    try {
      // Reuse existing stream if still alive
      if (!streamRef.current || !streamRef.current.active) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = stream;
        setHasPermission(true);
      }

      // Sync stream tracks with current mute state
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });

      // Always restart volume analysis context for each turn
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
      startVolumeLoop(streamRef.current);
      startRecorderOnStream(streamRef.current);

    } catch (err) {
      console.error('[MIC] Permission denied:', err);
      setHasPermission(false);
      activeRef.current = false;
      setIsRecording(false);
    }
  }, [startVolumeLoop, startRecorderOnStream, muted]);

  // ── PUBLIC: stopRecording ──────────────────────────────────
  const stopRecording = useCallback(() => {
    activeRef.current = false;
    setIsRecording(false);
    setIsSpeaking(false);
    clearSilTimer();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    // Do NOT kill the stream — keep it alive for instant restart
  }, []);

  // ── PUBLIC: destroyAll (on page unmount only) ──────────────
  const destroyAll = useCallback(() => {
    stopRecording();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }, [stopRecording]);

  return { startRecording, stopRecording, destroyAll, isRecording, hasPermission, isSpeaking };
}
