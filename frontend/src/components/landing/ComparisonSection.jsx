import React from 'react';
import { Check, X, Minus, Sparkles } from 'lucide-react';

export default function ComparisonSection() {
  const comparisonData = [
    {
      feature: 'Real-Time Voice AI Interviewer',
      callback: true,
      chatgpt: false,
      leetcode: false,
      interviewingIo: 'human',
      pramp: 'peer'
    },
    {
      feature: 'Integrated Code IDE & Test Runner',
      callback: true,
      chatgpt: false,
      leetcode: true,
      interviewingIo: true,
      pramp: true
    },
    {
      feature: 'Resume-Aware Questions & ATS Matching',
      callback: true,
      chatgpt: 'partial',
      leetcode: false,
      interviewingIo: false,
      pramp: false
    },
    {
      feature: 'Adaptive Follow-Up Questions',
      callback: true,
      chatgpt: 'partial',
      leetcode: false,
      interviewingIo: true,
      pramp: false
    },
    {
      feature: 'Instant Comprehensive Scorecard',
      callback: true,
      chatgpt: 'text',
      leetcode: false,
      interviewingIo: 'manual',
      pramp: 'peer'
    },
    {
      feature: '24/7 Unlimited On-Demand Practice',
      callback: true,
      chatgpt: true,
      leetcode: true,
      interviewingIo: false,
      pramp: false
    },
    {
      feature: 'Affordable Cost Per Practice Session',
      callback: 'Free / Low',
      chatgpt: '$20/mo',
      leetcode: '$35/mo',
      interviewingIo: '$150-$250/session',
      pramp: 'Time matching'
    }
  ];

  const renderStatus = (val) => {
    if (val === true) {
      return (
        <div className="status-cell success">
          <Check size={16} className="text-emerald-400" />
          <span>Yes</span>
        </div>
      );
    }
    if (val === false) {
      return (
        <div className="status-cell danger">
          <X size={16} className="text-zinc-600" />
          <span>No</span>
        </div>
      );
    }
    return <span className="status-text">{val}</span>;
  };

  return (
    <section className="comparison-section" id="comparison">
      <div className="section-container">
        <div className="section-header center">
          <div className="section-eyebrow">HONEST COMPARISON</div>
          <h2 className="section-title">Why candidates choose Callback over traditional alternatives.</h2>
          <p className="section-subtitle">
            An objective breakdown showing how Callback compares against standard preparation tools and expensive mock services.
          </p>
        </div>

        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th className="feature-col">Platform Feature</th>
                <th className="brand-col highlight">
                  <div className="brand-header">
                    <Sparkles size={14} className="text-white" />
                    <span>Callback</span>
                  </div>
                </th>
                <th className="brand-col">ChatGPT</th>
                <th className="brand-col">LeetCode</th>
                <th className="brand-col">Interviewing.io</th>
                <th className="brand-col">Pramp</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row, idx) => (
                <tr key={idx}>
                  <td className="feature-col">{row.feature}</td>
                  <td className="brand-col highlight">{renderStatus(row.callback)}</td>
                  <td className="brand-col">{renderStatus(row.chatgpt)}</td>
                  <td className="brand-col">{renderStatus(row.leetcode)}</td>
                  <td className="brand-col">{renderStatus(row.interviewingIo)}</td>
                  <td className="brand-col">{renderStatus(row.pramp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
