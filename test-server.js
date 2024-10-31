import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to index.html
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

app.listen(port, () => {
    console.log(`Test server running at http://localhost:${port}`);
});
