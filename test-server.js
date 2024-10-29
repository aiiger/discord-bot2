import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Serve index.html at root
app.get('/', (req, res) => {
    console.log('Serving index.html from:', path.join(__dirname, 'index.html'));
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files
app.use(express.static(__dirname));

app.listen(port, () => {
    console.log(`Test server running at http://localhost:${port}`);
    console.log('Current directory:', __dirname);
    console.log('Files in directory:', require('fs').readdirSync(__dirname));
});
