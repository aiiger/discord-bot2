import axios from 'axios';

// Set default headers for all axios requests
axios.defaults.headers.common['accept'] = 'application/json';
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Set default timeout
axios.defaults.timeout = 10000; // 10 seconds

// Add response interceptor for better error handling
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response) {
            console.error('API Error Response:', {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            });
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error setting up request:', error.message);
        }
        return Promise.reject(error);
    }
);

export default axios;
