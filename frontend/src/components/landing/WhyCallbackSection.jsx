import React from 'react';
import { 
  Clock, FileSearch, HelpCircle, Mic, Code, FileCheck, BarChart3, Map, RotateCcw, 
  Sparkles 
} from 'lucide-react';

export default function WhyCallbackSection() {
  const reasons = [
    {
      icon: Clock,
      title: 'Practice Anytime, 24/7',
      desc: 'No scheduling delays, no coordinating with peer mock partners. Run full interviews whenever you are ready.'
    },
    {
      icon: FileSearch,
      title: 'Resume-Aware Context',
      desc: 'Questions are customized to your actual experience, projects, and target role level so practice feels authentic.'
    },
    {
      icon: HelpCircle,
      title: 'Adaptive Follow-Ups',
      desc: 'Callback listens to your logic and challenges your specific assumptions, edge cases, and code efficiency.'
    },
    {
      icon: Mic,
      title: 'Natural Voice Conversations',
      desc: 'Sub-200ms speech latency enables fluid, realistic verbal dialogue without mechanical pauses.'
    },
    {
      icon: Code,
      title: 'Interactive Code IDE',
      desc: 'Execute code with instant test feedback, line-by-line syntax checking, and computational complexity analysis.'
    },
    {
      icon: FileCheck,
      title: 'ATS Resume Optimization',
      desc: 'Receive AI keyword recommendations to align your resume directly with target tech company requirements.'
    },
    {
      icon: BarChart3,
      title: 'Deep Diagnostic Analytics',
      desc: 'Track metrics on WPM speech pacing, filler words, technical accuracy, and structural answer clarity.'
    },
    {
      icon: Map,
      title: 'Personalized Study Roadmap',
      desc: 'Get an automated study plan targeting your exact weak topics discovered during interview loops.'
    },
    {
      icon: RotateCcw,
      title: 'Complete Interview Replay',
      desc: 'Review full audio recordings and timed transcripts of your past sessions to inspect your progress over time.'
    }
  ];

  return (
    <section className="why-callback-section" id="why-callback">
      <div className="section-container">
        <div className="section-header center">
          <div className="section-eyebrow">THE CALLBACK ADVANTAGE</div>
          <h2 className="section-title">Built specifically for engineers targeting top-tier tech roles.</h2>
          <p className="section-subtitle">
            Nine key capabilities engineered to eliminate anxiety and maximize your offer probability.
          </p>
        </div>

        <div className="reasons-grid">
          {reasons.map((item, idx) => {
            const IconComp = item.icon;
            return (
              <div key={idx} className="reason-card">
                <div className="reason-icon-box">
                  <IconComp size={20} className="text-zinc-100" />
                </div>
                <h3 className="reason-title">{item.title}</h3>
                <p className="reason-desc">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
