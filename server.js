const express = require('express');
const path = require('path');
const app = express();

// Configuration
const SECRET_PASSWORD = 'your-secret-password-here'; // Change this to your desired password
const PING_TIMEOUT = 90000; // 90 seconds - systems are considered offline if no ping received
const CLEANUP_INTERVAL = 30000; // 30 seconds - how often to clean up expired systems

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for online systems
const onlineSystems = new Map();

// Periodic cleanup function (more efficient than individual timeouts)
function cleanupExpiredSystems() {
    const now = Date.now();
    const expiredSystems = [];
    
    for (const [systemId, data] of onlineSystems.entries()) {
        if (now - data.lastPing > PING_TIMEOUT) {
            expiredSystems.push(systemId);
        }
    }
    
    expiredSystems.forEach(systemId => {
        console.log(`System ${systemId} went offline (timeout)`);
        onlineSystems.delete(systemId);
    });
}

// Start cleanup interval
setInterval(cleanupExpiredSystems, CLEANUP_INTERVAL);

// API endpoint for systems to ping
app.post('/api/ping', (req, res) => {
    // Handle malformed JSON or missing body
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid or missing JSON body' });
    }
    
    const { password, systemId, systemName, systemType } = req.body;
    
    // Validate password
    if (password !== SECRET_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Validate required fields
    if (!systemId || !systemName) {
        return res.status(400).json({ error: 'systemId and systemName are required' });
    }
    
    const now = Date.now();
    const wasNew = !onlineSystems.has(systemId);
    
    // Update or add system
    onlineSystems.set(systemId, {
        systemName,
        systemType: systemType || 'Unknown',
        lastPing: now,
        firstSeen: onlineSystems.get(systemId)?.firstSeen || now
    });
    
    if (wasNew) {
        console.log(`New system came online: ${systemName} (${systemId})`);
    }
    
    res.json({ 
        success: true, 
        message: 'Ping received',
        nextPingIn: PING_TIMEOUT 
    });
});

// API endpoint for frontend to get online systems
app.get('/api/status', (req, res) => {
    const systems = Array.from(onlineSystems.entries()).map(([id, data]) => ({
        id,
        name: data.systemName,
        type: data.systemType,
        lastPing: data.lastPing,
        uptime: Date.now() - data.firstSeen
    }));
    
    res.json({
        systems,
        lastUpdate: Date.now(),
        totalOnline: systems.length
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        onlineSystems: onlineSystems.size 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server status monitor running on port ${PORT}`);
    console.log(`Ping timeout: ${PING_TIMEOUT / 1000} seconds`);
    console.log(`Cleanup interval: ${CLEANUP_INTERVAL / 1000} seconds`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Server shutting down gracefully');
    process.exit(0);
});
