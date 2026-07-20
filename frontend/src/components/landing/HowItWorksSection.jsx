import React, { useState } from 'react';
import { 
  FileUp, BrainCircuit, Users, Mic, Code, Award, BarChart3, FileDiff, MapPin, 
  ArrowRight, CheckCircle2 
} from 'lucide-react';

export default function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      id: 'resume',
      num: '01',
      icon: FileUp,
      title: 'Resume Upload & Parsing',
      subtitle: 'Instant ATS Extraction',
      description: 'Upload your PDF resume. Callback extracts your tech stack, project depth, and experience level to tailor realistic questions.'
    },
    {
      id: 'analysis',
      num: '02',
      icon: BrainCircuit,
      title: 'AI Persona & Role Selection',
      subtitle: 'Targeted Difficulty Tuning',
      description: 'Choose your target role (Frontend, Backend, Distributed Systems, ML) and difficulty level (L4, L5, L6).'
    },
    {
      id: 'panel',
      num: '03',
      icon: Users,
      title: 'Interview Panel Setup',
      subtitle: 'Multi-Persona Dynamics',
      description: 'Meet your synthetic interviewer panel — customized to challenge you on technical depth and system architecture.'
    },
    {
      id: 'voice',
      num: '04',
      icon: Mic,
      title: 'Live Voice Conversation',
      subtitle: 'Natural Sub-200ms Latency',
      description: 'Engage in fluid back-and-forth dialogue. Explain your thought process, answer behavioral questions, and discuss trade-offs.'
    },
    {
      id: 'coding',
      num: '05',
      icon: Code,
      title: 'Real-Time Coding Round',
      subtitle: 'Execution & Test Cases',
      description: 'Solve technical algorithms or system design problems inside our full-featured web IDE with real-time test execution.'
    },
    {
      id: 'evaluation',
      num: '06',
      icon: Award,
      title: 'Instant Evaluation',
      subtitle: 'Objective AI Scoring',
      description: 'No waiting weeks for feedback. Your performance is scored immediately across 12 distinct engineering competencies.'
    },
    {
      id: 'analytics',
      num: '07',
      icon: BarChart3,
      title: 'Deep Analytics Debrief',
      subtitle: 'WPM, Filler Words & Code Complexity',
      description: 'Review transcripts, code efficiency (O(N) analysis), speech pacing, and key moments where your logic stood out or stumbled.'
    },
    {
      id: 'improvement',
      num: '08',
      icon: FileDiff,
      title: 'Resume ATS Optimization',
      subtitle: 'Targeted Bullet Enhancements',
      description: 'Get actionable suggestions to align your resume keywords and achievements with high-paying target job descriptions.'
    },
    {
      id: 'roadmap',
      num: '09',
      icon: MapPin,
      title: 'Personalized Learning Roadmap',
      subtitle: 'Targeted Gap Remediation',
      description: 'Receive a step-by-step study plan focusing specifically on weak areas identified during your interview loop.'
    }
  ];

  return (
    <section className="how-it-works-section" id="how-it-works">
      <div className="section-container">
        {/* Header */}
        <div className="section-header center">
          <div className="section-eyebrow">END-TO-END PIPELINE</div>
          <h2 className="section-title">How Callback transforms your interview readiness.</h2>
          <p className="section-subtitle">
            A complete 9-step simulation pipeline built to mirror the exact hiring process at top technology companies.
          </p>
        </div>

        {/* Pipeline Stepper Pills */}
        <div className="pipeline-stepper-scroll">
          <div className="pipeline-stepper-track">
            {steps.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <button
                  key={step.id}
                  className={`pipeline-step-pill ${activeStep === idx ? 'active' : ''}`}
                  onClick={() => setActiveStep(idx)}
                >
                  <span className="step-pill-num">{step.num}</span>
                  <StepIcon size={14} />
                  <span>{step.title.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Step Feature Display Card */}
        <div className="active-step-card">
          <div className="step-card-left">
            <div className="step-badge-row">
              <span className="step-number-tag">STEP {steps[activeStep].num} OF 09</span>
              <span className="step-subtitle-tag">{steps[activeStep].subtitle}</span>
            </div>
            <h3 className="step-card-title">{steps[activeStep].title}</h3>
            <p className="step-card-desc">{steps[activeStep].description}</p>
            <div className="step-card-nav">
              <button 
                className="step-nav-btn"
                disabled={activeStep === 0}
                onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
              >
                Previous Step
              </button>
              <button 
                className="step-nav-btn primary"
                disabled={activeStep === steps.length - 1}
                onClick={() => setActiveStep(prev => Math.min(steps.length - 1, prev + 1))}
              >
                <span>Next Step</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="step-card-right">
            <div className="step-visual-box">
              <div className="visual-icon-glow">
                {React.createElement(steps[activeStep].icon, { size: 48, className: 'text-zinc-200' })}
              </div>
              <div className="visual-status-pill">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Simulated Pipeline Phase Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
