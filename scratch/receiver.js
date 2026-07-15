import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 8080;
const OUTPUT_FILE = "C:\\Users\\Village\\.gemini\\antigravity\\scratch\\result.json";

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    if (req.method === 'POST' && req.url === '/data') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
                console.log("Data successfully saved to:", OUTPUT_FILE);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
                
                // Shutdown server after receiving data
                setTimeout(() => {
                    console.log("Shutting down receiver server.");
                    server.close(() => {
                        process.exit(0);
                    });
                }, 1000);
            } catch (err) {
                console.error("Error parsing JSON:", err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'invalid json' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`Receiver server listening on port ${PORT}...`);
});
