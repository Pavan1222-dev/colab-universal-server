const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const nodemailer = require('nodemailer');

const port = process.env.PORT || 4444;
const app = express();

// ==========================================
// 1. NATIVE CORS INTERCEPTOR (No package needed!)
// ==========================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Intercept preflight OPTIONS request instantly
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Co-Lab Universal Matchmaker & Email Node is ONLINE.');
});

// ==========================================
// 2. GMAIL API DISPATCHER
// ==========================================
const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com'; 
const EMAIL_PASS = process.env.EMAIL_PASS || 'your-16-char-app-password'; 

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL
    auth: { 
        user: EMAIL_USER, 
        pass: EMAIL_PASS.replace(/\s/g, '') // Force remove spaces just in case!
    }
});

app.post('/api/invite', async (req, res) => {
    console.log("[EMAIL] Dispatch request received!");
    const { projectName, hash, password, hostName, emails } = req.body;

    if (!emails || emails.length === 0) {
        return res.status(400).json({ error: "No emails provided" });
    }

    try {
        const mailPromises = emails.map(email => {
            const mailOptions = {
                from: `"Co-Lab OS" <${EMAIL_USER}>`,
                to: email,
                subject: `Invitation: Join ${projectName} on Co-Lab`,
                html: `
                <div style="font-family: monospace; background-color: #09090b; color: #e4e4e7; padding: 40px; border-radius: 8px; border: 1px solid #c084fc;">
                    <h1 style="color: #c084fc; text-transform: uppercase; letter-spacing: 2px;">Co-Lab Network Invitation</h1>
                    <p style="font-size: 16px;"><strong>${hostName}</strong> has invited you to a Zero-Trust secure workspace.</p>
                    <hr style="border-color: #27272a; margin: 20px 0;" />
                    <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase;">Workspace Designation</p>
                    <h2 style="color: #fff; margin-top: 0;">${projectName}</h2>
                    
                    <div style="background-color: #000; padding: 20px; border: 1px dashed #c084fc; border-radius: 4px; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0; color: #a1a1aa; text-transform: uppercase; font-size: 12px;">Security Hash:</p>
                        <h3 style="margin: 0; color: #00ff41; letter-spacing: 5px; font-size: 24px;">${hash}</h3>
                        <br/>
                        <p style="margin: 0 0 10px 0; color: #a1a1aa; text-transform: uppercase; font-size: 12px;">Access Password:</p>
                        <h3 style="margin: 0; color: #f472b6; letter-spacing: 2px;">${password}</h3>
                    </div>
                    
                    <p style="font-size: 12px; color: #71717a;">Open your Co-Lab Desktop App, click 'Join Existing Project', and enter these credentials. The Host must approve your entry.</p>
                </div>
                `
            };
            return transporter.sendMail(mailOptions);
        });

        await Promise.all(mailPromises);
        console.log("[EMAIL] All invites dispatched successfully.");
        res.status(200).json({ success: true, message: "Invites dispatched" });
    } catch (error) {
        console.error("[EMAIL ERROR]:", error);
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

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let subscribedTopics = new Set();
    
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (!msg || !msg.type) return;

            switch (msg.type) {
                case 'subscribe':
                    (msg.topics || []).forEach(topicName => {
                        subscribedTopics.add(topicName);
                        if (!topics.has(topicName)) topics.set(topicName, new Set());
                        topics.get(topicName).add(ws);
                    });
                    break;
                case 'unsubscribe':
                    (msg.topics || []).forEach(topicName => {
                        subscribedTopics.delete(topicName);
                        if (topics.has(topicName)) topics.get(topicName).delete(ws);
                    });
                    break;
                case 'publish':
                    if (msg.topic) {
                        const receivers = topics.get(msg.topic);
                        if (receivers) {
                            receivers.forEach(receiver => {
                                if (receiver !== ws && receiver.readyState === WebSocket.OPEN) {
                                    receiver.send(message);
                                }
                            });
                        }
                    }
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        subscribedTopics.forEach(topicName => {
            const subs = topics.get(topicName);
            if (subs) {
                subs.delete(ws);
                if (subs.size === 0) topics.delete(topicName);
            }
        });
    });
});

server.listen(port, () => {
    console.log(`[CORE] Universal Server listening on port ${port}`);
});