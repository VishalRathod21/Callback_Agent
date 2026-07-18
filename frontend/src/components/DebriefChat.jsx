import React, { useEffect, useState, useRef } from 'react';
import axios, { API_BASE } from '../api/client';

export default function DebriefChat({ candidateId, roundScores }) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [starterQuestions, setStarterQuestions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  
  const messagesEndRef = useRef(null);

  // 1. Fetch initial context and starter questions
  useEffect(() => {
    const fetchContext = async () => {
      try {
        setLoadingContext(true);
        const res = await axios.get(`${API_BASE}/debrief/${candidateId}/context`);
        if (res.data.starter_questions) {
          setStarterQuestions(res.data.starter_questions);
        }
        // If the candidate already has a conversation, we can either load it or start fresh.
        // We will default to starting fresh but if needed, we could support fetching messages.
      } catch (err) {
        console.error("Error loading debrief context:", err);
      } finally {
        setLoadingContext(false);
      }
    };
    if (candidateId) {
      fetchContext();
    }
  }, [candidateId]);

  // Auto-scroll to bottom of messages area
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSend = async (messageText) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage = messageText.trim();
    setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/debrief/chat`, {
        candidate_id: candidateId,
        message: userMessage,
      });

      if (res.data && res.data.response) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.data.response }]);
      }
    } catch (err) {
      console.error("Error communicating with debrief AI:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I encountered an error. Please try asking again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      try {
        await axios.delete(`${API_BASE}/debrief/${candidateId}/conversation`);
        setMessages([]);
        // Re-fetch context to reset starter questions if needed
        const res = await axios.get(`${API_BASE}/debrief/${candidateId}/context`);
        if (res.data.starter_questions) {
          setStarterQuestions(res.data.starter_questions);
        }
      } catch (err) {
        console.error("Error clearing conversation:", err);
      }
    }
  };

  // Helper to format/parse quotes or score mentions in AI responses
  const formatAiContent = (text) => {
    if (!text) return '';

    // Split text by lines to detect blockquotes, scores, or quotes
    const lines = text.split('\n');
    return lines.map((line, index) => {
      const isQuote = line.trim().startsWith('>') || line.trim().startsWith('"') && line.trim().endsWith('"') || line.includes('score:') || line.includes('Score:');
      
      if (isQuote) {
        return (
          <div 
            key={index} 
            style={{ 
              background: 'rgba(99, 102, 241, 0.06)', 
              borderLeft: '2px solid rgb(99, 102, 241)', 
              paddingLeft: '8px', 
              fontSize: '13px',
              marginTop: '4px',
              marginBottom: '4px',
              borderRadius: '2px'
            }}
          >
            {line.trim().startsWith('>') ? line.replace(/^>\s*/, '') : line}
          </div>
        );
      }
      return <div key={index} style={{ marginBottom: '6px' }}>{line}</div>;
    });
  };

  return (
    <div 
      className="glass-panel" 
      style={{ 
        maxWidth: '840px', 
        width: '100%', 
        margin: '32px auto 0 auto', 
        borderRadius: '16px', 
        background: 'var(--panel-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* HEADER */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--card-border)' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* brain/circuit SVG icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="M12 6v12M6 12h12M12 12a3 3 0 100-6 3 3 0 000 6zm0 0a3 3 0 100 6 3 3 0 000-6z" />
          </svg>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--paper)' }}>
            AI Interview Coach
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {messages.length > 0 && (
            <button 
              onClick={handleClearChat}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--paper-dimmer)', 
                fontSize: '12px', 
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--rec-red)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--paper-dimmer)'}
            >
              Clear chat
            </button>
          )}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--paper-dim)', 
              fontSize: '12px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px'
            }}
          >
            {isOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          {/* MESSAGES AREA */}
          <div 
            style={{ 
              maxHeight: '420px', 
              overflowY: 'auto', 
              padding: '24px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px',
              background: 'rgba(255, 255, 255, 0.01)',
              flex: 1
            }}
          >
            {messages.length === 0 && !loadingContext && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                <div style={{ fontSize: '12px', color: 'var(--paper-dimmer)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ask me anything about your interview:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                  {starterQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '24px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        color: 'var(--paper-dim)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--font-sans)',
                        transition: 'all 0.2s ease',
                      }}
                      className="starter-question-pill"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  width: '100%'
                }}
              >
                <div 
                  style={
                    m.role === 'user'
                      ? {
                          background: 'rgba(99, 102, 241, 0.10)',
                          border: '1px solid rgba(99, 102, 241, 0.20)',
                          borderRadius: '16px 16px 4px 16px',
                          padding: '10px 14px',
                          maxWidth: '70%',
                          fontSize: '14px',
                          color: 'var(--paper)'
                        }
                      : {
                          background: 'var(--panel-bg)',
                          border: '1px solid var(--card-border)',
                          borderRadius: '16px 16px 16px 4px',
                          padding: '12px 16px',
                          maxWidth: '85%',
                          fontSize: '14px',
                          color: 'var(--paper)',
                          lineHeight: '1.65'
                        }
                  }
                >
                  {m.role === 'user' ? m.content : formatAiContent(m.content)}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '8px' }}>
                <div 
                  style={{ 
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '16px 16px 16px 4px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div className="bouncing-loader" style={{ display: 'flex', gap: '4px' }}>
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--paper-dimmer)' }}>
                    Coach is thinking...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* INPUT ROW */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(inputValue);
            }}
            style={{ 
              padding: '16px 20px', 
              borderTop: '1px solid var(--card-border)', 
              display: 'flex', 
              gap: '12px',
              alignItems: 'center',
              background: 'var(--panel-bg)'
            }}
          >
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about your performance, scores, or how to improve..."
              disabled={isLoading}
              style={{
                height: '44px',
                flex: 1,
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid var(--card-border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--paper)',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              className="glass-input"
            />
            <button 
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              style={{
                height: '44px',
                width: '44px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (isLoading || !inputValue.trim()) ? 'not-allowed' : 'pointer',
                opacity: (isLoading || !inputValue.trim()) ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {isLoading ? (
                <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255, 255, 255, 0.2)" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
        </>
      )}

      {/* STYLES FOR BOUNCING AND SPINNER */}
      <style>{`
        .bouncing-loader .dot {
          width: 8px;
          height: 8px;
          background-color: #6366F1;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .bouncing-loader .dot:nth-child(1) { animation-delay: -0.32s; }
        .bouncing-loader .dot:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }

        .starter-question-pill:hover {
          border-color: #6366F1 !important;
          color: #6366F1 !important;
          background: rgba(99, 102, 241, 0.04) !important;
        }

        .spinner {
          animation: rotate 1s linear infinite;
        }
        @keyframes rotate {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
