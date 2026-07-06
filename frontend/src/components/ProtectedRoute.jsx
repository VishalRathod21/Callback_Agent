import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // Render nothing (or a spinner) while the auth check is in-flight
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--stage-black, #0b0d10)',
        color: 'var(--spotlight, #e8c96d)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '14px',
        letterSpacing: '0.1em',
      }}>
        LOADING...
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve the intended destination so we can redirect back after login
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return children;
}
