import React from 'react';
import { Star, Quote, CheckCircle2 } from 'lucide-react';

export default function TestimonialsSection() {
  const testimonials = [
    {
      name: 'Marcus Chen',
      role: 'Senior Backend Engineer',
      company: 'L5 at Meta (Formerly 4x Interview Rejection)',
      quote: 'Callback was the difference between freezing on system design follow-ups and remaining completely calm. The voice AI pushed back on my cache invalidation strategy in the exact same way my Meta interviewer did.',
      avatar: 'MC',
      score: '96% Match'
    },
    {
      name: 'Elena Rostova',
      role: 'Staff Frontend Engineer',
      company: 'Hired at Stripe',
      quote: 'Practicing coding while speaking out loud was my biggest weakness. Callback’s voice-to-text latency is imperceptible. It genuinely felt like talking to a Principal Engineer at Stripe.',
      avatar: 'ER',
      score: 'Offer Accepted'
    },
    {
      name: 'David Kalu',
      role: 'Distributed Systems Engineer',
      company: 'Hired at OpenAI',
      quote: 'The ATS resume analysis and adaptive interview questions matched my exact background. I wasn’t asked generic questions — I was challenged on my actual concurrency implementations.',
      avatar: 'DK',
      score: 'L6 Offer'
    }
  ];

  return (
    <section className="testimonials-section" id="testimonials">
      <div className="section-container">
        <div className="section-header center">
          <div className="section-eyebrow">CANDIDATE SUCCESS</div>
          <h2 className="section-title">From interview anxiety to staff engineer offers.</h2>
          <p className="section-subtitle">
            See how software engineers leveraged Callback to master their technical interview loops.
          </p>
        </div>

        <div className="testimonials-grid">
          {testimonials.map((t, idx) => (
            <div key={idx} className="testimonial-card">
              <div className="card-top-row">
                <div className="stars-row">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={14} fill="#FFFFFF" className="text-white" />
                  ))}
                </div>
                <span className="offer-badge">{t.score}</span>
              </div>
              <p className="testimonial-quote">"{t.quote}"</p>
              <div className="author-info">
                <div className="author-avatar">{t.avatar}</div>
                <div className="author-details">
                  <div className="author-name-row">
                    <h4>{t.name}</h4>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  </div>
                  <p className="author-role">{t.role} • <span className="author-company">{t.company}</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
