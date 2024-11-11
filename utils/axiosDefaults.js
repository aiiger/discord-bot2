// axiosDefaults.js - Global axios configuration
import axios from 'axios';

// Set default headers for all axios requests
axios.defaults.headers.common['Accept'] = 'application/json';

// Set default timeout
axios.defaults.timeout = 10000; // 10 seconds

// Add response interceptor for better error handling
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response) {
            console.error('API Error Response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                url: error.config.url
            });
        } else if (error.request) {
            console.error('No response received:', {
                request: error.request,
                url: error.config.url
            });
        } else {
            console.error('Error setting up request:', error.message);
        }
        return Promise.reject(error);
    }
);

// Don't set default Content-Type header to allow axios to set it based on the request
// This is important for OAuth2 token requests which need application/x-www-form-urlencoded

export default axios;
