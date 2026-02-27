const WebSocket = require('ws');
const http = require('http');

const port = process.env.PORT || 4444;

// 1. THE HEARTBEAT ENDPOINT (This prevents Render from sleeping)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Co-Lab Universal Matchmaker is ONLINE and routing P2P traffic.');
});

// 2. THE WEBSOCKET ENGINE
const wss = new WebSocket.Server({ server });
const topics = new Map(); // Tracks Room Hashes

// Keep-Alive Ping to pierce strict corporate firewalls
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
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[NETWORK] Node Connected: ${ip}`);

    // Yjs WebRTC Signaling Protocol
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
                        console.log(`[ROUTING] Node joined swarm: ${topicName}`);
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
                                // Broadcast to everyone in the room EXCEPT the sender
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
        } catch (e) {
            // Silently drop non-JSON malware/scanners
        }
    });

    ws.on('close', () => {
        console.log(`[NETWORK] Node Disconnected`);
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
    console.log(`[CORE] Universal Matchmaker initialized on port ${port}`);
});