import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AuthCanvas from './ui/AuthCanvas';
import './AuthLayout.css';

export default function AuthLayout({ 
  children, 
  title, 
  subtitle, 
  authState = 0, // 0: idle, 1: loading, 2: success, 3: error
  error = '' 
}) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [telemetryLogs, setTelemetryLogs] = useState([]);

  // Handle telemetry console logs rotation based on authState
  useEffect(() => {
    const timestamp = () => new Date().toISOString().split('T')[1].slice(0, 8);
    
    let baseLogs = [];
    if (authState === 0) {
      baseLogs = [
        { time: timestamp(), text: 'SYS_INIT // Connection secure.' },
        { time: timestamp(), text: 'NEURAL_CORE // Active on port 8002.' },
        { time: timestamp(), text: 'IDENTITY // Awaiting credentials payload...' }
      ];
    } else if (authState === 1) {
      baseLogs = [
        { time: timestamp(), text: 'SECURE_TRANS // Biometric analysis initialized.' },
        { time: timestamp(), text: 'NEURAL_RING // Decrypting payload...' },
        { time: timestamp(), text: 'DB_VERIFY // Verification transaction pending...' }
      ];
    } else if (authState === 2) {
      baseLogs = [
        { time: timestamp(), text: 'ACCESS_GRANTED // Core identity validated.' },
        { time: timestamp(), text: 'TOKEN_BIND // Initializing user session.' },
        { time: timestamp(), text: 'OS_REDIRECT // Launching workspace dashboard...' }
      ];
    } else if (authState === 3) {
      baseLogs = [
        { time: timestamp(), text: 'ERR_VALIDATION // Credentials rejected by core.' },
        { time: timestamp(), text: 'NEURAL_RING // Disengaged.' },
        { time: timestamp(), text: 'RETRY_WAIT // Ready for next attempt.' }
      ];
    }

    setTelemetryLogs(baseLogs);

    // If loading, add simulated ticks
    if (authState === 1) {
      const interval = setInterval(() => {
        const extraLogs = [
          'CRPT_MATH // Generating session handshake...',
          'SYS_AUDIT // Verifying digital signature...',
          'NODE_SYNC // Authenticating token payload...'
        ];
        const randomLog = extraLogs[Math.floor(Math.random() * extraLogs.length)];
        setTelemetryLogs(prev => [...prev.slice(1), { time: timestamp(), text: randomLog }]);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [authState]);

  return (
    <div className="auth-container">
      {/* Left side: Immersive AI Core */}
      <div 
        className="auth-ai-pane"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="auth-canvas-container">
          <AuthCanvas authState={authState} isHovered={isHovered} />
        </div>

        {/* HUD Top overlay */}
        <div className="auth-hud auth-hud-top">
          <div className="auth-system-logo" onClick={() => navigate('/')}>
            <div className="auth-system-logo-dot" />
            <span>Callback OS // 2.0</span>
          </div>

          <div className="auth-status-chip">
            <div className={`auth-status-dot ${authState === 1 ? 'active' : ''}`} />
            <span>
              {authState === 0 && 'CORE: IDLE'}
              {authState === 1 && 'CORE: PROCESSING'}
              {authState === 2 && 'CORE: ACCEPTED'}
              {authState === 3 && 'CORE: WARNING'}
            </span>
          </div>
        </div>

        {/* HUD Bottom: Telemetry Terminal Output */}
        <div className="auth-hud auth-hud-bottom" style={{ width: '100%' }}>
          <div className="telemetry-code-block" style={{ width: '100%' }}>
            {telemetryLogs.map((log, idx) => (
              <div key={idx} className="telemetry-line">
                <span className="telemetry-time">[{log.time}]</span>
                <span className="telemetry-text">{log.text}</span>
              </div>
            ))}
            <div className="telemetry-line" style={{ marginTop: '4px', opacity: 0.4 }}>
              <span className="telemetry-pulse" />
              <span style={{ marginLeft: '8px' }}>CORE_STREAM // ACTIVE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Glassmorphic Interactive Pane */}
      <div className="auth-interactive-pane">
        <AnimatePresence mode="wait">
          {authState !== 2 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className={`auth-glass-panel ${authState === 3 ? 'auth-shaker' : ''}`}
            >
              <div className="auth-form-content">
                <div style={{ marginBottom: '32px' }}>
                  <h1 style={{
                    color: '#ffffff',
                    fontSize: '28px',
                    fontWeight: 700,
                    letterSpacing: '-0.03em',
                    margin: '0 0 8px 0',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {title}
                  </h1>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '14px',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    {subtitle}
                  </p>
                </div>

                {error && (
                  <div className="auth-error-banner">
                    <span style={{ fontSize: '14px', marginTop: '-1px' }}>⚠️</span>
                    <div>{error}</div>
                  </div>
                )}

                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
