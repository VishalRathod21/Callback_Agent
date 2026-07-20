import React, { useState } from 'react';
import { Code2, Server, Layout, Cpu, Database, HeartHandshake, UserCheck, Layers, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function InterviewTypesSection() {
  const navigate = useNavigate();

  const tracks = [
    {
      id: 'dsa',
      title: 'Data Structures & Algorithms',
      icon: Code2,
      topics: 'Arrays, Trees, Graphs, Dynamic Programming, Heap, Two Pointers',
      description: 'Master technical coding problems under live timing with automated test suites and real-time execution.'
    },
    {
      id: 'system-design',
      title: 'System Design & Architecture',
      icon: Server,
      topics: 'Distributed Caching, Load Balancing, Microservices, DB Sharding, Event Queues',
      description: 'Defend high-level system decisions, scalability constraints, and fault-tolerance tradeoffs with senior AI interviewers.'
    },
    {
      id: 'backend',
      title: 'Backend Engineering',
      icon: Database,
      topics: 'API Design, SQL Optimization, Redis, Authentication, Concurrency, Microservices',
      description: 'Practice real-world backend architectural questions, database indexing, and async processing pipelines.'
    },
    {
      id: 'frontend',
      title: 'Frontend Engineering',
      icon: Layout,
      topics: 'React Architecture, State Management, CSS/Layout, Web Performance, DOM APIs',
      description: 'Build complex UI components, debug rendering bottlenecks, and handle state orchestration.'
    },
    {
      id: 'aiml',
      title: 'AI & Machine Learning',
      icon: Cpu,
      topics: 'Transformers, LLM Fine-tuning, RAG, Feature Engineering, Model Evaluation',
      description: 'Discuss modern AI systems, RAG architecture, vector search, embeddings, and model latency tradeoffs.'
    },
    {
      id: 'behavioral',
      title: 'Behavioral & Leadership',
      icon: HeartHandshake,
      topics: 'STAR Method, Conflict Resolution, Project Impact, Cross-functional Communication',
      description: 'Structure your past engineering wins using the STAR framework with objective AI tone & clarity evaluation.'
    },
    {
      id: 'hr',
      title: 'HR & Screen Rounds',
      icon: UserCheck,
      topics: 'Compensation Expectations, Background Walkthrough, Career Goals, Culture Alignment',
      description: 'Prepare tight elevator pitches, articulate career history, and handle initial recruiter screening questions.'
    },
    {
      id: 'datascience',
      title: 'Data Science & Analytics',
      icon: Database,
      topics: 'A/B Testing, SQL Queries, Probability, Statistical Inference, Business Metrics',
      description: 'Solve complex data analytics queries, interpret metrics drift, and design experiment frameworks.'
    },
    {
      id: 'fullstack',
      title: 'Full Stack Engineering',
      icon: Layers,
      topics: 'End-to-end Features, API Integration, State Sync, DB Schema, Security',
      description: 'Demonstrate end-to-end full stack development from React UI down to database persistence.'
    }
  ];

  return (
    <section className="interview-types-section" id="interview-types">
      <div className="section-container">
        <div className="section-header center">
          <div className="section-eyebrow">TAILORED DOMAINS</div>
          <h2 className="section-title">Specialized interview loops for every engineering track.</h2>
          <p className="section-subtitle">
            Select your specific domain to simulate realistic questions curated for top technology companies.
          </p>
        </div>

        <div className="tracks-grid">
          {tracks.map((track) => {
            const IconComp = track.icon;
            return (
              <div key={track.id} className="track-card">
                <div className="track-header">
                  <div className="track-icon-box">
                    <IconComp size={20} className="text-zinc-100" />
                  </div>
                  <h3 className="track-title">{track.title}</h3>
                </div>
                <p className="track-desc">{track.description}</p>
                <div className="track-topics-box">
                  <span className="topics-lbl">Key Topics:</span>
                  <p className="topics-list">{track.topics}</p>
                </div>
                <button className="track-action-btn" onClick={() => navigate('/upload')}>
                  <span>Practice Track</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
