import { create } from 'zustand';

export const useInterviewStore = create((set) => ({
  // State
  candidate: null,
  session: null,
  transcript: [],
  isConnected: false,
  isRecording: false,
  currentAudio: null,

  // Actions
  setCandidate: (candidate) => set({ candidate }),
  setSession: (session) => set({ session }),
  addTranscript: (message) => set((state) => ({
    transcript: [...state.transcript, {
      speaker: message.speaker,
      text: message.text,
      timestamp: message.timestamp || new Date().toISOString()
    }]
  })),
  clearTranscript: () => set({ transcript: [] }),
  setConnected: (isConnected) => set({ isConnected }),
  setRecording: (isRecording) => set({ isRecording }),
  setCurrentAudio: (currentAudio) => set({ currentAudio })
}));
