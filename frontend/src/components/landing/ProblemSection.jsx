import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle, HelpCircle, Code, MicOff, MessageSquareX, Flame } from 'lucide-react';

export default function ProblemSection() {
  return (
    <section className="problem-section" id="problem">
      <div className="section-container">
        {/* Section Header */}
        <div className="section-header center">
          <div className="section-eyebrow">THE PREPARATION GAP</div>
          <h2 className="section-title">
            Solving 300+ LeetCode problems won’t save you from interview anxiety.
          </h2>
          <p className="section-subtitle">
            Most candidates practice code in quiet isolation. But when a real interviewer asks you to speak, explain trade-offs, and handle live follow-ups — everything breaks down.
          </p>
        </div>

        {/* Side-by-Side Comparison: Traditional Practice vs Real Interview Reality */}
        <div className="problem-grid">
          {/* Card 1: Traditional Solitary Prep */}
          <div className="problem-card negative">
            <div className="card-header">
              <div className="badge-pill danger">
                <XCircle size={14} />
                <span>Traditional Prep (LeetCode / Solo Practice)</span>
              </div>
            </div>
            <h3 className="problem-card-title">Silent Coding in Isolation</h3>
            <ul className="problem-list">
              <li>
                <MessageSquareX size={16} className="text-zinc-500" />
                <span>Zero practice speaking out loud while writing algorithms under time pressure.</span>
              </li>
              <li>
                <MicOff size={16} className="text-zinc-500" />
                <span>No interviewer pushing back on edge cases, space complexity, or trade-offs.</span>
              </li>
              <li>
                <AlertTriangle size={16} className="text-zinc-500" />
                <span>Generic test cases with no feedback on your communication or resume background.</span>
              </li>
              <li>
                <HelpCircle size={16} className="text-zinc-500" />
                <span>You don't know why you got rejected — just a canned email weeks later.</span>
              </li>
            </ul>
          </div>

          {/* Card 2: The Real Interview Reality with Callback */}
          <div className="problem-card positive">
            <div className="card-header">
              <div className="badge-pill success">
                <CheckCircle2 size={14} />
                <span>Callback Real-Loop Simulation</span>
              </div>
            </div>
            <h3 className="problem-card-title">Full-Loop Interview Mastery</h3>
            <ul className="problem-list">
              <li>
                <CheckCircle2 size={16} className="text-zinc-200" />
                <span>Practice natural voice conversations with adaptive AI interviewers.</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="text-zinc-200" />
                <span>Interviewer asks realistic follow-ups based on your exact code & resume experience.</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="text-zinc-200" />
                <span>Real-time code execution, syntax validation, and complexity analysis.</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="text-zinc-200" />
                <span>Comprehensive instant evaluation: ATS match, technical accuracy, and improvement roadmap.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
