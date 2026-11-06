import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider, Spinner } from './components/ui';

const Landing = lazy(() => import('./pages/Landing'));
const SignIn = lazy(() => import('./pages/SignIn'));
const SignUp = lazy(() => import('./pages/SignUp'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Resume = lazy(() => import('./pages/Resume'));
const InterviewSetup = lazy(() => import('./pages/InterviewSetup'));
const InterviewRoom = lazy(() => import('./pages/InterviewRoom'));
const DSARound = lazy(() => import('./pages/DSARound'));
const Results = lazy(() => import('./pages/Results'));
const History = lazy(() => import('./pages/History'));
const Profile = lazy(() => import('./pages/Profile'));
const QuickPractice = lazy(() => import('./pages/QuickPractice'));

function Fallback() {
  return (
    <div className="min-h-screen bg-bg grid place-items-center">
      <Spinner size={22} />
    </div>
  );
}

const P = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Suspense fallback={<Fallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />

              {/* Authenticated */}
              <Route path="/dashboard" element={<P><Dashboard /></P>} />
              <Route path="/dashboard/:candidateId" element={<Navigate to="/dashboard" replace />} />
              <Route path="/resume" element={<P><Resume /></P>} />
              <Route path="/resume/:candidateId" element={<P><Resume /></P>} />
              <Route path="/upload" element={<Navigate to="/resume" replace />} />
              <Route path="/interview/setup" element={<P><InterviewSetup /></P>} />
              <Route path="/interview/setup/:candidateId" element={<P><InterviewSetup /></P>} />
              <Route path="/lobby/:candidateId" element={<P><InterviewSetup /></P>} />
              <Route path="/interview/:sessionId" element={<P><InterviewRoom /></P>} />
              <Route path="/interview/:sessionId/dsa" element={<P><DSARound /></P>} />
              <Route path="/results/:sessionId" element={<P><Results /></P>} />
              <Route path="/report/:candidateId" element={<P><Results byCandidate /></P>} />
              <Route path="/history" element={<P><History /></P>} />
              <Route path="/profile" element={<P><Profile /></P>} />
              <Route path="/practice" element={<P><QuickPractice /></P>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}
