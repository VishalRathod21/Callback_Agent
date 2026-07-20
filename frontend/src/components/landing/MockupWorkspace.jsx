import React, { useState, useEffect } from 'react';
import { 
  Mic, Code2, FileText, BarChart3, CheckCircle2, Play, Sparkles, 
  Terminal, ShieldCheck, Cpu, ArrowRight, UserCheck, Zap, Layers 
} from 'lucide-react';

export default function MockupWorkspace() {
  const [activeTab, setActiveTab] = useState('voice');
  const [isSpeaking, setIsSpeaking] = useState(true);
  const [transcriptIndex, setTranscriptIndex] = useState(0);

  const transcripts = [
    "AI Intervewer: 'Let me look at your LRU Cache design. How would you maintain O(1) time complexity for both get and put operations?'",
    "Candidate: 'I can combine a Hash Map for O(1) key lookups with a Doubly Linked List to track usage order in O(1) time.'",
    "AI Interviewer: 'Great approach! What happens when the capacity is exceeded and we need to evict an item?'",
    "Candidate: 'We remove the node right before the tail of the Doubly Linked List, and delete its key from our Hash Map.'"
  ];

  // Cycle transcript messages every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTranscriptIndex((prev) => (prev + 1) % transcripts.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="workspace-mockup-container">
      {/* Window Top Bar Chrome */}
      <div className="workspace-window-header">
        <div className="window-controls">
          <span className="dot dot-close" />
          <span className="dot dot-minimize" />
          <span className="dot dot-maximize" />
          <span className="window-title-badge">
            <Cpu size={12} className="text-zinc-400" />
            <span>Callback AI Session • #8492</span>
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="workspace-tabs">
          <button 
            className={`tab-btn ${activeTab === 'voice' ? 'active' : ''}`}
            onClick={() => setActiveTab('voice')}
          >
            <Mic size={14} />
            <span>Voice Interview</span>
            <span className="live-indicator-dot" />
          </button>
          <button 
            className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            <Code2 size={14} />
            <span>Code IDE</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === 'resume' ? 'active' : ''}`}
            onClick={() => setActiveTab('resume')}
          >
            <FileText size={14} />
            <span>Resume ATS</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={14} />
            <span>Analytics</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="workspace-window-body">
        {activeTab === 'voice' && (
          <div className="tab-pane voice-pane">
            <div className="voice-header-card">
              <div className="interviewer-avatar-box">
                <div className="avatar-ring pulsing" />
                <div className="avatar-core">
                  <Sparkles size={18} className="text-white" />
                </div>
              </div>
              <div className="interviewer-info">
                <div className="interviewer-name-row">
                  <h4>Sarah • Principal AI Engineer</h4>
                  <span className="status-pill">Active Voice</span>
                </div>
                <p className="interviewer-meta">Round 2 of 3 • System Design & Data Structures</p>
              </div>

              <div className="live-waveform-widget">
                <div className="waveform-bar bar-1" />
                <div className="waveform-bar bar-2" />
                <div className="waveform-bar bar-3" />
                <div className="waveform-bar bar-4" />
                <div className="waveform-bar bar-5" />
                <div className="waveform-bar bar-6" />
              </div>
            </div>

            {/* Live Audio Transcript Box */}
            <div className="transcript-box">
              <div className="transcript-meta-header">
                <span className="mono-tag">LIVE TRANSCRIPTION (STT)</span>
                <span className="latency-tag">Latency: 180ms</span>
              </div>
              <div className="transcript-content">
                <p className="transcript-line animated-fade-in" key={transcriptIndex}>
                  {transcripts[transcriptIndex]}
                </p>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="voice-metrics-grid">
              <div className="voice-metric-card">
                <span className="metric-lbl">Pacing / WPM</span>
                <span className="metric-val">142 <small className="text-emerald-400">Optimal</small></span>
              </div>
              <div className="voice-metric-card">
                <span className="metric-lbl">Clarity Score</span>
                <span className="metric-val">96% <small className="text-zinc-400">High</small></span>
              </div>
              <div className="voice-metric-card">
                <span className="metric-lbl">Filler Words</span>
                <span className="metric-val">0.4/min <small className="text-emerald-400">Minimal</small></span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="tab-pane code-pane">
            <div className="code-editor-header">
              <div className="file-tab active">
                <FileText size={13} />
                <span>lru_cache.py</span>
              </div>
              <div className="editor-actions">
                <button className="run-code-btn">
                  <Play size={12} fill="currentColor" />
                  <span>Run Tests</span>
                </button>
              </div>
            </div>
            <div className="code-area">
              <div className="line-numbers">
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
              </div>
              <pre className="code-content">
                <code>
<span className="code-keyword">class</span> <span className="code-title">LRUCache</span>:
    <span className="code-keyword">def</span> <span className="code-func">__init__</span>(self, capacity: int):
        self.cap = capacity
        self.cache = &#123;&#125; <span className="code-comment"># key -&gt; Node</span>
        self.head, self.tail = Node(0, 0), Node(0, 0)
        self.head.next = self.tail
        self.tail.prev = self.head

    <span className="code-keyword">def</span> <span className="code-func">get</span>(self, key: int) -&gt; int:
        <span className="code-keyword">if</span> key <span className="code-keyword">in</span> self.cache:
            self.remove(self.cache[key])
            self.insert(self.cache[key])
            <span className="code-keyword">return</span> self.cache[key].val
        <span className="code-keyword">return</span> -1
                </code>
              </pre>
            </div>
            <div className="code-footer-console">
              <div className="console-line success">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>All 14 Test Cases Passed • Execution time: 1.2ms</span>
              </div>
              <div className="complexity-badge">
                <span>Time: O(1)</span>
                <span>Space: O(N)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'resume' && (
          <div className="tab-pane resume-pane">
            <div className="ats-score-card">
              <div className="ats-left">
                <div className="ats-circle-gauge">
                  <span className="ats-num">94%</span>
                  <span className="ats-lbl">ATS Match</span>
                </div>
              </div>
              <div className="ats-right">
                <h5>Senior Systems Architect Match</h5>
                <p>High relevance to Distributed Systems & React/Python Backend roles.</p>
                <div className="skill-pills-row">
                  <span className="skill-pill match">Python</span>
                  <span className="skill-pill match">React</span>
                  <span className="skill-pill match">PostgreSQL</span>
                  <span className="skill-pill match">Distributed Systems</span>
                  <span className="skill-pill gap">Kubernetes (Recommended)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="tab-pane analytics-pane">
            <div className="analytics-scores-grid">
              <div className="score-widget">
                <div className="score-header">
                  <span>Technical Accuracy</span>
                  <span className="score-percent">92%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: '92%' }} />
                </div>
              </div>
              <div className="score-widget">
                <div className="score-header">
                  <span>System Architecture</span>
                  <span className="score-percent">88%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: '88%' }} />
                </div>
              </div>
              <div className="score-widget">
                <div className="score-header">
                  <span>Behavioral STAR Method</span>
                  <span className="score-percent">95%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: '95%' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Status Badge */}
      <div className="floating-workspace-badge">
        <ShieldCheck size={14} className="text-zinc-300" />
        <span>Enterprise AI Evaluator • Real-Time Scoring</span>
      </div>
    </div>
  );
}
