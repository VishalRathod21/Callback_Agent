import React from 'react';
import { Sparkles, Mic, Code2, Cpu, BarChart2, ShieldCheck, Compass, FileCheck } from 'lucide-react';

export default function SolutionSection() {
  return (
    <section className="solution-section" id="solution">
      <div className="section-container">
        <div className="section-header center">
          <div className="section-eyebrow">THE CALLBACK SOLUTION</div>
          <h2 className="section-title">
            The first AI interview platform that acts like a real Principal Engineer.
          </h2>
          <p className="section-subtitle">
            Callback doesn't just ask canned questions. It listens to your voice, evaluates your code line-by-line, analyzes your resume, and adapts questions dynamically based on your answers.
          </p>
        </div>

        {/* 3 Core Pillars */}
        <div className="solution-pillars-grid">
          <div className="pillar-card">
            <div className="pillar-icon-box">
              <Mic size={24} />
            </div>
            <h3>Conversational Voice AI</h3>
            <p>
              Speak naturally as you write code. Callback’s voice engine understands technical terminology, listens for your reasoning, and interrupts gracefully when needed.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon-box">
              <Code2 size={24} />
            </div>
            <h3>Integrated Coding IDE</h3>
            <p>
              Write, compile, and execute code in real-time. Automated test suites validate your logic, space complexity, and edge cases instantly.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon-box">
              <BarChart2 size={24} />
            </div>
            <h3>Diagnostic Analytics</h3>
            <p>
              Receive a granular scorecard broken down by technical correctness, communication clarity, ATS resume alignment, and a tailored learning roadmap.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
