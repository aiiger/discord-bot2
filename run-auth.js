import { authenticate } from './test-bot.js';

authenticate()
    .then(tokenData => {
        console.log('Authentication completed successfully');
    })
    .catch(error => {
        console.error('Authentication failed:', error);
    });
