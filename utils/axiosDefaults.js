<<<<<<< HEAD
// axiosDefaults.js - Global axios configuration
import axios from 'axios';

// Set default headers for all axios requests
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.common['User-Agent'] = 'FACEIT-Bot/1.0';

// Add headers to help with Cloudflare
axios.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate, br';
axios.defaults.headers.common['Accept-Language'] = 'en-US,en;q=0.9';
axios.defaults.headers.common['Cache-Control'] = 'no-cache';
axios.defaults.headers.common['Pragma'] = 'no-cache';
axios.defaults.headers.common['Sec-Fetch-Dest'] = 'document';
axios.defaults.headers.common['Sec-Fetch-Mode'] = 'navigate';
axios.defaults.headers.common['Sec-Fetch-Site'] = 'none';
axios.defaults.headers.common['Sec-Fetch-User'] = '?1';
axios.defaults.headers.common['Upgrade-Insecure-Requests'] = '1';

// Set default timeout
axios.defaults.timeout = 30000; // 30 seconds

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
=======
axios.defaults.baseURL = 'https://api.example.com';
axios.defaults.headers.common['Authorization'] = 'Bearer YOUR_ACCESS_TOKEN';
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98
