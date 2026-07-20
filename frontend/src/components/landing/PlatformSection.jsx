import React from 'react';
import { FileText, Mic, Code2, HeartHandshake, LineChart, TrendingUp, Layers, Check } from 'lucide-react';

export default function PlatformSection() {
  const pillars = [
    {
      icon: FileText,
      title: 'Resume Intelligence',
      desc: 'Parses your background, projects, and target role to ask hyper-relevant technical questions tailored to your experience.'
    },
    {
      icon: Mic,
      title: 'Conversational Voice AI',
      desc: 'Ultra-low latency speech interaction that feels like talking with a human interviewer over Zoom or Google Meet.'
    },
    {
      icon: Code2,
      title: 'Real-Time Coding IDE',
      desc: 'Full-featured web editor supporting Python, JavaScript, TypeScript, C++, and Java with instant test case runner.'
    },
    {
      icon: HeartHandshake,
      title: 'Behavioral STAR Evaluation',
      desc: 'Practice Situation-Task-Action-Result answers for leadership, teamwork, conflicts, and past engineering achievements.'
    },
    {
      icon: LineChart,
      title: 'Comprehensive Analytics',
      desc: 'Detailed breakdown of speech pacing, filler words, technical accuracy, code time/space complexity, and confidence.'
    },
    {
      icon: TrendingUp,
      title: 'Career Growth & Roadmap',
      desc: 'Actionable guidance on how to strengthen your weak topics and update your resume for target tier-1 tech companies.'
    }
  ];

  return (
    <section className="platform-section" id="platform">
      <div className="section-container">
        <div className="section-header center">
          <div className="section-eyebrow">ALL-IN-ONE SYSTEM</div>
          <h2 className="section-title">Everything you need to land your dream tech offer.</h2>
          <p className="section-subtitle">
            No more switching between separate tools for coding, resume review, mock interviews, and feedback. Callback unites every pillar into one connected workflow.
          </p>
        </div>

        <div className="platform-grid">
          {pillars.map((item, idx) => {
            const IconComp = item.icon;
            return (
              <div key={idx} className="platform-card">
                <div className="platform-card-icon">
                  <IconComp size={22} className="text-zinc-100" />
                </div>
                <h3 className="platform-card-title">{item.title}</h3>
                <p className="platform-card-desc">{item.desc}</p>
                <div className="platform-card-footer">
                  <Check size={14} className="text-emerald-400" />
                  <span>Fully Connected to Session Loop</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
