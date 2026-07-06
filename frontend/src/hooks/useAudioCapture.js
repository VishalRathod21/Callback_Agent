import { useRef, useState, useCallback, useEffect } from 'react';

export function useAudioCapture({ onChunk, onFlush }) {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyserNodeRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [analyser, setAnalyser] = useState(null);

  const startRecording = useCallback(async () => {
    try {
      // Request mic with settings optimized for speech
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;
      setHasPermission(true);
      console.log('Microphone permission granted');

      // Web Audio API Setup for Visualizer
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNodeRef.current = analyserNode;
      setAnalyser(analyserNode);

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;
      sourceNode.connect(analyserNode);

      // Detect supported MIME type automatically (prefer audio/webm;codecs=opus)
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const recorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        // Ignore tiny empty chunks (< 100 bytes)
        if (event.data && event.data.size > 100) {
          chunksRef.current.push(event.data);

          // Convert chunk to base64 and send
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              const base64 = reader.result.split(',')[1];
              if (base64) {
                console.log('Audio chunk generated');
                onChunk({
                  data: base64,
                  duration_ms: 500, // Send chunks every 500ms
                });
              }
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      recorder.onstop = () => {
        // Flush remaining audio when recording stops
        if (chunksRef.current.length > 0) {
          onFlush();
        }
        setIsRecording(false);
        console.log('Recording stopped');
      };

      // Collect audio in 500ms timeslices for low latency
      recorder.start(500);
      setIsRecording(true);
      console.log('Recording started');

      // Apply initial mute state
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });

    } catch (err) {
      console.error('Mic access error:', err);
      setHasPermission(false);
      setIsRecording(false);
    }
  }, [onChunk, onFlush, isMuted]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping MediaRecorder:', e);
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setAnalyser(null);
    setIsRecording(false);
    console.log('Recording stopped');
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prevMuted) => {
      const nextMuted = !prevMuted;
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !nextMuted;
        });
      }
      return nextMuted;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  return { startRecording, stopRecording, isRecording, hasPermission, isMuted, toggleMute, analyser };
}
