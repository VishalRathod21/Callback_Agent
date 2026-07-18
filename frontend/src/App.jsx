import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Auth Context & Route Protection
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Pricing from './pages/Pricing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Upload from './pages/Upload';
import Lobby from './pages/Lobby';
import InterviewRoom from './pages/InterviewRoom';
import DSARound from './pages/DSARound';
import Report from './pages/Report';
import Dashboard from './pages/Dashboard';
import QuickPractice from './pages/QuickPractice';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--stage-black)' }}>
          <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/practice" element={<QuickPractice />} />

              {/* Protected Routes */}
              <Route path="/upload" element={
                <ProtectedRoute>
                  <Upload />
                </ProtectedRoute>
              } />
              <Route path="/lobby/:candidateId" element={
                <ProtectedRoute>
                  <Lobby />
                </ProtectedRoute>
              } />
              <Route path="/interview/:sessionId" element={
                <ProtectedRoute>
                  <InterviewRoom />
                </ProtectedRoute>
              } />
              <Route path="/interview/:sessionId/dsa" element={
                <ProtectedRoute>
                  <DSARound />
                </ProtectedRoute>
              } />
              <Route path="/report/:candidateId" element={
                <ProtectedRoute>
                  <Report />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/:candidateId" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
