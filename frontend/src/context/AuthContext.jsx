import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

// Retry a request fn up to `maxAttempts` times with exponential backoff.
// Only retries on network errors (ERR_CONNECTION_REFUSED, etc.), not 4xx/5xx.
async function fetchWithRetry(fn, maxAttempts = 5, baseDelayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError = !err.response; // axios sets err.response for HTTP errors
      if (!isNetworkError || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.info(`[AuthContext] Backend not ready yet, retrying in ${delay}ms... (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [isLoading, setIsLoading]     = useState(true); // true until initial /me check finishes
  const refreshTimerRef               = useRef(null);

  // ── helpers ────────────────────────────────────────────────────────────────

  const setAccessToken = (token) => {
    if (token) {
      client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('access_token', token);
    } else {
      delete client.defaults.headers.common['Authorization'];
      localStorage.removeItem('access_token');
    }
  };

  const scheduleRefresh = useCallback((delayMs = 14 * 60 * 1000) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await client.post('/auth/refresh');
        setAccessToken(res.data.access_token);
        setUser(res.data.user);
        scheduleRefresh(); // re-schedule for next cycle
      } catch {
        // refresh failed — treat as logged out
        setUser(null);
        setAccessToken(null);
      }
    }, delayMs);
  }, []);

  // ── bootstrap: restore session on page load ────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    if (stored) setAccessToken(stored);

    (async () => {
      try {
        const res = await fetchWithRetry(() => client.get('/auth/me'));
        setUser(res.data);
        scheduleRefresh();
      } catch {
        // token invalid or expired; try silent refresh
        try {
          const ref = await fetchWithRetry(() => client.post('/auth/refresh'));
          setAccessToken(ref.data.access_token);
          setUser(ref.data.user);
          scheduleRefresh();
        } catch {
          setUser(null);
          setAccessToken(null);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  // ── public API ─────────────────────────────────────────────────────────────

  const login = useCallback(async (email, password, rememberMe = false) => {
    const res = await client.post('/auth/login', { email, password, remember_me: rememberMe });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
    scheduleRefresh();
    return res.data.user;
  }, [scheduleRefresh]);

  const register = useCallback(async (fullName, email, password) => {
    const res = await client.post('/auth/signup', { full_name: fullName, email, password });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
    scheduleRefresh();
    return res.data.user;
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    try { await client.post('/auth/logout'); } catch { /* best-effort */ }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setUser(null);
    setAccessToken(null);
  }, []);

  const forgotPassword = useCallback(async (email) => {
    const res = await client.post('/auth/forgot-password', { email });
    return res.data;
  }, []);

  const resetPassword = useCallback(async (token, newPassword) => {
    const res = await client.post('/auth/reset-password', { token, new_password: newPassword });
    return res.data;
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
