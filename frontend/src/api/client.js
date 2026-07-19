import axios from 'axios';

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:8002/api`;
    }

    return `${protocol}//${hostname}/api`;
  }

  return "http://localhost:8002/api";
};

const API_BASE = getApiUrl();

const client = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies (refresh_token) automatically
});

// ── Refresh Token Mutex ──────────────────────────────────────────────────────
// Prevents concurrent 401 responses from firing multiple refresh calls.
// The backend uses Refresh Token Rotation (RTR) — only one refresh call can
// succeed per token. If two fire simultaneously, the second sees an already-
// consumed token, triggers a security wipe of ALL tokens, and logs out the user.
// This mutex ensures only the FIRST 401 triggers a refresh; all others wait
// for that single refresh to complete and then reuse the new access token.
let _refreshPromise = null;

function _doRefresh() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = axios
    .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      const newToken = res.data?.access_token;
      if (newToken) {
        client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', newToken);
          window.dispatchEvent(
            new CustomEvent('auth-token-refreshed', { detail: { token: newToken } })
          );
        }
        console.log('[API Interceptor] Token refreshed successfully.');
      }
      return newToken;
    })
    .finally(() => {
      _refreshPromise = null;
    });

  return _refreshPromise;
}

// Request interceptor for logging
client.interceptors.request.use(
  (config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor with auto-refresh mechanism on 401
client.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url;

    // Avoid infinite loops: check if error is 401 and not already retried,
    // and that we are not already trying to login or refresh
    if (
      status === 401 &&
      !originalRequest._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh') &&
      !url.includes('/auth/signup')
    ) {
      originalRequest._retry = true;
      console.log('[API Interceptor] 401 Unauthorized detected. Attempting token refresh...');

      try {
        const newAccessToken = await _doRefresh();

        if (newAccessToken) {
          // Retry the original request with the fresh token
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
          return client(originalRequest);
        }
      } catch (refreshError) {
        console.error('[API Interceptor] Token refresh failed. Logging out...', refreshError);

        // Clear auth header
        delete client.defaults.headers.common['Authorization'];

        // Redirect to signin page if browser environment and not already on an auth page
        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          const isAuthPage = ['/signin', '/signup', '/forgot-password', '/reset-password', '/verify-email'].some(p => path.includes(p));
          if (!isAuthPage) {
            window.location.href = '/signin';
          }
        }

        return Promise.reject(refreshError);
      }
    }

    // Normalizing error format for frontend components
    const detail = error.response?.data?.detail;
    let message = 'An unexpected network error occurred.';
    if (detail) {
      message = typeof detail === 'string' ? detail : JSON.stringify(detail);
    } else if (error.message) {
      message = error.message;
    }

    const normalizedError = new Error(message);
    normalizedError.status = status;
    normalizedError.originalError = error;

    return Promise.reject(normalizedError);
  }
);

export { API_BASE };
export default client;