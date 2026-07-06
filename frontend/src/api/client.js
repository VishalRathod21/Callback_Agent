import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:8002/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies (refresh_token) automatically
});

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
        // Attempt to call the refresh endpoint
        const refreshResponse = await axios.post('http://localhost:8002/api/auth/refresh', {}, {
          withCredentials: true
        });

        if (refreshResponse.status === 200 && refreshResponse.data.access_token) {
          const newAccessToken = refreshResponse.data.access_token;
          console.log('[API Interceptor] Token refreshed successfully. Retrying failed request...');

          // Update default authorization header
          client.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;

          // Retry the original request
          return client(originalRequest);
        }
      } catch (refreshError) {
        console.error('[API Interceptor] Token refresh failed. Logging out...', refreshError);
        
        // Clear auth header
        delete client.defaults.headers.common['Authorization'];
        
        // Redirect to signin page if browser environment
        if (typeof window !== 'undefined') {
          window.location.href = '/signin';
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

export default client;
