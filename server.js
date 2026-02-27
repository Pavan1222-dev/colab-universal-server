const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const port = process.env.PORT || 4444;
const app = express();

// 1. NATIVE CORS INTERCEPTOR
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.use(express.json());

// ==========================================
// 2. THE SERVERLESS EMAIL BRIDGE
// ==========================================
// PASTE YOUR GOOGLE WEB APP URL HERE:
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw7P4uSESbZ9aLfptTATmv8J0JhyHX1azii6-VM_CIXNaN4Aybtm_p16GU_eP14bOdpBA/exec"; 

app.post('/api/invite', async (req, res) => {
    console.log("[EMAIL] Routing payload to HTTPS Bridge...");

    try {
        // Failsafe: Did you paste the URL?
        if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
            throw new Error("Google Script URL is missing in server.js!");
        }

        // 1. WE MUST INCLUDE CONTENT-TYPE HEADER!
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        
        // 2. Safely read Google's response (prevents JSON crash)
        const rawText = await response.text();
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            console.error("[GOOGLE HTML ERROR]:", rawText);
            throw new Error("Google returned an HTML page. Deployment settings are wrong.");
        }
        
        if (data.success) {
            console.log("[EMAIL] Successfully blasted through Google servers.");
            res.status(200).json({ success: true, message: "Emails dispatched" });
        } else {
            console.error("[EMAIL SCRIPT ERROR]:", data.error);
            res.status(500).json({ success: false, error: data.error });
        }
    } catch (error) {
        console.error("[NETWORK ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 3. WEBSOCKET ENGINE
// ==========================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const topics = new Map(); 

setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let subscribedTopics = new Set();
    
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (!msg || !msg.type) return;

            switch (msg.type) {
                case 'subscribe':
                    (msg.topics || []).forEach(t => {
                        subscribedTopics.add(t);
                        if (!topics.has(t)) topics.set(t, new Set());
                        topics.get(t).add(ws);
                    });
                    break;
                case 'unsubscribe':
                    (msg.topics || []).forEach(t => {
                        subscribedTopics.delete(t);
                        if (topics.has(t)) topics.get(t).delete(ws);
                    });
                    break;
                case 'publish':
                    if (msg.topic && topics.get(msg.topic)) {
                        topics.get(msg.topic).forEach(r => {
                            if (r !== ws && r.readyState === WebSocket.OPEN) r.send(message);
                        });
                    }
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        subscribedTopics.forEach(t => {
            if (topics.get(t)) {
                topics.get(t).delete(ws);
                if (topics.get(t).size === 0) topics.delete(t);
            }
        });
    });
});

server.listen(port, () => {
    console.log(`[CORE] Universal Server listening on port ${port}`);
});
