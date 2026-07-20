import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Terminal, Shield, Code2, Globe, Share2, Heart } from 'lucide-react';

export default function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="landing-footer">
      <div className="section-container">
        <div className="footer-top-grid">
          {/* Brand Info */}
          <div className="footer-brand-col">
            <div className="footer-logo" onClick={() => navigate('/')}>
              <div className="logo-icon-box">
                <Sparkles size={16} className="text-white" />
              </div>
              <span className="logo-text">Callback<span className="logo-dot">.ai</span></span>
            </div>
            <p className="footer-brand-desc">
              The premium AI technical interview platform. Recreating full-loop technical, system design, and behavioral interviews with real-time voice and code execution.
            </p>
            <div className="system-status-indicator">
              <span className="status-live-dot" />
              <span>All AI Speech & IDE Services Operational</span>
            </div>
          </div>

          {/* Nav Group 1: Product */}
          <div className="footer-nav-col">
            <h5 className="footer-nav-title">Product</h5>
            <ul className="footer-nav-links">
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#platform">Platform Pillars</a></li>
              <li><a href="#comparison">Comparison</a></li>
              <li><a href="#why-callback">Why Callback</a></li>
              <li><button onClick={() => navigate('/practice')}>Quick Practice</button></li>
            </ul>
          </div>

          {/* Nav Group 2: Tracks */}
          <div className="footer-nav-col">
            <h5 className="footer-nav-title">Interview Tracks</h5>
            <ul className="footer-nav-links">
              <li><a href="#interview-types">Data Structures & Algorithms</a></li>
              <li><a href="#interview-types">System Design & Architecture</a></li>
              <li><a href="#interview-types">Backend Engineering</a></li>
              <li><a href="#interview-types">Frontend Engineering</a></li>
              <li><a href="#interview-types">AI / ML Engineering</a></li>
              <li><a href="#interview-types">Behavioral STAR Round</a></li>
            </ul>
          </div>

          {/* Nav Group 3: Account */}
          <div className="footer-nav-col">
            <h5 className="footer-nav-title">Account</h5>
            <ul className="footer-nav-links">
              <li><button onClick={() => navigate('/signin')}>Sign In</button></li>
              <li><button onClick={() => navigate('/signup')}>Create Account</button></li>
              <li><button onClick={() => navigate('/upload')}>Upload Resume</button></li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom Divider Bar */}
        <div className="footer-bottom-bar">
          <p className="copyright-text">
            © {new Date().getFullYear()} Callback AI Inc. All rights reserved. Designed for software engineers.
          </p>

          <div className="social-links-row">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="social-icon-btn">
              <Code2 size={16} />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" className="social-icon-btn">
              <Globe size={16} />
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="social-icon-btn">
              <Share2 size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
