import React, { useEffect } from 'react';
import Navbar from '../components/ui/Navbar';
import HeroSection from '../components/landing/HeroSection';
import ProblemSection from '../components/landing/ProblemSection';
import SolutionSection from '../components/landing/SolutionSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import PlatformSection from '../components/landing/PlatformSection';
import ComparisonSection from '../components/landing/ComparisonSection';
import InterviewTypesSection from '../components/landing/InterviewTypesSection';
import WhyCallbackSection from '../components/landing/WhyCallbackSection';
import TestimonialsSection from '../components/landing/TestimonialsSection';
import PricingCTA from '../components/landing/PricingCTA';
import Footer from '../components/landing/Footer';
import './Landing.css';

export default function Landing() {
  useEffect(() => {
    // Smooth scroll setup or window title
    document.title = "Callback — Technical AI Interview Platform";
  }, []);

  return (
    <div className="landing-root">
      {/* Global Navbar */}
      <Navbar />

      {/* Landing Page Content Sections */}
      <main className="landing-main">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <PlatformSection />
        <ComparisonSection />
        <InterviewTypesSection />
        <WhyCallbackSection />
        <TestimonialsSection />
        <PricingCTA />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
